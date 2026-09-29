import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Control ripgrep availability + output so the rg glob path runs deterministically.
const cfg: {
  versionThrows: boolean;
  versionCode: number;
  files: string[];
  findErrors: boolean;
  /** exit code of `rg --files` (1 = "no files matched", 2 = usage/parse error). */
  findCode: number;
  /** args of the last `rg --files` spawn, so a test can assert what rg received. */
  lastFindArgs: string[];
} = {
  versionThrows: false,
  versionCode: 0,
  files: [],
  findErrors: false,
  findCode: 0,
  lastFindArgs: [],
};

vi.mock('node:child_process', async (orig) => {
  const actual = await orig<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (_cmd: string, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter };
      child.stdout = new EventEmitter();
      const isVersion = args.includes('--version');
      if (isVersion && cfg.versionThrows) throw new Error('spawn rg ENOENT (sync)');
      if (!isVersion) cfg.lastFindArgs = args;
      process.nextTick(() => {
        if (isVersion) {
          child.emit('close', cfg.versionCode); // checkRg: 0 = available
          return;
        }
        // spawnRgFind: optionally error, else emit the file list then close.
        if (cfg.findErrors) {
          child.emit('error', new Error('rg find failed'));
          return;
        }
        if (cfg.files.length) child.stdout.emit('data', Buffer.from(`${cfg.files.join('\n')}\n`));
        child.emit('close', cfg.findCode);
      });
      return child;
    },
  };
});

import { __resetRgDetectionForTests, replaceTool } from '../src/replace.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'replace-rg-'));
  cfg.versionThrows = false;
  cfg.versionCode = 0;
  cfg.files = [];
  cfg.findErrors = false;
  cfg.findCode = 0;
  cfg.lastFindArgs = [];
  // rg availability is memoized per process; each test varies it via cfg.
  __resetRgDetectionForTests();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const ctx = () => ({ cwd: dir, projectRoot: dir, tools: [] }) as never as Context;
const opts = () => ({ signal: new AbortController().signal });

