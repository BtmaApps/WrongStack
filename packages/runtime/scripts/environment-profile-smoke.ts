import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  canonicalEnvironmentProfile,
  type EnvironmentProfile,
  type EnvironmentReceipt,
} from '@wrongstack/webui-protocol';
import { verifyAutomationPatch } from '../src/automation/verification.js';
import { runDockerWorkspace, systemDocker } from '../src/docker-workspace.js';

// Real Docker proof: supply existing trusted images. No account, model or project mount.
const option = (name: string) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const image = option('--image');
const redis = option('--redis-image');
if (!image || !redis)
  throw new Error(
    'Usage: bun packages/runtime/scripts/environment-profile-smoke.ts --image <image-with-git-bash-perl> --redis-image <redis-image>',
  );
const base = await realpath(os.tmpdir());
const root = await mkdtemp(path.join(base, 'wrongstack-environment-live-'));
assert.equal(path.dirname(path.resolve(root)), base);
assert(path.basename(root).startsWith('wrongstack-environment-live-'));
const profile: EnvironmentProfile = {
  version: 1,
  name: 'live-proof',
  image,
  setupTimeoutMs: 90_000,
  services: [
    {
      name: 'db',
      image: redis,
      command: ['redis-server', '--save', '', '--appendonly', 'no'],
      healthCommand: ['redis-cli', 'ping'],
      envNames: [],
    },
  ],
  caches: [{ name: 'proof', target: '/home/node/.cache/proof' }],
  ports: [{ name: 'preview', port: 3000, protocol: 'http' }],
  setupCommands: [
    [
      '/bin/sh',
      '-c',
      'if test -f /home/node/.cache/proof/present; then echo CACHE_HIT; else echo CACHE_MISS; touch /home/node/.cache/proof/present; fi; perl /workspace/server.pl >/tmp/environment-server.log 2>&1 &',
    ],
  ],
};
const ping =
  'set -e; exec 3<>/dev/tcp/db/6379; printf "PING\\r\\n" >&3; read -r reply <&3; [[ "$reply" == +PONG* ]]';
let candidateReceipt: EnvironmentReceipt | undefined;
let cache: string | undefined;
let failure: unknown;
let report: Record<string, unknown> | undefined;
try {
  await writeFile(path.join(root, 'value.txt'), 'original\n');
  await writeFile(
    path.join(root, 'server.pl'),
    'use IO::Socket::INET; my $s=IO::Socket::INET->new(LocalAddr=>"0.0.0.0",LocalPort=>3000,Listen=>8,ReuseAddr=>1) or die $!; while(my $c=$s->accept()){print $c "HTTP/1.1 200 OK\\r\\nContent-Length: 10\\r\\nConnection: close\\r\\n\\r\\nenv-ready\\n"; close $c;}\n',
  );
  const candidate = await runDockerWorkspace({
    projectRoot: root,
    image,
    command: '/bin/bash',
    args: ['-c', `${ping}; printf 'fixed\\n' > value.txt`],
    environment: profile,
    captureTreeIdentity: true,
    onEnvironmentUpdate: async (receipt) => {
      candidateReceipt = receipt;
      cache ??= receipt.caches[0]?.volume ?? undefined;
      if (receipt.status !== 'ready') return;
      const port = receipt.ports[0]!.hostPort;
      let response = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          response = await (
            await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })
          ).text();
          if (response === 'env-ready\n') break;
        } catch {
          /* Wait for the fixture socket to listen. */
        }
        await delay(50);
      }
      assert.equal(response, 'env-ready\n', 'Published loopback preview must serve real HTTP');
    },
  });
  assert.equal(candidate.exitCode, 0, candidate.failure);
  assert.equal(candidate.cleanup, 'removed');
  assert.equal(candidateReceipt?.status, 'removed');
  assert(candidateReceipt.setup[0]!.output.includes('CACHE_MISS'));
  assert(candidate.patch?.includes('+fixed'));
  let checkedReceipt: EnvironmentReceipt | undefined;
  const checked = await verifyAutomationPatch(
    {
      projectRoot: root,
      image,
      environment: profile,
      verification: {
        commands: [['/bin/bash', '-c', `${ping}; test "$(cat value.txt)" = fixed`]],
        timeoutMs: 30_000,
      },
    },
    candidate,
    new AbortController().signal,
    async (options) => {
      const result = await runDockerWorkspace(options);
      checkedReceipt = result.environment;
      return result;
    },
  );
  assert.equal(checked.validation.status, 'passed', checked.validation.reason);
  assert.equal(checkedReceipt?.status, 'removed');
  assert(
    checkedReceipt.setup[0]!.output.includes('CACHE_MISS'),
    'Verifier must start with an empty cache',
  );
  assert.equal(checkedReceipt.ports.length, 0, 'Verifier must publish no preview port');
  assert.equal(checkedReceipt.services[0]!.imageId, candidateReceipt.services[0]!.imageId);
  const second = await runDockerWorkspace({
    projectRoot: root,
    image,
    command: '/bin/true',
    environment: profile,
  });
  assert.equal(second.exitCode, 0, second.failure);
  assert.equal(second.cleanup, 'removed');
  assert(
    second.environment?.setup[0]?.output.includes('CACHE_HIT'),
    'Candidate runs must reuse their project/profile cache',
  );
  assert.equal(second.environment.caches[0]!.volume, cache);
  assert.equal(await readFile(path.join(root, 'value.txt'), 'utf8'), 'original\n');
  report = {
    result: 'PASS',
    candidateImage: candidate.imageId,
    serviceImage: candidateReceipt.services[0]!.imageId,
    profileFingerprint: candidateReceipt.fingerprint,
    loopbackHTTP: 'PASS',
    serviceDNSAndPing: 'PASS',
    candidateCacheReuse: 'PASS',
    verifierFreshCache: 'PASS',
    verifierNoPublishedPorts: 'PASS',
    hostSourceUnchanged: 'PASS',
    cleanup: [candidate.cleanup, checkedReceipt.status, second.cleanup],
  };
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (error) {
    failure ??= error;
  }
}
if (failure) throw failure;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function cleanup() {
  if (cache) {
    const scope = createHash('sha256')
      .update(
        `${root}\0${createHash('sha256').update(canonicalEnvironmentProfile(profile)).digest('hex')}`,
      )
      .digest('hex');
    assert(cache === `wrongstack-cache-${scope.slice(0, 40)}-proof`);
    const probe = await systemDocker(
      ['volume', 'inspect', '--format', '{{ index .Labels "dev.wrongstack.cache-scope" }}', cache],
      { timeoutMs: 10_000 },
    );
    if (probe.code === 0 && probe.stdout.trim() === scope) {
      const removed = await systemDocker(['volume', 'rm', cache], { timeoutMs: 10_000 });
      assert.equal(removed.code, 0, 'Owned proof cache cleanup failed');
    } else throw new Error('Owned proof cache identity could not be verified; left in place');
  }
  // The fixture is the only host directory this proof can remove.
  await rm(root, { recursive: true, force: true });
}
