import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultLogger } from '@wrongstack/core/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldCaptureTuiStartup, startTuiStartupOutput } from '../src/boot/tui-startup-output.js';

let scope: ReturnType<typeof startTuiStartupOutput> | undefined;
let originalWrite: typeof process.stderr.write;
let originalWarning: typeof process.emitWarning;
let write: ReturnType<typeof vi.fn>;

beforeEach(() => {
  originalWrite = process.stderr.write;
  originalWarning = process.emitWarning;
  write = vi.fn(() => true);
  process.stderr.write = write as typeof process.stderr.write;
  process.emitWarning = vi.fn();
  for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  scope?.stop(false);
  scope = undefined;
  process.stderr.write = originalWrite;
  process.emitWarning = originalWarning;
  vi.restoreAllMocks();
});

describe('TUI startup diagnostics', () => {
  it('keeps explicit TUI, quick and launch-menu paths eligible, excluding other surfaces and pipes', () => {
    expect(shouldCaptureTuiStartup({ tui: true }, [], true)).toBe(true);
    expect(shouldCaptureTuiStartup({}, ['quick'], true)).toBe(true);
    expect(shouldCaptureTuiStartup({}, ['resume', 'session-id'], true)).toBe(true);
    expect(shouldCaptureTuiStartup({}, [], true)).toBe(true);
    expect(shouldCaptureTuiStartup({ tui: true }, [], false)).toBe(false);
    expect(shouldCaptureTuiStartup({}, ['models'], true)).toBe(false);
    for (const flag of [
      'no-tui',
      'webui',
      'simpleui',
      'hq',
      'desktop',
      'remote',
      'no-interactive',
    ]) {
      expect(shouldCaptureTuiStartup({ [flag]: true }, [], true)).toBe(false);
    }
    expect(shouldCaptureTuiStartup({ prompt: 'hello' }, [], true)).toBe(false);
  });

  it('buffers console and Node warnings while prompts and errors remain visible', () => {
    const warn = console.warn;
    const error = console.error;
    const emitWarning = process.emitWarning;
    scope = startTuiStartupOutput(true);
    console.warn('hq.publisher.connect_failed');
    process.emitWarning('dependency deprecation', 'DeprecationWarning');
    console.error('Cannot start: invalid config');
    console.warn(JSON.stringify({ level: 'error', message: 'Cannot start provider' }));
    process.stderr.write('Select a provider: ');
    process.stderr.write('12:00:00 ERROR fatal failure\n');
    expect(error).toHaveBeenCalledWith('Cannot start: invalid config');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(emitWarning).not.toHaveBeenCalled();
    expect(write.mock.calls.map((call) => call[0])).toEqual([
      'Select a provider: ',
      '12:00:00 ERROR fatal failure\n',
    ]);
    scope.stop();
    expect(warn).toHaveBeenCalledWith('hq.publisher.connect_failed');
    expect(emitWarning).toHaveBeenCalledWith('dependency deprecation', 'DeprecationWarning');
  });

  it('filters pretty and JSON diagnostic writes, preserving callbacks and error records', () => {
    const callback = vi.fn();
    scope = startTuiStartupOutput(true);
    process.stderr.write('\x1b[2m12:00:00\x1b[0m WARN  HQ offline\n', callback);
    process.stderr.write(`${JSON.stringify({ level: 'warn', msg: 'HQ offline' })}\n`);
    process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'fatal config' })}\n`);
    expect(callback).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toContain('fatal config');
    scope.stop();
    expect(write).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('retains diagnostics in the existing log file without printing or duplicating logger records', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-tui-startup-'));
    const file = path.join(dir, 'wrongstack.log');
    const logger = new DefaultLogger({ file, level: 'debug', format: 'json' });
    const warn = console.warn;
    try {
      scope = startTuiStartupOutput(true);
      console.warn('optional plugin unavailable');
      process.emitWarning('dependency warning');
      logger.warn('HQ connect failed');
      scope.acceptTui(logger);
      console.info('runtime initialized');
      await logger.flush();
      expect(warn).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      const records = (await fs.readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(records.map((record) => record.msg)).toEqual([
        'HQ connect failed',
        'optional plugin unavailable',
        'dependency warning',
        'runtime initialized',
      ]);
      scope.stop();
      expect(console.warn).toBe(warn);
      expect(process.stderr.write).toBe(write);
    } finally {
      scope?.stop(false);
      await logger.flush();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('bounds buffered chatter and restores exactly once for REPL or cancelled startup', () => {
    const info = console.info;
    scope = startTuiStartupOutput(true);
    for (let i = 0; i < 205; i++) console.info(`diagnostic-${i}`);
    scope.stop();
    scope.stop();
    expect(info).toHaveBeenCalledTimes(200);
    expect(info).toHaveBeenNthCalledWith(1, 'diagnostic-5');
    expect(process.stderr.write).toBe(write);
  });

  it('preserves structured warning severity when a library logs through console.log', () => {
    const logger = { warn: vi.fn(), info: vi.fn() };
    const record = JSON.stringify({
      level: 'warn',
      event: 'hq.publisher.connect_failed',
      message: 'HQ unavailable',
    });
    scope = startTuiStartupOutput(true);
    console.log(record);
    scope.acceptTui(logger as never);
    expect(logger.warn).toHaveBeenCalledWith(record, { event: 'tui.startup.console' });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('restores startup wrappers after the real TUI silence/unsilence handoff', async () => {
    const warn = console.warn;
    scope = startTuiStartupOutput(true);
    const { silenceTerminal, unsilenceTerminal } = await import(
      '../../tui/src/terminal-silence.js'
    );
    try {
      silenceTerminal();
      console.warn('background chatter');
    } finally {
      unsilenceTerminal();
      scope.stop(false);
    }
    expect(console.warn).toBe(warn);
    expect(process.stderr.write).toBe(write);
    expect(warn).not.toHaveBeenCalled();
  });
});
