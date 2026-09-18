import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseSha256Sums,
  replaceExecutable,
  standaloneAssetName,
} from '../src/standalone-update.js';

describe('standaloneAssetName', () => {
  it('matches the names scripts/build-binaries.mjs publishes', async () => {
    const build = (await import('../../../scripts/build-binaries.mjs')) as {
      ALL_TARGETS: string[];
      outputName: (target: string) => string;
    };
    for (const target of build.ALL_TARGETS) {
      expect(standaloneAssetName(target)).toBe(build.outputName(target));
    }
    expect(standaloneAssetName('bun-windows-x64')).toBe('wstack-windows-x64.exe');
    expect(standaloneAssetName('bun-linux-arm64-musl')).toBe('wstack-linux-arm64-musl');
  });
});

describe('parseSha256Sums', () => {
  it('reads sha256sum output, including binary-mode `*` markers and CRLF', () => {
    const a = 'a'.repeat(64);
    const b = 'B'.repeat(64);
    const sums = parseSha256Sums(
      `${a}  wstack-linux-x64\r\n${b} *wstack-windows-x64.exe\n\nnoise\n`,
    );
    expect(sums.get('wstack-linux-x64')).toBe(a);
    expect(sums.get('wstack-windows-x64.exe')).toBe(b.toLowerCase());
    expect(sums.size).toBe(2);
  });
});

describe('replaceExecutable', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-replace-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('swaps the file in place on POSIX and leaves no staging file', () => {
    const target = path.join(dir, 'wstack');
    fs.writeFileSync(target, 'old');
    replaceExecutable(target, Buffer.from('new'), 'linux');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readdirSync(dir)).toEqual(['wstack']);
  });

  it('moves the old executable aside on Windows (a running .exe cannot be overwritten)', () => {
    const target = path.join(dir, 'wstack.exe');
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(`${target}.old`, 'older');
    replaceExecutable(target, Buffer.from('new'), 'win32');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readFileSync(`${target}.old`, 'utf8')).toBe('old');
    expect(fs.readdirSync(dir).sort()).toEqual(['wstack.exe', 'wstack.exe.old']);
  });
});
