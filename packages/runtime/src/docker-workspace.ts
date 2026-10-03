import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, realpath, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProviderConfig } from '@wrongstack/core/types';
import { buildChildEnv } from '@wrongstack/core/utils';
import { isCredentialEnvName } from './credential-reference.js';

const OWNER_LABEL = 'dev.wrongstack.workspace-owner';
const MAX_OUTPUT = 16 * 1024 * 1024;
const DOCKER_CLIENT_ENV = [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'DOCKER_BUILDKIT',
] as const;

function dockerConnectionEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    DOCKER_CLIENT_ENV.flatMap((key) => {
      const value = process.env[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}
async function removeOwnedTemporary(
  target: string,
  base: string,
  prefix: string,
): Promise<boolean> {
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== base || !path.basename(resolved).startsWith(prefix)) return false;
  try {
    await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
  } catch {
    return false;
  }
}
const EXCLUDED = new Set([
  '.git',
  'node_modules',
  '.temp_files',
  '.reports',
  'dist',
  '.next',
  '.cache',
]);

export interface DockerCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type DockerCommandRunner = (
  args: string[],
  options: {
    signal?: AbortSignal | undefined;
    timeoutMs: number;
    onOutput?: ((text: string) => void) | undefined;
    env?: Readonly<Record<string, string>> | undefined;
  },
) => Promise<DockerCommandResult>;

/** Direct argv execution: neither Docker options nor tool arguments are shell-interpolated. */
export const systemDocker: DockerCommandRunner = (args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildChildEnv({ extra: { ...dockerConnectionEnv(), ...options.env } }),
    });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      child.kill();
    };
    const abort = () => stop(new Error('Docker workspace cancelled'));
    const timer = setTimeout(() => stop(new Error('Docker command timed out')), options.timeoutMs);
    timer.unref?.();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text: string) => {
      size += Buffer.byteLength(text);
      if (size > MAX_OUTPUT) {
        stop(new Error('Docker output exceeds 16 MB'));
        return;
      }
      stdout += text;
      try {
        options.onOutput?.(text);
      } catch (error) {
        stop(error instanceof Error ? error : new Error('Output handler failed'));
      }
    });
    child.stderr.on('data', (text: string) => {
      size += Buffer.byteLength(text);
      if (size > MAX_OUTPUT) {
        stop(new Error('Docker output exceeds 16 MB'));
        return;
      }
      stderr += text;
      try {
        options.onOutput?.(text);
      } catch (error) {
        stop(error instanceof Error ? error : new Error('Output handler failed'));
      }
    });
    const dispose = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    child.on('error', (error) => {
      dispose();
      reject(error);
    });
    child.on('close', (code) => {
      dispose();
      if (failure) reject(failure);
      else resolve({ code: code ?? 1, stdout, stderr });
    });
  });

export interface DockerWorkspaceOptions {
  /** Stable run identity for a durable dispatcher; must be a UUID. */
  id?: string | undefined;
  /** Distinct generation marker; durable dispatchers pass the claimed lease ID. */
  ownerToken?: string | undefined;
  projectRoot: string;
  /** An operator-selected image containing sh, git, and the intended CLI/toolchain. */
  image: string;
  command: string;
  args?: string[] | undefined;
  /** Only these host environment variable NAMES are forwarded, never the whole environment. */
  envNames?: string[] | undefined;
  /** Explicit per-run credentials resolved from existing storage, never process-global mutations. */
  env?: Readonly<Record<string, string>> | undefined;
  providerConfigs?: Readonly<Record<string, ProviderConfig>> | undefined;
  /** Prior cumulative patch, applied to the new source snapshot before the agent runs. */
  initialPatch?: string | undefined;
  /** Durable per-subject CLI home. Only an explicit dispatcher selects this path. */
  conversationDirectory?: string | undefined;
  previousConversationDirectory?: string | undefined;
  network?: 'bridge' | 'none' | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  onOutput?: ((text: string) => void) | undefined;
  runner?: DockerCommandRunner | undefined;
}
export interface DockerWorkspaceResult {
  id: string;
  ownerToken: string;
  exitCode: number;
  snapshotRevision: string;
  patch: string | null;
  output: string;
  cleanup: 'removed' | 'retained' | 'unverified';
  failure?: string | undefined;
}

