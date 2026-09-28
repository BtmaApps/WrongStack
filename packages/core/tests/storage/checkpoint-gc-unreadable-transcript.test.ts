/**
 * Regression: checkpoint GC swallowed a transcript read failure, claiming the
 * age floor kept that safe — but the floor only protects checkpoints younger
 * than it. A truncated archived transcript silently handed every older
 * checkpoint it named to the sweep, which deleted them. And because `pipe` does
 * not forward source errors, a `.jsonl.gz` that failed to open never settled
 * the scan and raised an uncaught 'error' instead. The scan now refuses.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';

const failures = new Map<string, string>();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: (file: string, ...rest: unknown[]) => {
      const code = failures.get(path.basename(String(file)));
      if (!code) return (actual.createReadStream as (...a: unknown[]) => Readable)(file, ...rest);
      const stream = new Readable({ read() {} });
      queueMicrotask(() => stream.destroy(Object.assign(new Error(`${code}: mocked`), { code })));
      return stream;
    },
  };
});

const { collectReachableManifestHashes, sweepCheckpointCas } = await import(
  '../../src/storage/session-checkpoint-gc.js'
);

const OLD = new Date(Date.now() - 90 * 86_400_000);
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let store: string | undefined;

afterEach(async () => {
  failures.clear();
  if (store) await fs.rm(store, { recursive: true, force: true });
  store = undefined;
});

/** A 90-day-old session whose transcript names one manifest -> one blob. */
async function oldCheckpointStore(transcriptName: string, encode: (line: string) => Buffer) {
  store = await fs.mkdtemp(path.join(os.tmpdir(), 'ckpt-gc-'));
  const cas = path.join(store, '_cas');
  const blob = Buffer.from('file contents');
  const blobHash = sha(blob);
  const blobFile = path.join(cas, 'objects', blobHash.slice(0, 2), blobHash.slice(2));
  const manifest = JSON.stringify({ version: 1, entries: [{ blobHash }] });
  const manifestHash = sha(manifest);
  const manifestFile = path.join(cas, 'manifests', `${manifestHash}.json`);
  const transcript = path.join(store, transcriptName);
  await fs.mkdir(path.dirname(blobFile), { recursive: true });
  await fs.mkdir(path.dirname(manifestFile), { recursive: true });
  await fs.writeFile(blobFile, blob);
  await fs.writeFile(manifestFile, manifest);
  await fs.writeFile(
    transcript,
    encode(JSON.stringify({ type: 'checkpoint', workspaceCheckpoint: { manifestHash } })),
  );
  for (const file of [blobFile, manifestFile, transcript]) await fs.utimes(file, OLD, OLD);
  return { cas, manifestFile, blobFile, dir: store };
}

async function sweep(dir: string, cas: string) {
  return sweepCheckpointCas({
    casRoot: cas,
    reachableManifestHashes: await collectReachableManifestHashes(dir),
    keepNewerThanMs: Date.now() - 30 * 86_400_000,
  });
}

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

/** Padding, then the checkpoint line, gzipped, with the stream's tail cut off. */
function truncatedGzip(line: string): Buffer {
  const padding = Array.from({ length: 200 }, (_, i) =>
    JSON.stringify({ i, pad: 'x'.repeat(200) }),
  );
  const gz = gzipSync(`${[...padding, line].join('\n')}\n`);
  return gz.subarray(0, gz.length - 40);
}

describe('checkpoint GC with an unreadable transcript', () => {
  it('refuses on a truncated archived transcript and deletes nothing', async () => {
    const s = await oldCheckpointStore('old.jsonl.gz', truncatedGzip);
    await expect(sweep(s.dir, s.cas)).rejects.toThrow(/Checkpoint GC refused: 1 .*old\.jsonl\.gz/);
    expect([await exists(s.manifestFile), await exists(s.blobFile)]).toEqual([true, true]);
  });

  it('refuses (rather than hanging) when an archived transcript cannot be opened', async () => {
    const s = await oldCheckpointStore('locked.jsonl.gz', (line) => gzipSync(`${line}\n`));
    failures.set('locked.jsonl.gz', 'EACCES');
    await expect(sweep(s.dir, s.cas)).rejects.toThrow(/locked\.jsonl\.gz: EACCES/);
    expect([await exists(s.manifestFile), await exists(s.blobFile)]).toEqual([true, true]);
  });

  it('treats a transcript deleted mid-scan as gone, not unreadable', async () => {
    const s = await oldCheckpointStore('deleted.jsonl', (line) => Buffer.from(`${line}\n`));
    failures.set('deleted.jsonl', 'ENOENT');
    const result = await sweep(s.dir, s.cas);
    expect([result.manifestsDeleted, result.objectsDeleted]).toEqual([1, 1]);
  });

  it('still keeps referenced checkpoints when every transcript is readable', async () => {
    const s = await oldCheckpointStore('ok.jsonl.gz', (line) => gzipSync(`${line}\n`));
    const result = await sweep(s.dir, s.cas);
    expect(result.manifestsDeleted).toBe(0);
    expect([await exists(s.manifestFile), await exists(s.blobFile)]).toEqual([true, true]);
  });
});
