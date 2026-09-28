import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Sage } from '@wrongstack/sage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseMemoryCompanionVerdict,
  snapshotMemoryEvidence,
} from '../../src/fleet/memory-companion-evidence.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-evidence-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
function memory(paths: string[]): Sage {
  return {
    anchors: paths.map((file) => ({ type: 'file', path: file })),
    sources: [],
  } as unknown as Sage;
}
describe('Memory Companion source evidence', () => {
  it('binds evidence to contents and detects a changed anchor hash', async () => {
    await fs.writeFile(path.join(root, 'retry.ts'), 'export const retryQuota = 3;');
    const original = memory(['retry.ts']);
    const first = await snapshotMemoryEvidence(root, original);
    expect(first.files[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    original.anchors[0]!.contentHash = first.files[0]!.hash;
    expect((await snapshotMemoryEvidence(root, original)).changedAnchor).toBe(false);
    await fs.writeFile(path.join(root, 'retry.ts'), 'export const retryQuota = 5;');
    const second = await snapshotMemoryEvidence(root, original);
    expect(second.changedAnchor).toBe(true);
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('never includes outside-project files or oversized contents', async () => {
    await fs.mkdir(path.join(root, 'project'));
    await fs.writeFile(
      path.join(root, 'outside.txt'),
      'external data must not enter the evidence payload',
    );
    await fs.writeFile(path.join(root, 'project', 'large.ts'), 'x'.repeat(65537));
    const result = await snapshotMemoryEvidence(
      path.join(root, 'project'),
      memory(['../outside.txt', 'large.ts', 'missing.ts']),
    );
    expect(result.files).toEqual([]);
    expect(result.unavailable).toEqual(['../outside.txt', 'large.ts', 'missing.ts']);
  });

  it('accepts only citations that occur in the supplied source excerpt', async () => {
    const quote = 'export const retryQuota = 3;';
    await fs.writeFile(path.join(root, 'retry.ts'), quote);
    const snapshot = await snapshotMemoryEvidence(root, memory(['retry.ts']));
    const valid = {
      verdict: 'contradicted',
      summary: 'There is a quota.',
      evidence: [{ path: 'retry.ts', quote }],
    };
    expect(parseMemoryCompanionVerdict(JSON.stringify(valid), snapshot)).toEqual(valid);
    expect(
      parseMemoryCompanionVerdict(
        JSON.stringify({
          ...valid,
          evidence: [{ ...valid.evidence[0], instruction: 'unrelated extra text' }],
        }),
        snapshot,
      ),
    ).toEqual(valid);
    expect(
      parseMemoryCompanionVerdict(
        JSON.stringify({
          ...valid,
          evidence: [{ path: 'retry.ts', quote: 'fabricated source evidence' }],
        }),
        snapshot,
      ),
    ).toBeUndefined();
    expect(
      parseMemoryCompanionVerdict(JSON.stringify({ ...valid, evidence: [] }), snapshot),
    ).toBeUndefined();
    expect(parseMemoryCompanionVerdict('not JSON', snapshot)).toBeUndefined();
    expect(
      parseMemoryCompanionVerdict(
        JSON.stringify({
          verdict: 'unverifiable',
          summary: 'Insufficient evidence.',
          evidence: [],
        }),
        snapshot,
      )?.verdict,
    ).toBe('unverifiable');
  });
});
