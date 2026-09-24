import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoUpdateEnabled,
  standaloneUpdater,
  takeAppliedUpdate,
} from '../src/standalone-auto-update.js';
import { installExecutableFrom } from '../src/standalone-update.js';

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

let root: string;
let dir: string;
let exe: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-autoupdate-'));
  dir = path.join(root, 'updates');
  fs.mkdirSync(dir);
  exe = path.join(root, 'bin', 'wstack.exe');
  fs.mkdirSync(path.dirname(exe));
  fs.writeFileSync(exe, 'old build');
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

/** The pending build as `executable`'s updater sees it. */
const pendingIn = (executable = exe) =>
  standaloneUpdater({ dir, executable, target: 'bun-windows-x64', current: '0.0.0' }).pending();
const elsewhere = () => path.join(root, 'elsewhere', 'wstack.exe');

function stage(version: string, content = `build ${version}`, extra: Record<string, unknown> = {}) {
  const file = path.join(dir, `${version}-wstack-windows-x64.exe`);
  fs.writeFileSync(file, content);
  fs.writeFileSync(
    path.join(dir, 'pending.json'),
    JSON.stringify({
      version,
      file,
      sha256: sha(content),
      target: 'bun-windows-x64',
      executable: exe,
      stagedAt: '2026-09-24T00:00:00.000Z',
      ...extra,
    }),
  );
  return file;
}

describe('autoUpdateEnabled', () => {
  it('is on unless the config or the environment turns it off', () => {
    expect(autoUpdateEnabled(undefined, {})).toBe(true);
    expect(autoUpdateEnabled({ update: { autoDownload: true } } as never, {})).toBe(true);
    expect(autoUpdateEnabled({ update: { autoDownload: false } } as never, {})).toBe(false);
    expect(autoUpdateEnabled(undefined, { WRONGSTACK_NO_AUTO_UPDATE: '1' })).toBe(false);
    expect(autoUpdateEnabled(undefined, { WRONGSTACK_NO_AUTO_UPDATE: '0' })).toBe(true);
  });
});

describe('installExecutableFrom', () => {
  it('swaps the verified copy in', () => {
    const source = path.join(root, 'new');
    fs.writeFileSync(source, 'new build');
    installExecutableFrom(exe, source, sha('new build'), 'win32');
    expect(fs.readFileSync(exe, 'utf8')).toBe('new build');
    expect(fs.readFileSync(`${exe}.old`, 'utf8')).toBe('old build');
    expect(fs.readdirSync(path.dirname(exe)).sort()).toEqual(['wstack.exe', 'wstack.exe.old']);
  });

  it('refuses a file that does not match its digest, leaving the executable alone', () => {
    const source = path.join(root, 'new');
    fs.writeFileSync(source, 'tampered');
    expect(() => installExecutableFrom(exe, source, sha('new build'), 'linux')).toThrow(
      'does not match its digest',
    );
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
    expect(fs.readdirSync(path.dirname(exe))).toEqual(['wstack.exe']);
  });
});

