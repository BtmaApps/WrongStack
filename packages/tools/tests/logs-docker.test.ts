import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake the `docker` child process so the close/data/error paths in dockerLogs
// run without a Docker daemon.
const cfg: {
  stdout: string;
  stderr: string;
  emit: 'close' | 'error' | 'none';
  code: number;
  pipeError?: boolean;
} = {
  stdout: '',
  stderr: '',
  emit: 'close',
  code: 0,
};
let lastKill: string | undefined;
let lastSpawnArgs: string[] = [];

vi.mock('node:child_process', async (orig) => {
  const actual = await orig<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (_cmd: string, args: string[]) => {
      lastSpawnArgs = args;
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: (sig?: string) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = (sig?: string) => {
        lastKill = sig;
      };
      process.nextTick(() => {
        if (cfg.stdout) child.stdout.emit('data', Buffer.from(cfg.stdout));
        if (cfg.stderr) child.stderr.emit('data', Buffer.from(cfg.stderr));
        if (cfg.pipeError) {
          child.stdout.emit('error', new Error('EPIPE'));
          child.stderr.emit('error', new Error('EPIPE'));
        }
        if (cfg.emit === 'close') child.emit('close', cfg.code);
        else if (cfg.emit === 'error') child.emit('error', new Error('spawn docker ENOENT'));
        // 'none' → never settles; the tool's internal timeout must fire.
      });
      return child;
    },
  };
});

import { logsTool } from '../src/logs.js';

const ctx = () => ({ cwd: process.cwd(), tools: [], projectRoot: process.cwd() }) as any;
const opts = () => ({ signal: new AbortController().signal });

beforeEach(() => {
  cfg.stdout = '';
  cfg.stderr = '';
  cfg.emit = 'close';
  cfg.code = 0;
  cfg.pipeError = false;
  lastKill = undefined;
  lastSpawnArgs = [];
});
afterEach(() => vi.restoreAllMocks());

describe('logsTool docker path (faked docker process)', () => {
  it('parses docker stdout into entries on close', async () => {
    cfg.stdout = '2024-01-01T10:00:00Z INFO container started\n2024-01-01T10:00:01Z ERROR boom\n';
    const result = await logsTool.execute({ service: 'myapp' }, ctx(), opts());
    expect(result.source).toBe('docker:myapp');
    expect(result.entries.length).toBe(2);
    expect(result.entries.map((e) => e.level)).toContain('error');
    expect(result.stream_mode).toBe(false);
  });

  it('applies the regex filter to docker output', async () => {
    cfg.stdout = '2024-01-01T10:00:00Z INFO noise\n2024-01-01T10:00:01Z ERROR signal\n';
    const result = await logsTool.execute({ service: 'myapp', filter: 'signal' }, ctx(), opts());
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.message).toContain('signal');
  });

  it('swallows pipe errors from the child streams', async () => {
    cfg.stdout = '2024-01-01T10:00:00Z INFO ok\n';
    cfg.pipeError = true; // stdout/stderr emit 'error' (EPIPE) — must not throw
    const result = await logsTool.execute({ service: 'myapp' }, ctx(), opts());
    expect(result.source).toBe('docker:myapp');
  });

  it('throws on a docker spawn error (not an empty ok result)', async () => {
    cfg.emit = 'error';
    await expect(logsTool.execute({ service: 'myapp' }, ctx(), opts())).rejects.toThrow(
      /could not run docker.*ENOENT/,
    );
  });

  it('throws when docker exits non-zero instead of parsing its error as a log line', async () => {
    cfg.code = 1;
    cfg.stderr = 'Error response from daemon: No such container: myapp\n';
    await expect(logsTool.execute({ service: 'myapp' }, ctx(), opts())).rejects.toThrow(
      /exited with code 1: Error response from daemon: No such container/,
    );
  });

  it('kills the child and throws when docker never settles (timeout)', async () => {
    cfg.emit = 'none';
    await expect(logsTool.execute({ service: 'myapp' }, ctx(), opts())).rejects.toThrow(
      /did not finish within/,
    );
    expect(lastKill).toBe('SIGTERM');
  }, 10_000);

  it('passes since through to docker logs --since', async () => {
    cfg.stdout = '2024-01-01T10:00:00Z INFO ok\n';
    await logsTool.execute({ service: 'myapp', since: '6h' }, ctx(), opts());
    const idx = lastSpawnArgs.indexOf('--since');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(lastSpawnArgs[idx + 1]).toBe('6h');
  });

  it('omits --since for since: "all"', async () => {
    cfg.stdout = '2024-01-01T10:00:00Z INFO ok\n';
    await logsTool.execute({ service: 'myapp', since: 'all' }, ctx(), opts());
    expect(lastSpawnArgs).not.toContain('--since');
  });

  it('declares a maxOutputBytes cap', () => {
    expect(logsTool.maxOutputBytes).toBe(262_144);
  });
});
