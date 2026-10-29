/**
 * `replace` enumerates a `files` glob with ripgrep when it is installed and
 * with a native walker otherwise; both must answer with the same file set.
 * Two ripgrep defaults broke that: it never entered a dot-directory
 * (`.github/workflows/*.yml` matched nothing, reported as success), and a
 * `--glob` matching a directory (`**\/*`) overrode `.gitignore`, so ignored
 * files were rewritten. Holds with or without rg on PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveFiles } from '../src/replace-file-resolution.js';

let dir = '';
const put = (rel: string, body = 'x\n') => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), body);
};

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'replace-rg-enum-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  put('.github/workflows/ci.yml');
  put('src/x.yml');
  put('src/keep.log');
  put('gen/a.yml');
  put('skip.log');
  put('node_modules/pkg/n.yml');
  put('.gitignore', 'gen/\n*.log\n!src/keep.log\n');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const files = async (pattern: string) =>
  (await resolveFiles(pattern, { cwd: dir } as never))
    .map((f) => f.slice(dir.length + 1).replace(/\\/g, '/'))
    .sort();

describe('replace: files glob enumeration', () => {
  it('enters hidden directories', async () => {
    expect(await files('.github/workflows/*.yml')).toEqual(['.github/workflows/ci.yml']);
    expect(await files('**/*.yml')).toEqual(['.github/workflows/ci.yml', 'src/x.yml']);
  });

  it('keeps .gitignored files out of a directory-matching glob', async () => {
    expect(await files('**/*')).toEqual([
      '.github/workflows/ci.yml',
      '.gitignore',
      'src/keep.log',
      'src/x.yml',
    ]);
    expect(await files('gen/**/*.yml')).toEqual([]);
  });
});