describe('applying the pending build', () => {
  const updater = () =>
    standaloneUpdater({ dir, executable: exe, target: 'bun-windows-x64', current: '1.0.25' });
  const apply = () => updater().apply('linux');

  it('installs a newer pending build once, and reports it once', () => {
    stage('1.0.26');
    expect(apply()).toBe('1.0.26');
    expect(fs.readFileSync(exe, 'utf8')).toBe('build 1.0.26');
    expect(pendingIn()).toBeUndefined();
    expect(fs.readdirSync(dir)).toEqual(['last-applied.json']);
    expect(takeAppliedUpdate(dir)).toEqual({ from: '1.0.25', to: '1.0.26' });
    expect(takeAppliedUpdate(dir)).toBeUndefined();
    expect(apply()).toBeUndefined();
  });

  it('throws away a build that is not newer', () => {
    stage('1.0.25');
    expect(apply()).toBeUndefined();
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("leaves another install's update for that install", () => {
    stage('1.0.26', undefined, { executable: elsewhere() });
    expect(apply()).toBeUndefined();
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
    expect(pendingIn(elsewhere())?.version).toBe('1.0.26');
  });

  it('throws away a staged file changed since it was verified', () => {
    const file = stage('1.0.26');
    fs.writeFileSync(file, 'changed on disk');
    expect(apply).toThrow('does not match its digest');
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('never installs from outside the staging directory', () => {
    const outside = path.join(root, 'outside.exe');
    fs.writeFileSync(outside, 'x');
    stage('1.0.26', undefined, { file: outside, sha256: sha('x') });
    expect(pendingIn()).toBeUndefined();
    expect(apply()).toBeUndefined();
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
  });

  it("clears only this install's pending build after `wstack update`", () => {
    stage('1.0.26', undefined, { executable: elsewhere() });
    updater().clear();
    expect(pendingIn(elsewhere())?.version).toBe('1.0.26');
    stage('1.0.26');
    updater().clear();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('waits for a session that is already swapping or downloading', () => {
    stage('1.0.26');
    fs.writeFileSync(
      path.join(dir, 'update.lock'),
      JSON.stringify({ pid: process.pid, at: Date.now() }),
    );
    expect(apply()).toBeUndefined();
    // An abandoned lock (its process is gone) does not block.
    fs.writeFileSync(path.join(dir, 'update.lock'), JSON.stringify({ pid: 2 ** 22 + 7, at: 0 }));
    expect(apply()).toBe('1.0.26');
  });
});

describe('staging the latest release', () => {
  const binary = Buffer.from('release build 1.0.26');
  const digest = sha(binary);

  function fakeGitHub(options: { attested: boolean }) {
    const attestation = {
      repository_id: 1237163046,
      bundle: {
        dsseEnvelope: {
          payloadType: 'application/vnd.in-toto+json',
          payload: Buffer.from(
            JSON.stringify({
              _type: 'https://in-toto.io/Statement/v1',
              predicateType: 'https://slsa.dev/provenance/v1',
              subject: [{ name: 'wstack-windows-x64.exe', digest: { sha256: digest } }],
              predicate: {
                buildDefinition: {
                  externalParameters: {
                    workflow: {
                      ref: 'refs/tags/v1.0.26',
                      repository: 'https://github.com/WrongStack/WrongStack',
                      path: '.github/workflows/release.yml',
                    },
                  },
                  internalParameters: {
                    github: { event_name: 'push', runner_environment: 'github-hosted' },
                  },
                },
                runDetails: {
                  builder: {
                    id: 'https://github.com/WrongStack/WrongStack/.github/workflows/binaries.yml@refs/tags/v1.0.26',
                  },
                },
              },
            }),
          ).toString('base64'),
        },
      },
    };
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/releases/latest')) {
        return Response.json({
          tag_name: 'v1.0.26',
          assets: [
            {
              name: 'wstack-windows-x64.exe',
              browser_download_url: 'https://dl.test/wstack-windows-x64.exe',
              digest: `sha256:${digest}`,
            },
            { name: 'SHA256SUMS', browser_download_url: 'https://dl.test/SHA256SUMS' },
          ],
        });
      }
      if (url === 'https://dl.test/wstack-windows-x64.exe') return new Response(binary);
      if (url === 'https://dl.test/SHA256SUMS') {
        return new Response(`${digest}  wstack-windows-x64.exe\n`);
      }
      if (url.includes('/attestations/sha256:')) {
        return options.attested
          ? Response.json({ attestations: [attestation] })
          : new Response('{}', { status: 404 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const run = () =>
    standaloneUpdater({
      dir,
      target: 'bun-windows-x64',
      executable: exe,
      current: '1.0.25',
    }).stage();

  it('downloads, verifies and records the newer release', async () => {
    fakeGitHub({ attested: true });
    fs.writeFileSync(path.join(dir, '.partial-abandoned'), 'x');
    const pending = await run();
    expect(pending?.version).toBe('1.0.26');
    expect(pending?.sha256).toBe(digest);
    expect(fs.readFileSync(pending?.file as string)).toEqual(binary);
    expect(pendingIn()).toEqual(pending);
    expect(fs.readdirSync(dir).sort()).toEqual(['1.0.26-wstack-windows-x64.exe', 'pending.json']);
  });

  it('does not download again what is already staged', async () => {
    const fetchMock = fakeGitHub({ attested: true });
    await run();
    const calls = fetchMock.mock.calls.length;
    await run();
    expect(fetchMock.mock.calls.length).toBe(calls + 1); // only the release lookup
  });

  it('stages nothing without a release attestation', async () => {
    fakeGitHub({ attested: false });
    await expect(run()).rejects.toThrow('no build attestation exists');
    expect(pendingIn()).toBeUndefined();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('does nothing when the release is not newer', async () => {
    fakeGitHub({ attested: true });
    await expect(
      standaloneUpdater({
        dir,
        target: 'bun-windows-x64',
        executable: exe,
        current: '1.0.26',
      }).stage(),
    ).resolves.toBeUndefined();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
