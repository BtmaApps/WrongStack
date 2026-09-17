import { describe, expect, it } from 'vitest';
import { normalizeExecCommandName } from '../src/exec-command-name.js';

describe('exec command policy names', () => {
  it('recognizes Windows executable and shim spellings', () => {
    for (const command of ['uv', 'UV.EXE', 'uv.cmd', 'uv.bat', 'uv.com', ' uv ']) {
      expect(normalizeExecCommandName(command, 'win32')).toBe('uv');
    }
  });

  it('preserves POSIX casing, extensions, and explicit paths', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      for (const command of ['UV', 'uv.exe', './uv', '/tmp/uv', 'uv run pytest']) {
        expect(normalizeExecCommandName(command, platform)).toBe(command);
      }
    }
    expect(normalizeExecCommandName('C:\\tools\\UV.EXE', 'win32')).toBe('c:\\tools\\uv');
    expect(normalizeExecCommandName('.\\uv.exe', 'win32')).toBe('.\\uv');
  });
});
