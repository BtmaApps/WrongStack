import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ initializeCli: vi.fn(), runInteractive: vi.fn() }));
vi.mock('../src/cli-context.js', () => ({ initializeCli: mocks.initializeCli }));
vi.mock('../src/cli-main.js', () => ({ runInteractive: mocks.runInteractive }));
vi.mock('../src/preflight.js', () => ({
  applyNodeEnvDefault: vi.fn(),
  applySessionShellDefault: vi.fn(),
}));

import { main } from '../src/cli-entry-main.js';

let stdinTty: PropertyDescriptor | undefined;
let stdoutTty: PropertyDescriptor | undefined;
let stderrWrite: typeof process.stderr.write;

beforeEach(() => {
  stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  stderrWrite = process.stderr.write;
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.initializeCli.mockReset();
  mocks.runInteractive.mockReset();
});

afterEach(() => {
  if (stdinTty) Object.defineProperty(process.stdin, 'isTTY', stdinTty);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  process.stderr.write = stderrWrite;
  vi.restoreAllMocks();
});

describe('CLI TUI startup output ownership', () => {
  it.each([{ args: [] }, { args: ['--tui'] }, { args: ['quick'] }])(
    'keeps TUI startup clean for argv $args',
    async ({ args }) => {
      const warn = console.warn;
      const info = console.info;
      const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
      mocks.initializeCli.mockImplementation(async () => {
        console.warn('HQ unavailable during boot');
        return { flags: { tui: true }, logger };
      });
      mocks.runInteractive.mockImplementation(async () => {
        console.warn('optional integration unavailable');
        console.info('plugins loaded');
        return 0;
      });
      expect(await main(args)).toBe(0);
      expect(warn).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('HQ unavailable during boot', expect.any(Object));
      expect(logger.warn).toHaveBeenCalledWith(
        'optional integration unavailable',
        expect.any(Object),
      );
      expect(logger.info).toHaveBeenCalledWith('plugins loaded', expect.any(Object));
      expect(console.warn).toBe(warn);
    },
  );

  it('replays buffered warnings when the menu selects REPL', async () => {
    const warn = console.warn;
    mocks.initializeCli.mockImplementation(async () => {
      console.warn('provider discovery warning');
      return { flags: { tui: false }, logger: {} };
    });
    mocks.runInteractive.mockResolvedValue(0);
    expect(await main([])).toBe(0);
    expect(warn).toHaveBeenCalledWith('provider discovery warning');
  });

  it('restores output and retains diagnostic context when initialization fails', async () => {
    const warn = console.warn;
    const stderr = process.stderr.write;
    mocks.initializeCli.mockImplementation(async () => {
      console.warn('startup context');
      throw new Error('Config failed');
    });
    await expect(main(['--tui'])).rejects.toThrow('Config failed');
    expect(warn).toHaveBeenCalledWith('startup context');
    expect(console.warn).toBe(warn);
    expect(process.stderr.write).toBe(stderr);
  });
});