describe('replaceTool ripgrep glob path (faked rg)', () => {
  it('uses rg --files output to drive the replacement when rg is available', async () => {
    const file = path.join(dir, 'a.ts');
    await fs.writeFile(file, 'const OLD = 1;');
    cfg.versionCode = 0; // rg available
    cfg.files = [file]; // rg --files returns this path
    const result = await replaceTool.execute(
      { pattern: 'OLD', replacement: 'NEW', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('const NEW = 1;');
  });

  it('falls back to the native walker when rg is unavailable', async () => {
    const file = path.join(dir, 'b.ts');
    await fs.writeFile(file, 'foo foo');
    cfg.versionCode = 1; // rg --version exits non-zero → unavailable
    const result = await replaceTool.execute(
      { pattern: 'foo', replacement: 'bar', files: '**/*.ts' },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(2);
  });

  it('falls back to the native walker when the rg probe throws synchronously', async () => {
    const file = path.join(dir, 'c.ts');
    await fs.writeFile(file, 'x');
    cfg.versionThrows = true; // checkRg outer catch → resolve(false)
    const result = await replaceTool.execute(
      { pattern: 'x', replacement: 'y', files: '**/*.ts' },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(1);
  });

  it('throws on an unsafe (catastrophic-backtracking) pattern', async () => {
    await expect(
      replaceTool.execute({ pattern: '(a+)+', replacement: 'x', files: 'a.ts' }, ctx(), opts()),
    ).rejects.toThrow(/replace:/);
  });

  it('applies the extra glob filter on the rg path (previously dropped)', async () => {
    const keep = path.join(dir, 'keep.ts');
    const skip = path.join(dir, 'skip.md');
    await fs.writeFile(keep, 'TARGET');
    await fs.writeFile(skip, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [keep, skip]; // rg enumerates both; glob must narrow to .ts
    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: '*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(keep, 'utf8')).toBe('DONE');
    expect(await fs.readFile(skip, 'utf8')).toBe('TARGET');
  });

  it('applies subpath extra glob filter on the rg path', async () => {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'other'), { recursive: true });
    const keep = path.join(dir, 'src', 'keep.ts');
    const skip = path.join(dir, 'other', 'skip.ts');
    await fs.writeFile(keep, 'TARGET');
    await fs.writeFile(skip, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [keep, skip];
    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: 'src/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(keep, 'utf8')).toBe('DONE');
    expect(await fs.readFile(skip, 'utf8')).toBe('TARGET');
  });

  it('skips paths that rg returns but no longer exist (lstat ENOENT)', async () => {
    cfg.versionCode = 0;
    cfg.files = [path.join(dir, 'vanished.ts')]; // never created
    const result = await replaceTool.execute(
      { pattern: 'x', replacement: 'y', files: '**/*.ts' },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(0);
  });

  it('falls back to the native walker when rg --files errors', async () => {
    const file = path.join(dir, 'e.ts');
    await fs.writeFile(file, 'm');
    cfg.versionCode = 0; // rg "available"
    cfg.findErrors = true; // but --files errors → reject → globNative fallback
    const result = await replaceTool.execute(
      { pattern: 'm', replacement: 'n', files: '**/*.ts' },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(1);
  });

  it('applies the extra glob filter in the native walker', async () => {
    await fs.writeFile(path.join(dir, 'keep.ts'), 'TARGET');
    await fs.writeFile(path.join(dir, 'skip.md'), 'TARGET');
    cfg.versionCode = 1; // native walker
    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: '*.ts' },
      ctx(),
      opts(),
    );
    // Only keep.ts matches the *.ts extra glob; skip.md is filtered out.
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(path.join(dir, 'skip.md'), 'utf8')).toBe('TARGET');
  });

  it('applies subpath extra glob filter in the native walker', async () => {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'other'), { recursive: true });
    const keep = path.join(dir, 'src', 'keep.ts');
    const skip = path.join(dir, 'other', 'skip.ts');
    await fs.writeFile(keep, 'TARGET');
    await fs.writeFile(skip, 'TARGET');
    cfg.versionCode = 1; // native walker
    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: 'src/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(keep, 'utf8')).toBe('DONE');
    expect(await fs.readFile(skip, 'utf8')).toBe('TARGET');
  });

  it('recurses into subdirectories in the native walker', async () => {
    await fs.mkdir(path.join(dir, 'nested'));
    await fs.writeFile(path.join(dir, 'nested', 'deep.ts'), 'AA');
    cfg.versionCode = 1;
    const result = await replaceTool.execute(
      { pattern: 'AA', replacement: 'BB', files: '**/*.ts' },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(1);
  });

  it('replace_all=false only replaces the first match per file', async () => {
    const file = path.join(dir, 'd.ts');
    await fs.writeFile(file, 'z z z');
    cfg.versionCode = 1; // native walker
    const result = await replaceTool.execute(
      { pattern: 'z', replacement: 'Q', files: '**/*.ts', replace_all: false, dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.total_replacements).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('Q z z');
  });

  it('native walker expands a relative single-star glob (src/*.ts)', async () => {
    // Regression: globNative only tested basename + absolute path, so a
    // relative-anchored pattern like src/*.ts (compiled to ^src/[^/]*\.ts$)
    // could never match and the walker returned nothing. It must now match
    // the path relative to the walk base as well.
    await fs.mkdir(path.join(dir, 'src', 'sub'), { recursive: true });
    const a = path.join(dir, 'src', 'a.ts');
    const b = path.join(dir, 'src', 'b.ts');
    const nested = path.join(dir, 'src', 'sub', 'c.ts');
    await fs.writeFile(a, 'TARGET');
    await fs.writeFile(b, 'TARGET');
    await fs.writeFile(nested, 'TARGET');
    cfg.versionCode = 1; // rg unavailable → native walker

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: 'src/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(2);
    expect(await fs.readFile(a, 'utf8')).toBe('DONE');
    expect(await fs.readFile(b, 'utf8')).toBe('DONE');
    // Single `*` must not cross a directory boundary.
    expect(await fs.readFile(nested, 'utf8')).toBe('TARGET');
  });

  it('rg path expands a relative single-star glob (src/*.ts)', async () => {
    // Regression: spawnRgFind spawned rg WITHOUT cwd, so anchored globs were
    // resolved against the host process cwd instead of the search base and
    // returned nothing; the tool then reported files_modified=0 with no
    // native-walker fallback (the rg call resolved — just empty).
    await fs.mkdir(path.join(dir, 'src'));
    const a = path.join(dir, 'src', 'a.ts');
    const b = path.join(dir, 'src', 'b.ts');
    await fs.writeFile(a, 'TARGET');
    await fs.writeFile(b, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [a, b]; // rg --files enumerates both
    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: 'src/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(2);
    expect(await fs.readFile(a, 'utf8')).toBe('DONE');
    expect(await fs.readFile(b, 'utf8')).toBe('DONE');
  });

  it('native walker honours .gitignore (same file set as the rg path)', async () => {
    // Regression: the fallback walker applied only the static DEFAULT_IGNORE
    // list, so a `files` glob rewrote .gitignore'd paths — everything under
    // `generated/` included — while the rg path skipped them. The set of files
    // one call rewrites must not depend on whether ripgrep is installed.
    await fs.mkdir(path.join(dir, 'generated'), { recursive: true });
    const kept = path.join(dir, 'keep.ts');
    const ignored = path.join(dir, 'generated', 'gen.ts');
    await fs.writeFile(kept, 'TARGET');
    await fs.writeFile(ignored, 'TARGET');
    await fs.writeFile(path.join(dir, '.gitignore'), 'generated/\n');
    cfg.versionCode = 1; // rg unavailable → native walker

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(kept, 'utf8')).toBe('DONE');
    expect(await fs.readFile(ignored, 'utf8')).toBe('TARGET');
  });

  it('native walker honours file-level and negated .gitignore rules', async () => {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    const ignored = path.join(dir, 'src', 'other.gen.ts');
    const unignored = path.join(dir, 'src', 'keep.gen.ts');
    await fs.writeFile(ignored, 'TARGET');
    await fs.writeFile(unignored, 'TARGET');
    await fs.writeFile(path.join(dir, '.gitignore'), '*.gen.ts\n!keep.gen.ts\n');
    cfg.versionCode = 1; // native walker

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(ignored, 'utf8')).toBe('TARGET');
    expect(await fs.readFile(unignored, 'utf8')).toBe('DONE');
  });

  it('refuses brace alternation instead of silently matching nothing without rg', async () => {
    // Regression: compilePathGlob treats `{ts,md}` as literal characters, so the
    // fallback walker enumerated zero files and the call reported
    // files_modified: 0 as success — indistinguishable from "already applied".
    const ts = path.join(dir, 'a.ts');
    const md = path.join(dir, 'b.md');
    await fs.writeFile(ts, 'TARGET');
    await fs.writeFile(md, 'TARGET');
    cfg.versionCode = 1; // rg unavailable → native walker

    await expect(
      replaceTool.execute(
        { pattern: 'TARGET', replacement: 'DONE', files: '*.{ts,md}', dry_run: false },
        ctx(),
        opts(),
      ),
    ).rejects.toThrow(/brace alternation/);
    expect(await fs.readFile(ts, 'utf8')).toBe('TARGET');
    expect(await fs.readFile(md, 'utf8')).toBe('TARGET');
  });

  it('refuses a leading "!" exclude without rg', async () => {
    const ts = path.join(dir, 'c.ts');
    await fs.writeFile(ts, 'TARGET');
    cfg.versionCode = 1; // native walker

    await expect(
      replaceTool.execute(
        { pattern: 'TARGET', replacement: 'DONE', files: '!*.json', dry_run: false },
        ctx(),
        opts(),
      ),
    ).rejects.toThrow(/leading "!" exclude/);
    expect(await fs.readFile(ts, 'utf8')).toBe('TARGET');
  });

  it('the comma-separated form the error suggests works without rg', async () => {
    const ts = path.join(dir, 'd.ts');
    const md = path.join(dir, 'd.md');
    await fs.writeFile(ts, 'TARGET');
    await fs.writeFile(md, 'TARGET');
    cfg.versionCode = 1; // native walker

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '*.ts,*.md', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(2);
    expect(await fs.readFile(ts, 'utf8')).toBe('DONE');
    expect(await fs.readFile(md, 'utf8')).toBe('DONE');
  });

  it('brace alternation works on the rg path (guard is fallback-only)', async () => {
    // Regression: the comma-separated-list splitter ran BEFORE glob routing, so
    // the string form of `*.{ts,md}` became `*.{ts` + `md}`; the second entry
    // has no glob character, took the literal-path branch and killed the call
    // with `file not found "md}"` — even with rg available.
    const ts = path.join(dir, 'e.ts');
    const md = path.join(dir, 'e.md');
    await fs.writeFile(ts, 'TARGET');
    await fs.writeFile(md, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [ts, md]; // rg expands the braces itself

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '*.{ts,md}', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(2);
    expect(await fs.readFile(ts, 'utf8')).toBe('DONE');
    expect(await fs.readFile(md, 'utf8')).toBe('DONE');
    // The brace group reached rg intact — that is what made the split matter.
    expect(cfg.lastFindArgs).toContain('*.{ts,md}');
  });

  it('refuses an unclosed brace glob whatever the enumerator is', async () => {
    // rg reports "unclosed alternate group" and exits 2; the caller swallows
    // that and the native walk (which reads the brace literally) matched
    // nothing — a typo'd pattern reported files_modified: 0 as success.
    const ts = path.join(dir, 'f.ts');
    await fs.writeFile(ts, 'TARGET');
    cfg.versionCode = 0; // rg "available" — the guard must fire anyway

    await expect(
      replaceTool.execute(
        { pattern: 'TARGET', replacement: 'DONE', files: '*.{ts,tsx', dry_run: false },
        ctx(),
        opts(),
      ),
    ).rejects.toThrow(/never closed/);
    expect(await fs.readFile(ts, 'utf8')).toBe('TARGET');
  });

  it('keeps splitting a comma-separated list of mixed paths and globs', async () => {
    // Control for the splitter change: only commas INSIDE braces are protected.
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    const literal = path.join(dir, 'keep.txt');
    const globbed = path.join(dir, 'src', 'x.md');
    await fs.writeFile(literal, 'TARGET');
    await fs.writeFile(globbed, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [globbed]; // rg enumerates the glob entry

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: `${literal},src/*.md`, dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(2);
    expect(await fs.readFile(literal, 'utf8')).toBe('DONE');
    expect(await fs.readFile(globbed, 'utf8')).toBe('DONE');
    expect(cfg.lastFindArgs).toContain('src/*.md');
  });

  it('refuses a glob FILTER it cannot expand, on every enumerator', async () => {
    // `passesExtraGlob` compiles the filter with core's matcher — ripgrep never
    // sees it — so `*.{ts,md}` matched no file, narrowed every entry away and
    // the call reported files_modified: 0 as success. Being enumerator-
    // independent, this is refused with rg "available" too.
    const ts = path.join(dir, 'g.ts');
    await fs.writeFile(ts, 'TARGET');
    cfg.versionCode = 0; // rg available; the filter is still not expressible

    await expect(
      replaceTool.execute(
        {
          pattern: 'TARGET',
          replacement: 'DONE',
          files: '**/*',
          glob: '*.{ts,md}',
          dry_run: false,
        },
        ctx(),
        opts(),
      ),
    ).rejects.toThrow(/glob "\*\.\{ts,md\}" uses brace alternation/);
    expect(await fs.readFile(ts, 'utf8')).toBe('TARGET');
  });

  it('refuses an unclosed brace in the glob filter', async () => {
    const ts = path.join(dir, 'h.ts');
    await fs.writeFile(ts, 'TARGET');

    await expect(
      replaceTool.execute(
        { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: '*.{ts', dry_run: false },
        ctx(),
        opts(),
      ),
    ).rejects.toThrow(/glob "\*\.\{ts" is not a valid glob/);
    expect(await fs.readFile(ts, 'utf8')).toBe('TARGET');
  });

  it('still applies a plain glob filter', async () => {
    const ts = path.join(dir, 'i.ts');
    const md = path.join(dir, 'i.md');
    await fs.writeFile(ts, 'TARGET');
    await fs.writeFile(md, 'TARGET');
    cfg.versionCode = 0;
    cfg.files = [ts, md];

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*', glob: '*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(ts, 'utf8')).toBe('DONE');
    expect(await fs.readFile(md, 'utf8')).toBe('TARGET');
  });

  it('rg path skips the walker DEFAULT_IGNORE directories', async () => {
    // Regression: ripgrep only knows `.gitignore`, so an un-gitignored
    // node_modules/dist/build was enumerated by the rg path and rewritten,
    // while the fallback walker skips those segments — one call touching a
    // different file set depending on the environment, up to vendored deps.
    await fs.mkdir(path.join(dir, 'node_modules', 'dep'), { recursive: true });
    await fs.mkdir(path.join(dir, 'dist'), { recursive: true });
    const plain = path.join(dir, 'j.ts');
    const vendored = path.join(dir, 'node_modules', 'dep', 'x.ts');
    const built = path.join(dir, 'dist', 'y.ts');
    await fs.writeFile(plain, 'TARGET');
    await fs.writeFile(vendored, 'TARGET');
    await fs.writeFile(built, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [plain, vendored, built]; // rg would list all three

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(plain, 'utf8')).toBe('DONE');
    expect(await fs.readFile(vendored, 'utf8')).toBe('TARGET');
    expect(await fs.readFile(built, 'utf8')).toBe('TARGET');
  });

  it('an explicitly named path inside an ignored directory is still replaced', async () => {
    // The rule narrows GLOB enumeration only — naming the file is an explicit
    // instruction, exactly as the walker treats it.
    await fs.mkdir(path.join(dir, 'dist'), { recursive: true });
    const built = path.join(dir, 'dist', 'y.ts');
    await fs.writeFile(built, 'TARGET');

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: built, dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(built, 'utf8')).toBe('DONE');
  });

  it('accepts files as an array, where entries are never comma-split', async () => {
    // Coverage gap: only the string form was ever exercised. The array form is
    // the shape that keeps a brace group intact by construction (F4 fixed the
    // string form's comma splitting), and it may still mix literals and globs.
    const ts = path.join(dir, 'm.ts');
    const md = path.join(dir, 'm.md');
    const keep = path.join(dir, 'm.txt');
    await fs.writeFile(ts, 'TARGET');
    await fs.writeFile(md, 'TARGET');
    await fs.writeFile(keep, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = [ts, md]; // what rg returns for the brace glob entry

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: [keep, '*.{ts,md}'], dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(3);
    expect(await fs.readFile(ts, 'utf8')).toBe('DONE');
    expect(await fs.readFile(md, 'utf8')).toBe('DONE');
    expect(await fs.readFile(keep, 'utf8')).toBe('DONE');
    // The brace group reached rg whole, from the array entry.
    expect(cfg.lastFindArgs).toContain('*.{ts,md}');
  });

  it('rg exit 1 (no files matched) is an empty result, not a fallback', async () => {
    // Regression: exit 1 was treated as a failure, so a zero-match glob threw
    // away rg's answer and re-walked the tree with the native walker — a second
    // full enumeration per call, and a result from the wrong dialect. The
    // pattern here is one the walker CAN match, so pre-fix the file was
    // rewritten; post-fix rg's empty answer stands.
    const file = path.join(dir, 'k.ts');
    await fs.writeFile(file, 'TARGET');
    cfg.versionCode = 0; // rg available
    cfg.files = []; // rg matched nothing
    cfg.findCode = 1; // ... and said so

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(0);
    expect(await fs.readFile(file, 'utf8')).toBe('TARGET');
  });

  it('rg exit 2 is still a failure and still falls back', async () => {
    const file = path.join(dir, 'l.ts');
    await fs.writeFile(file, 'TARGET');
    cfg.versionCode = 0;
    cfg.files = [];
    cfg.findCode = 2; // usage/parse error

    const result = await replaceTool.execute(
      { pattern: 'TARGET', replacement: 'DONE', files: '**/*.ts', dry_run: false },
      ctx(),
      opts(),
    );
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('DONE');
  });
});
