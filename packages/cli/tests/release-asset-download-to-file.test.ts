/**
 * Chunked-write pin for `downloadReleaseAssetToFile` — the background
 * self-update streams 100+ MB assets one network chunk at a time and calls
 * `FileHandle#writeFile` once per chunk.
 *
 * Regression guard (chimera adjudication 2026-10-04): a review claimed
 * `FileHandle#writeFile` "rewrites from offset 0 on every call", which would
 * persist only the final chunk while the SHA-256 — computed over the network
 * stream — still verifies (corrupt asset, green receipt). Refuted on node
 * v24.13.0 (writes at the current position and advances it — see the on-disk
 * assertion below), but the property is load-bearing and unpinned: a refactor
 * to path-based `fsPromises.writeFile` (which truncates) or a Node behavior
 * change would silently corrupt self-update executables. This test fails the
 * moment per-chunk writes stop concatenating.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadReleaseAssetToFile } from '../src/release-asset-download.js';

const CHUNKS = ['AAAA', 'BBBB', 'CCCC'];
const BODY = CHUNKS.join('');

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('downloadReleaseAssetToFile', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'release-asset-'));
    file = path.join(dir, 'asset.bin');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it('streams every chunk into the exclusively-created file — writes append, never overwrite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(streamOf(CHUNKS), { status: 200 })),
    );

    const sha = await downloadReleaseAssetToFile('https://example.test/asset', file, {
      timeoutMs: 1000,
      maxBytes: 1024,
    });

    // Hash covers the whole network stream…
    expect(sha).toBe(createHash('sha256').update(BODY).digest('hex'));
    // …so the on-disk artifact is only correct if per-chunk writes append.
    // With a rewrite-from-offset-0 regression this file would hold 'CCCC'.
    expect(readFileSync(file, 'utf8')).toBe(BODY);
  });

  it('removes the target file when the stream fails mid-download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('AAAA'));
                controller.error(new Error('connection dropped'));
              },
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(
      downloadReleaseAssetToFile('https://example.test/asset', file, {
        timeoutMs: 1000,
        maxBytes: 1024,
      }),
    ).rejects.toThrow('connection dropped');
    // No partial asset may survive a failed self-update download.
    expect(existsSync(file)).toBe(false);
  });
});
