import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeProjectFixtureDirectory } from '../../core/tests/helpers/project-server-harness.js';
import { verifyMemoryAnchors } from '../src/anchors/verify.js';
import type { Sage } from '../src/types.js';

const execFileAsync = promisify(execFile);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-verify-'));
});

afterEach(async () => {
  await removeProjectFixtureDirectory(tmpDir, { maxRetries: 5, retryDelay: 100 });
});

function makeMemory(overrides: Partial<Sage> = {}): Sage {
  return {
    id: 'mem_test',
    revision: 1,
    scope: 'project',
    kind: 'fact',
    status: 'active',
    text: 'Test memory.',
    importance: 0.5,
    confidence: 0.5,
    freshness: 0.5,
    tags: [],
    anchors: [],
    sources: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('verifyMemoryAnchors', () => {
  it('verifies command anchors whose executable resolves', async () => {
    const memory = makeMemory({
      anchors: [{ type: 'command', command: `"${process.execPath}" --version` }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('verified');
    expect(result.anchors[0]?.status).toBe('verified');
  });

  it('marks command anchors with a missing executable stale', async () => {
    const memory = makeMemory({
      anchors: [{ type: 'command', command: 'definitely-not-a-real-command-xyz-123' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('was not found');
  });

  it('returns unknown for anchor with no path', async () => {
    const memory = makeMemory({
      anchors: [{ type: 'symbol' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('unknown');
    expect(result.anchors[0]?.reason).toContain('Anchor has no path');
  });

  it('returns stale for anchor outside project root', async () => {
    const memory = makeMemory({
      anchors: [{ type: 'file', path: '../outside.ts' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('outside the project root');
  });

  it('returns stale for non-existent path', async () => {
    const memory = makeMemory({
      anchors: [{ type: 'file', path: 'nonexistent.ts' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('no longer exists');
  });

  it('verifies a directory anchor', async () => {
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    const memory = makeMemory({
      anchors: [{ type: 'directory', path: 'src' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('verified');
  });

  it('returns stale when directory anchor points to a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notadir'), 'content', 'utf8');
    const memory = makeMemory({
      anchors: [{ type: 'directory', path: 'notadir' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('non-directory');
  });

  it('verifies a package directory anchor', async () => {
    await fs.mkdir(path.join(tmpDir, 'packages', 'demo'), { recursive: true });
    const memory = makeMemory({
      anchors: [{ type: 'package', path: 'packages/demo' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('verified');
  });

  it('returns stale when package anchor points to a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notapkg'), 'content', 'utf8');
    const memory = makeMemory({
      anchors: [{ type: 'package', path: 'notapkg' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('non-directory');
  });

  it('returns stale when file anchor points to a directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'adir'), { recursive: true });
    const memory = makeMemory({
      anchors: [{ type: 'file', path: 'adir' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('non-file');
  });

  it('detects content hash change', async () => {
    const file = path.join(tmpDir, 'source.ts');
    await fs.writeFile(file, 'original content', 'utf8');
    const memory = makeMemory({
      anchors: [{ type: 'file', path: 'source.ts', contentHash: 'sha256:wronghash' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('content hash changed');
    expect(result.anchors[0]?.contentHash).toBeDefined();
  });

  it('detects missing symbol in file', async () => {
    const file = path.join(tmpDir, 'source.ts');
    await fs.writeFile(file, 'export const foo = 1;\n', 'utf8');
    const memory = makeMemory({
      anchors: [{ type: 'symbol', path: 'source.ts', symbol: 'NonExistentSymbol' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('no longer exists');
  });

  // A symbol anchor is verified by finding the symbol in the anchored file.
  // The matcher used `\b` word boundaries, which are defined on the ASCII word
  // class `[A-Za-z0-9_]` and therefore can NEVER match a symbol whose first or
  // last character is not a word character — `$ref`, `$el`, `$$`, `#priv`,
  // `foo$`. JS/TS identifiers legitimately start with `$` and end with `$`, and
  // ES private class fields start with `#`. Such a symbol was reported as
  // gone even though it was present, which demoted the memory to `stale` and
  // pulled it out of injection (`CONTEXT_STATUSES = ['active']`).
  it('verifies symbols whose first or last character is not a word character', async () => {
    const cases: Array<{ body: string; symbol: string }> = [
      { body: 'const $ref = 1;\n', symbol: '$ref' },
      { body: 'const $el = 1;\n', symbol: '$el' },
      { body: 'class Foo { #priv = 1; }\n', symbol: '#priv' },
      { body: 'let foo$ = 1;\n', symbol: 'foo$' },
      { body: 'const $$ = 1;\n', symbol: '$$' },
    ];
    for (const { body, symbol } of cases) {
      await fs.writeFile(path.join(tmpDir, 'source.ts'), body, 'utf8');
      const memory = makeMemory({
        anchors: [{ type: 'symbol', path: 'source.ts', symbol }],
      });
      const result = await verifyMemoryAnchors(tmpDir, memory);
      expect(result.status, `symbol ${JSON.stringify(symbol)} should verify`).toBe('verified');
    }
  });

  // The boundary case the fix must NOT weaken: a symbol that is genuinely
  // absent still reports stale, and a plain word symbol still verifies.
  it('still reports a genuinely absent symbol as stale', async () => {
    const file = path.join(tmpDir, 'source.ts');
    await fs.writeFile(file, 'const $ref = 1;\n', 'utf8');
    const memory = makeMemory({
      anchors: [{ type: 'symbol', path: 'source.ts', symbol: '$missing' }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
    expect(result.anchors[0]?.reason).toContain('no longer exists');
  });

  it('accepts signal to abort', async () => {
    const abort = new AbortController();
    abort.abort();
    const memory = makeMemory({
      anchors: [{ type: 'file', path: 'source.ts' }],
    });
    await expect(verifyMemoryAnchors(tmpDir, memory, undefined, abort.signal)).rejects.toThrow();
  });

  it('returns verified for a valid file anchor with matching content hash', async () => {
    const file = path.join(tmpDir, 'source.ts');
    await fs.writeFile(file, 'export const x = 1;\n', 'utf8');
    const { createHash } = await import('node:crypto');
    const hash = `sha256:${createHash('sha256').update('export const x = 1;\n').digest('hex')}`;
    const memory = makeMemory({
      anchors: [{ type: 'file', path: 'source.ts', contentHash: hash }],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('verified');
  });

  it('returns unknown for empty anchors list', async () => {
    const result = await verifyMemoryAnchors(tmpDir, makeMemory());
    expect(result.status).toBe('unknown');
  });

  it('aggregates correctly: stale takes precedence over unknown', async () => {
    const memory = makeMemory({
      anchors: [
        { type: 'file', path: 'nonexistent.ts' },
        { type: 'command', command: 'test' },
      ],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    expect(result.status).toBe('stale');
  });

  it('includes checkedAt timestamp', async () => {
    const memory = makeMemory({ anchors: [{ type: 'command', command: 'test' }] });
    const result = await verifyMemoryAnchors(tmpDir, memory, '2026-06-01T00:00:00.000Z');
    expect(result.checkedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('git anchor verification via batched hash-object (D5, 2026-08-02)', () => {
  it('verifies a git anchor and reports stale when the blob changes', async () => {
    const target = path.join(tmpDir, 'src', 'git-probe.ts');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'export const probe = 1;\n');
    await execFileAsync('git', ['init', '-q'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.email', 'probe@test'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.name', 'probe'], { cwd: tmpDir });
    await execFileAsync('git', ['add', 'src/git-probe.ts'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-q', '-m', 'probe'], { cwd: tmpDir });

    const first = await verifyMemoryAnchors(
      tmpDir,
      makeMemory({ anchors: [{ type: 'git', path: 'src/git-probe.ts' }] }),
    );
    expect(first.anchors[0]?.status).toBe('verified');
    const blobHash = first.anchors[0]?.gitBlobHash;
    expect(blobHash).toBeTruthy();

    // Change the file and pin the original hash: the batched prefetch must
    // detect the blob change and mark the anchor stale.
    await fs.writeFile(target, 'export const probe = 2;\n');
    const changed = await verifyMemoryAnchors(
      tmpDir,
      makeMemory({
        anchors: [{ type: 'git', path: 'src/git-probe.ts', gitBlobHash: blobHash }],
      }),
    );
    expect(changed.anchors[0]?.status).toBe('stale');
    expect(changed.anchors[0]?.reason).toBe('Git blob hash changed.');
  }, 30_000);

  it('keeps a mixed existing/missing git batch aligned', async () => {
    const target = path.join(tmpDir, 'src', 'git-probe.ts');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'export const probe = 1;\n');
    const memory = makeMemory({
      anchors: [
        { type: 'git', path: 'src/git-probe.ts' },
        { type: 'git', path: 'src/missing-probe.ts' },
      ],
    });
    const result = await verifyMemoryAnchors(tmpDir, memory);
    // The existing file hashes correctly (index alignment survives the
    // missing-file filter in batchGitBlobHashes)…
    expect(result.anchors[0]?.status).toBe('verified');
    expect(result.anchors[0]?.gitBlobHash).toBeTruthy();
    // …and the missing file fails the existence check before the git branch.
    expect(result.anchors[1]?.status).toBe('stale');
  });
});
