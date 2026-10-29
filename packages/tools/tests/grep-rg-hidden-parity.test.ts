/**
 * grep answers with ripgrep when it is installed and with a native walker
 * otherwise; both must search the same files. rg skips dotfiles and
 * dot-directories unless told `--hidden`, so `.github/workflows/*.yml` and
 * `.env.example` were a confident "no matches" only on hosts with rg.
 * `.git`, DEFAULT_IGNORE dirs and .gitignored dot-dirs stay out either way.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { __resetRgDetectionForTests, __setRgAvailableForTests, grepTool } from '../src/grep.js';
import { mkSandbox, newSignal, type Sandbox } from './fixtures.js';

let rgInstalled = true;
try {
  execFileSync('rg', ['--version'], { stdio: 'ignore' });
} catch {
  rgInstalled = false;
}

let sb: Sandbox;
beforeAll(async () => {
  sb = await mkSandbox();
  execFileSync('git', ['init', '-q'], { cwd: sb.dir });
  const put = async (rel: string) => {
    await fs.mkdir(path.dirname(path.join(sb.dir, rel)), { recursive: true });
    await fs.writeFile(path.join(sb.dir, rel), 'MARKER_TOKEN\n');
  };
  await put('src/a.ts');
  await put('.github/workflows/ci.yml');
  await put('.env.example');
  await put('.cache/x.txt');
  await put('node_modules/p/i.js');
  await put('.git/MARKER');
  await fs.writeFile(path.join(sb.dir, '.gitignore'), '.cache/\n');
});
afterAll(async () => {
  __resetRgDetectionForTests();
  await sb.cleanup();
});

const search = async (rg: boolean) => {
  __setRgAvailableForTests(rg);
  const out = await grepTool.execute(
    { pattern: 'MARKER_TOKEN', output_mode: 'files_with_matches' },
    sb.ctx,
    { signal: newSignal() },
  );
  return out.matches.map((m) => m.replace(/\\/g, '/')).sort();
};

describe('grep: rg and native walker search the same files', () => {
  const expected = ['.env.example', '.github/workflows/ci.yml', 'src/a.ts'];

  it('native walker searches dotfiles and dot-directories', async () => {
    expect(await search(false)).toEqual(expected);
  });

  it.skipIf(!rgInstalled)('rg searches dotfiles and dot-directories too', async () => {
    expect(await search(true)).toEqual(expected);
  });
});
