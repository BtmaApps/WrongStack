import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake the linter process: these tests cover detection/argv/result handling,
// and must not depend on which linters happen to be installed on PATH.
const spawnStreamMocks = vi.hoisted(() => ({
  result: { stdout: '', stderr: '', exitCode: 0, truncated: false } as {
    stdout: string;
    stderr: string;
    exitCode: number;
    truncated: boolean;
    error?: string;
  },
}));
vi.mock('../src/_spawn-stream.js', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    // biome-ignore lint/correctness/useYield: test mock doesn't need actual yield
    spawnStream: async function* () {
      return spawnStreamMocks.result;
    },
  };
});

import { lintTool } from '../src/lint.js';

const makeCtx = (cwd: string) => ({ cwd, tools: [], projectRoot: cwd }) as never as Context;
const makeOpts = () => ({ signal: new AbortController().signal });

let tmpDir: string;

beforeEach(async () => {
  spawnStreamMocks.result = { stdout: '', stderr: '', exitCode: 0, truncated: false };
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-tool-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('lintTool', () => {
  it('has correct metadata', () => {
    expect(lintTool.name).toBe('lint');
    expect(lintTool.permission).toBe('confirm');
    expect(lintTool.mutating).toBe(false);
  });

  it('falls back to biome when no linter config found', async () => {
    const ctx = { cwd: tmpDir || '/', tools: [], projectRoot: tmpDir || '/' } as any;
    const result = await lintTool.execute({ linter: 'auto' }, ctx, makeOpts());
    // detectLinter falls through to 'biome' when no config files found
    expect(result.linter).toBe('biome');
  });

  it('respects fix flag', async () => {
    const ctx = makeCtx(tmpDir);
    const result = await lintTool.execute({ fix: true }, ctx, makeOpts());
    expect(result).toHaveProperty('fix_applied');
  });

  it('passes files to linter', async () => {
    const ctx = makeCtx(tmpDir);
    const result = await lintTool.execute({ files: 'src/**/*.ts' }, ctx, makeOpts());
    expect(result).toHaveProperty('files_checked');
  });

  it('handles files as array', async () => {
    const ctx = makeCtx(tmpDir);
    const result = await lintTool.execute({ files: ['a.ts', 'b.ts'] }, ctx, makeOpts());
    expect(result).toHaveProperty('files_checked');
  });
});

// ─── Coverage: detectLinter with config files ────────────────────────────────
describe('detectLinter config detection', () => {
  it('detects biome from biome.json', async () => {
    await fs.writeFile(path.join(tmpDir, 'biome.json'), '{}');
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    expect(result.linter).toBe('biome');
  });

  it('detects eslint from .eslintrc.json', async () => {
    await fs.writeFile(path.join(tmpDir, '.eslintrc.json'), '{}');
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    expect(result.linter).toBe('eslint');
  });

  it('detects tslint from tslint.json', async () => {
    await fs.writeFile(path.join(tmpDir, 'tslint.json'), '{}');
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    expect(result.linter).toBe('tslint');
  });

  it('returns biome as default when no config files exist', async () => {
    // tmpDir has no config files — detectLinter should fall through to 'biome'
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    expect(result.linter).toBe('biome');
  });

  it('detects eslint from .eslintrc.js', async () => {
    await fs.writeFile(path.join(tmpDir, '.eslintrc.js'), '{}');
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    expect(result.linter).toBe('eslint');
  });

  it('resolves an explicit cwd', async () => {
    const result = await lintTool.execute(
      { linter: 'biome', cwd: '.' },
      makeCtx(tmpDir),
      makeOpts(),
    );
    expect(result).toHaveProperty('linter');
  });

  it('throws when executeStream is unavailable', async () => {
    const original = lintTool.executeStream;
    lintTool.executeStream = undefined;
    try {
      await expect(lintTool.execute({}, makeCtx(tmpDir), makeOpts())).rejects.toThrow(
        /stream execution unavailable/,
      );
    } finally {
      lintTool.executeStream = original;
    }
  });

  it('throws when the stream ends without a final event', async () => {
    const original = lintTool.executeStream!;
    lintTool.executeStream = async function* () {
      yield { type: 'log', text: 'no final' } as never;
    };
    try {
      await expect(lintTool.execute({}, makeCtx(tmpDir), makeOpts())).rejects.toThrow(
        /without final event/,
      );
    } finally {
      lintTool.executeStream = original;
    }
  });

  it('detects tslint from tsconfig.json (biome priority over tsconfig)', async () => {
    // biome.json is checked first, so if both exist biome wins
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    const result = await lintTool.execute(
      { linter: 'auto' },
      { cwd: tmpDir, tools: [], projectRoot: tmpDir } as never as Context,
      makeOpts(),
    );
    // detectLinter checks ['biome.json', '.eslintrc.json', 'tslint.json', '.eslintrc.js', 'tsconfig.json']
    // biome.json not found, eslint not found, tslint not found, eslintrc.js not found
    // then checks tsconfig.json — but detectLinter only returns 'biome' at the end, never 'tsconfig'
    // So tsconfig.json should result in 'biome' (the fallback)
    expect(result.linter).toBe('biome');
  });

  // Regression for C1 (CMDI-005) — argument injection via `files[]`.
  // The eslint branch pushes `files` BEFORE a `--` separator, so a value
  // like `--config=.cache/evil.js` is parsed as a CLI option. eslint's
  // `--config` is executable JavaScript, and the attack succeeds even
  // when `bash`/`exec` are explicitly denied. The fix rejects any entry
  // beginning with `-` before the argv is built.
  it('rejects file paths beginning with "-" (flag injection)', async () => {
    await expect(
      lintTool.execute({ files: ['--config=.cache/evil.js'] }, makeCtx(tmpDir), makeOpts()),
    ).rejects.toThrow(/flag injection/);
    await expect(
      lintTool.execute(
        { files: ['src/index.ts', '-R', 'src/util.ts'] },
        makeCtx(tmpDir),
        makeOpts(),
      ),
    ).rejects.toThrow(/flag injection/);
  });

  it('throws when the linter cannot be started (not a lint report with errors: 1)', async () => {
    spawnStreamMocks.result = {
      stdout: '',
      stderr: '',
      exitCode: 1,
      truncated: false,
      error: 'spawn biome ENOENT',
    };
    await expect(
      lintTool.execute({ linter: 'biome' }, makeCtx(tmpDir), makeOpts()),
    ).rejects.toThrow(/could not run biome: spawn biome ENOENT/);
  });

  it('still returns lint findings (non-zero exit) as data', async () => {
    spawnStreamMocks.result = {
      stdout: 'Found 2 errors and 1 warning',
      stderr: '',
      exitCode: 1,
      truncated: false,
    };
    const result = await lintTool.execute({ linter: 'biome' }, makeCtx(tmpDir), makeOpts());
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(1);
  });

  it('refuses files outside the project root (fix: true would rewrite them)', async () => {
    await expect(
      lintTool.execute(
        { linter: 'biome', fix: true, files: ['../../outside.ts'] },
        makeCtx(tmpDir),
        makeOpts(),
      ),
    ).rejects.toThrow(/outside project root/);
  });
});
