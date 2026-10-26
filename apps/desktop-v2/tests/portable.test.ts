import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { portableDirectory, stagePortable } from '../scripts/portable';

const owned: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'wrongstack-portable-test-'));
  owned.push(dir);
  mkdirSync(join(dir, 'src-tauri/target/release'), { recursive: true });
  mkdirSync(join(dir, 'binaries'));
  writeFileSync(join(dir, 'src-tauri/target/release/wrongstack-desktop-native.exe'), 'ui-v1');
  writeFileSync(join(dir, 'binaries/wrongstack-engine.exe'), 'engine-v1');
  return dir;
}
afterEach(() => {
  for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('portable build updates', () => {
  it('stages new builds without replacing the engine or UI used by an open session', () => {
    const dir = fixture();
    const first = stagePortable(dir);
    expect(stagePortable(dir)).toBe(first);
    writeFileSync(join(dir, 'src-tauri/target/release/wrongstack-desktop-native.exe'), 'ui-v2');
    writeFileSync(join(dir, 'binaries/wrongstack-engine.exe'), 'engine-v2');
    const next = stagePortable(dir);
    expect(next).not.toBe(first);
    expect(portableDirectory(dir)).toBe(next);
    expect(readFileSync(join(first, 'wrongstack-engine.exe'), 'utf8')).toBe('engine-v1');
    expect(readFileSync(join(first, 'wrongstack-desktop-native.exe'), 'utf8')).toBe('ui-v1');
    expect(readFileSync(join(next, 'SHA256SUMS'), 'utf8')).toMatch(
      /^[a-f0-9]{64} {2}wrongstack-desktop-native.exe\n[a-f0-9]{64} {2}wrongstack-engine.exe\n$/,
    );
  });
  it('refuses a mutated artifact and keeps the last valid build selected', () => {
    const dir = fixture();
    const first = stagePortable(dir);
    writeFileSync(join(first, 'wrongstack-engine.exe'), 'modified');
    expect(() => stagePortable(dir)).toThrow('Portable artifact identity changed');
    expect(portableDirectory(dir)).toBe(first);
  });
  it('rejects paths outside the build store', () => {
    const dir = fixture();
    stagePortable(dir);
    writeFileSync(
      join(dir, 'dist-native/latest.json'),
      JSON.stringify({ directory: '../private' }),
    );
    expect(() => portableDirectory(dir)).toThrow('Invalid portable build identity');
  });
});
