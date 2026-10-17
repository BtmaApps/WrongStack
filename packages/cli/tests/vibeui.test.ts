import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import { applyLaunchMenuToArgv } from '../src/boot/launch-menu.js';
import { DEFAULT_PORTS, MODE_OPTIONS } from '../src/boot/launch-menu-types.js';
import { resolveVibeUiDistDir } from '../src/vibeui-dist.js';

describe('VibeUI launch', () => {
  it.each([
    ['vibeui', '--open'],
    ['--vibeui', '--open'],
  ])('normalizes %j onto the browser runtime', (...args) => {
    expect(parseArgs(args)).toMatchObject({
      flags: { vibeui: true, webui: true, open: true },
      positional: [],
    });
  });
  it('launches from the menu with its own port and host', () => {
    expect(DEFAULT_PORTS.vibeui).toBe(3476);
    expect(MODE_OPTIONS.find((option) => option.mode === 'vibeui')?.label).toBe('VibeUI');
    expect(
      applyLaunchMenuToArgv([], {
        mode: 'vibeui',
        port: 3476,
        host: '127.0.0.1',
        cancelled: false,
      }),
    ).toEqual(['--port=3476', '--host=127.0.0.1', '--vibeui']);
  });
  it('resolves only the independently built VibeUI assets', () => {
    expect(
      resolveVibeUiDistDir({
        resolvePackageJson: () => '/workspace/vibeui/package.json',
        exists: () => true,
      }),
    ).toBe(path.join('/workspace/vibeui', 'dist'));
    expect(() =>
      resolveVibeUiDistDir({
        resolvePackageJson: () => '/workspace/vibeui/package.json',
        exists: () => false,
      }),
    ).toThrow('bun run --filter @wrongstack/vibeui build');
    expect(() =>
      resolveVibeUiDistDir({
        resolvePackageJson: () => {
          throw new Error('missing');
        },
      }),
    ).toThrow('VibeUI package is unavailable');
  });
});