const SETUP =
  'git init -q && git config user.name WrongStack && git config user.email sandbox@wrongstack.invalid && git add -A && git commit --allow-empty -qm "Workspace snapshot" && git rev-parse HEAD';
const PATCH = 'git add -A && git diff --cached --binary --no-ext-diff HEAD --';

/**
 * Runs the complete command in a copied workspace. No host mounts, Docker socket,
 * local home, or local vault are exposed. Changes are returned as a patch against
 * the imported snapshot; the host project is never edited or reset.
 */
export async function runDockerWorkspace(
  options: DockerWorkspaceOptions,
): Promise<DockerWorkspaceResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(options.image))
    throw new Error('Select a valid trusted Docker image');
  if (!options.command || options.command.startsWith('-') || /[\x00-\x1f]/.test(options.command))
    throw new Error('A command is required');
  const timeoutMs = options.timeoutMs ?? 600_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 86_400_000)
    throw new Error('timeoutMs must be between 1000 and 86400000');
  const envNames = [...new Set([...(options.envNames ?? []), ...Object.keys(options.env ?? {})])];
  for (const name of envNames) {
    if (!isCredentialEnvName(name))
      throw new Error(`Environment variable cannot be forwarded: ${name}`);
  }
  if (options.network !== undefined && options.network !== 'bridge' && options.network !== 'none')
    throw new Error('Unsupported Docker network');
  options.signal?.throwIfAborted();
  const root = await realpath(options.projectRoot);
  if (
    options.id !== undefined &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.id)
  )
    throw new Error('Workspace id must be a UUID');
  const id = options.id ?? randomUUID();
  if (
    options.ownerToken !== undefined &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.ownerToken)
  )
    throw new Error('Workspace ownership token must be a UUID');
  const ownerToken = options.ownerToken ?? randomUUID();
  // This target becomes Docker's immutable ID before any execution or copying.
  let name = `wrongstack-${id}`;
  const runner = options.runner ?? systemDocker;
  const tempBase = await realpath(os.tmpdir());
  const snapshot = await mkdtemp(path.join(tempBase, 'wrongstack-docker-'));
  const run = async (args: string[], duration = 30_000, onOutput?: (text: string) => void) => {
    options.signal?.throwIfAborted();
    const result = await runner(args, {
      signal: options.signal,
      timeoutMs: duration,
      onOutput,
      env: options.env,
    });
    options.signal?.throwIfAborted();
    if (result.code !== 0)
      throw new Error(`Docker command failed (${result.code}): ${result.stderr.slice(-2000)}`);
    return result;
  };
  let created = false;
  let result: DockerWorkspaceResult | undefined;
  let snapshotRevision: string | undefined;
  let temporaryCleanupFailed = false;
  try {
    const nested = path.relative(root, snapshot);
    if (
      nested === '' ||
      (nested !== '..' && !nested.startsWith(`..${path.sep}`) && !path.isAbsolute(nested))
    )
      throw new Error('Project root contains the temporary snapshot directory');
    await cp(root, snapshot, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      filter: (source) => {
        options.signal?.throwIfAborted();
        const relative = path.relative(root, source);
        return !relative.split(path.sep).some((part) => EXCLUDED.has(part));
      },
    });
    options.signal?.throwIfAborted();
    // Mark the attempt before awaiting: Docker may create it just before a cancellation.
    created = true;
    const creation = await run([
      'create',
      '--name',
      name,
      '--label',
      `${OWNER_LABEL}=${ownerToken}`,
      '--network',
      options.network ?? 'bridge',
      '--cap-drop',
      'ALL',
      '--cap-add',
      'CHOWN',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '256',
      '--memory',
      '2g',
      '--cpus',
      '2',
      '--user',
      '1000:1000',
      ...envNames.flatMap((key) => ['--env', key]),
      '--env',
      'HOME=/home/node',
      '--env',
      'WRONGSTACK_HOME=/home/node/.wrongstack',
      '--workdir',
      '/workspace',
      '--entrypoint',
      '/bin/sh',
      options.image,
      '-c',
      'sleep infinity',
    ]);
    if (!/^[a-f0-9]{64}$/.test(creation.stdout.trim()))
      throw new Error('Docker create did not return an immutable container identity');
    name = creation.stdout.trim();
    await run(['start', name]);
    await run(['exec', '--user', '0:0', name, 'mkdir', '-p', '/workspace', '/home/node']);
    await run(['cp', `${snapshot}${path.sep}.`, `${name}:/workspace`], 120_000);
    await run(
      [
        'exec',
        '--user',
        '0:0',
        name,
        'chown',
        '-R',
        '--no-dereference',
        '1000:1000',
        '/workspace',
        '/home/node',
      ],
      120_000,
    );
    if (options.previousConversationDirectory) {
      try {
        await realpath(options.previousConversationDirectory);
        await run(
          [
            'cp',
            `${path.resolve(options.previousConversationDirectory)}${path.sep}.`,
            `${name}:/home/node/.wrongstack`,
          ],
          120_000,
        );
        await run(
          [
            'exec',
            '--user',
            '0:0',
            name,
            'chown',
            '-R',
            '--no-dereference',
            '1000:1000',
            '/home/node/.wrongstack',
          ],
          120_000,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (options.providerConfigs && Object.keys(options.providerConfigs).length) {
      const { writeFile } = await import('node:fs/promises');
      const providerFile = path.join(snapshot, '.wrongstack-provider-config.json');
      await writeFile(providerFile, JSON.stringify(options.providerConfigs), { mode: 0o600 });
      await run(['cp', providerFile, `${name}:/tmp/wrongstack-provider-config.json`]);
      await run([
        'exec',
        '--user',
        '0:0',
        name,
        'chown',
        '1000:1000',
        '/tmp/wrongstack-provider-config.json',
      ]);
      const inject =
        'const fs=require("node:fs"),p=require("node:path");const base="/home/node/.wrongstack";const profile=p.join(base,"profiles/default");for(const v of [base,p.join(base,"profiles"),profile,p.join(profile,"config.json"),p.join(base,"config.json")]){try{if(fs.lstatSync(v).isSymbolicLink())throw new Error("Credential configuration path is a symlink")}catch(e){if(e.code!=="ENOENT")throw e}}fs.mkdirSync(profile,{recursive:true,mode:448});let cfg={};try{cfg=JSON.parse(fs.readFileSync(p.join(profile,"config.json"),"utf8"))}catch(e){if(e.code!=="ENOENT")throw e}const providers=JSON.parse(fs.readFileSync("/tmp/wrongstack-provider-config.json","utf8"));fs.writeFileSync(p.join(profile,"config.json"),JSON.stringify({...cfg,version:1,providers:{...cfg.providers,...providers}}),{mode:384});fs.chmodSync(p.join(profile,"config.json"),384);if(!fs.existsSync(p.join(base,"config.json")))fs.writeFileSync(p.join(base,"config.json"),JSON.stringify({version:1,activeProfile:"default"}),{mode:384});fs.unlinkSync("/tmp/wrongstack-provider-config.json");';
      await run(['exec', name, 'node', '-e', inject]);
      await run([
        'exec',
        '--user',
        '0:0',
        name,
        'chown',
        '-R',
        '--no-dereference',
        '1000:1000',
        '/home/node/.wrongstack',
      ]);
    }
    const initial = await run(
      ['exec', '--workdir', '/workspace', name, '/bin/sh', '-c', SETUP],
      120_000,
    );
    snapshotRevision = initial.stdout.trim();
    if (!/^[a-f0-9]{40,64}$/.test(snapshotRevision))
      throw new Error('Workspace snapshot did not produce a valid revision');
    if (options.initialPatch) {
      if (Buffer.byteLength(options.initialPatch) > MAX_OUTPUT)
        throw new Error('Previous patch exceeds 16 MB');
      const patchPath = path.join(snapshot, '.wrongstack-previous.patch');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(patchPath, options.initialPatch, { mode: 0o600 });
      await run(['cp', patchPath, `${name}:/tmp/wrongstack-previous.patch`]);
      await run([
        'exec',
        '--workdir',
        '/workspace',
        name,
        'git',
        'apply',
        '--index',
        '/tmp/wrongstack-previous.patch',
      ]);
    }
    const execution = await runner(
      ['exec', '--workdir', '/workspace', name, options.command, ...(options.args ?? [])],
      { signal: options.signal, timeoutMs, onOutput: options.onOutput, env: options.env },
    );
    options.signal?.throwIfAborted();
    const patch = await run(
      ['exec', '--workdir', '/workspace', name, '/bin/sh', '-c', PATCH],
      120_000,
    );
    if (options.conversationDirectory) {
      const { mkdir, rename } = await import('node:fs/promises');
      const captureParent = path.dirname(path.resolve(options.conversationDirectory));
      await mkdir(captureParent, { recursive: true, mode: 0o700 });
      // The dispatcher serializes runs of one subject. Stage into a fresh owned
      // directory, so a partial copy cannot overwrite its last good checkpoint.
      const staged = await mkdtemp(path.join(captureParent, '.wrongstack-conversation-'));
      try {
        const copied = await runner(['cp', `${name}:/home/node/.wrongstack/.`, staged], {
          timeoutMs: 120_000,
        });
        if (copied.code === 0) {
          await rename(staged, options.conversationDirectory);
        } else if (!/Could not find|no such|not found/i.test(copied.stderr))
          throw new Error('Conversation checkpoint export failed');
      } finally {
        temporaryCleanupFailed = !(await removeOwnedTemporary(
          staged,
          captureParent,
          '.wrongstack-conversation-',
        ));
      }
    }
    result = {
      id,
      ownerToken,
      exitCode: execution.code,
      snapshotRevision,
      patch: patch.stdout,
      output: execution.stdout + execution.stderr,
      cleanup: 'unverified',
    };
  } catch (error) {
    if (!snapshotRevision) throw error;
    result = {
      id,
      ownerToken,
      exitCode: options.signal?.aborted ? 130 : 1,
      snapshotRevision,
      patch: null,
      output: '',
      cleanup: 'unverified',
      failure: error instanceof Error ? error.message : 'Docker workspace failed',
    };
  } finally {
    if (created) {
      // Failed/unknown probes never authorize deletion. Labels are checked even
      // for our unique name, so a stale or replacement container is left alone.
      try {
        const probe = await runner(
          ['inspect', '--format', `{{.Id}} {{ index .Config.Labels "${OWNER_LABEL}" }}`, name],
          { timeoutMs: 10_000 },
        );
        const [probedId, marker] = probe.stdout.trim().split(/\s+/);
        if (probe.code === 0 && marker === ownerToken && /^[a-f0-9]{64}$/.test(probedId ?? '')) {
          // Preserve partial work after a timeout, cancellation, or failed patch
          // export. Stop the owned container and leave it for explicit recovery.
          const retained = result?.patch === null;
          const cleaned = await runner(
            retained
              ? ['stop', '--time', '2', probedId!]
              : ['rm', '--force', '--volumes', probedId!],
            { timeoutMs: 15_000 },
          );
          if (result && cleaned.code === 0) result.cleanup = retained ? 'retained' : 'removed';
        }
      } catch {
        /* Preserve unverified runtime state instead of deleting by guesswork. */
      }
    }
    if (!(await removeOwnedTemporary(snapshot, tempBase, 'wrongstack-docker-')))
      temporaryCleanupFailed = true;
    if (temporaryCleanupFailed && result) result.cleanup = 'unverified';
  }
  if (!result) throw new Error('Docker workspace did not produce a result');
  return result;
}
