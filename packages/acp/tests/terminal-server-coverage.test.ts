import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeStream extends EventEmitter {
  setEncoding = vi.fn();
}

class FakeProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  kill = vi.fn();
}

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));

import { TerminalServer } from '../src/client/terminal-server.js';

let proc: FakeProcess;

beforeEach(() => {
  vi.useFakeTimers();
  proc = new FakeProcess();
  mocks.spawn.mockReset();
  mocks.spawn.mockReturnValue(proc);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TerminalServer deterministic edge coverage', () => {
  it('handles absent argv/env, pending output, abort cleanup, and numeric clamps', () => {
    const controller = new AbortController();
    const server = new TerminalServer({
      projectRoot: process.cwd(),
      signal: controller.signal,
      maxTerminals: 0,
    });
    const internal = server as unknown as {
      clampFiniteInt(value: number | undefined, fallback: number): number;
    };
    expect(internal.clampFiniteInt(undefined, 7)).toBe(7);
    expect(internal.clampFiniteInt(Number.NaN, 7)).toBe(7);
    expect(internal.clampFiniteInt(0, 7)).toBe(7);
    expect(internal.clampFiniteInt(3.9, 7)).toBe(3);

    const { terminalId } = server.create({ sessionId: 's', command: 'agent' });
    expect(server.output(terminalId)).toEqual({ output: '', truncated: false });
    controller.abort();
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('bounds spawn errors and clears an active timeout', async () => {
    const server = new TerminalServer({
      projectRoot: process.cwd(),
      outputByteLimit: 2,
      commandTimeoutMs: 100,
    });
    const { terminalId } = server.create({ sessionId: 's', command: 'missing' });
    const internal = server as unknown as {
      terminals: Map<string, { timeoutHandle: ReturnType<typeof setTimeout> | null }>;
    };
    clearTimeout(internal.terminals.get(terminalId)!.timeoutHandle!);
    internal.terminals.get(terminalId)!.timeoutHandle = null;
    proc.emit('error', new Error('🙂'));
    await expect(server.waitForExit(terminalId)).resolves.toEqual({
      exitCode: 127,
      signal: null,
    });
    expect(server.output(terminalId)).toMatchObject({ truncated: true });
  });

  it('compacts many evicted chunks and tolerates timeout, kill, and release failures', () => {
    const server = new TerminalServer({
      projectRoot: process.cwd(),
      outputByteLimit: 1,
      commandTimeoutMs: 10,
    });
    const { terminalId } = server.create({ sessionId: 's', command: 'agent' });
    for (let i = 0; i < 300; i++) proc.stdout.emit('data', 'ab');
    expect(server.output(terminalId).output).toBe('b');

    proc.kill.mockImplementation(() => {
      throw new Error('already dead');
    });
    vi.advanceTimersByTime(10);
    expect(() => server.kill(terminalId)).not.toThrow();
    // First release cleans up onData
    expect(() => server.release(terminalId)).not.toThrow();
    // Second release on same terminal (onData is now undefined) tests state.onData falsy branch
    const internal = server as unknown as { terminals: Map<string, any> };
    internal.terminals.set('t-empty', {
      proc,
      timeoutHandle: null,
      outputChunks: [],
      outputHead: 0,
      retainedBytes: 0,
    });
    expect(() => server.release('t-empty')).not.toThrow();
    expect(() => server.release('missing')).not.toThrow();
  });

  it('handles proc close with signal and null exitCode', async () => {
    const server = new TerminalServer({ projectRoot: process.cwd() });
    const { terminalId } = server.create({ sessionId: 's', command: 'agent' });
    proc.emit('close', null, 'SIGTERM');
    const status = await server.waitForExit(terminalId);
    expect(status).toEqual({ exitCode: null, signal: 'SIGTERM' });
  });

  // win32BatchTarget is only consulted on win32 and is reached through
  // create(). PATH/PATHEXT are read from process.env at call time, so a
  // stubbed platform + env + a real command file drive the PATHEXT walk
  // (empty-dir skip, empty-ext skip) without depending on a real agent being
  // installed. The spawn shim is mocked, so nothing actually executes.
  describe('win32BatchTarget PATHEXT walk', () => {
    const realPlatform = process.platform;
    function asWin32(): void {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    }
    function restore(): void {
      Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    }

    it('returns a bare .cmd/.bat command without walking PATH', () => {
      asWin32();
      try {
        const server = new TerminalServer({ projectRoot: process.cwd() });
        // A command that already ends in .cmd short-circuits the whole walk.
        server.create({ sessionId: 's', command: 'agent.cmd' });
        const spawnCmd = (mocks.spawn.mock.calls[0]?.[0] ?? '') as string;
        expect(String(spawnCmd).toLowerCase()).toContain('cmd');
      } finally {
        restore();
      }
    });

    it('skips empty PATH entries and empty PATHEXT entries when walking', () => {
      asWin32();
      const dir = mkdtempSync(path.join(tmpdir(), 'acp-bat-'));
      // A .cmd shim file the walk should find; empty PATH segments and an
      // empty PATHEXT extension force both `continue` guards.
      const bat = path.join(dir, 'walkme.cmd');
      writeFileSync(bat, '@echo off\r\n');
      const origPath = process.env.PATH;
      const origExt = process.env.PATHEXT;
      process.env.PATH = ['', dir, ''].join(path.delimiter);
      process.env.PATHEXT = ['.NOPE', '', '.CMD'].join(';');
      try {
        const server = new TerminalServer({ projectRoot: process.cwd() });
        server.create({ sessionId: 's', command: 'walkme', args: [] });
        const spawnCmd = (mocks.spawn.mock.calls[0]?.[0] ?? '') as string;
        // Found the .cmd on PATH -> routed through the cmd.exe shim.
        expect(String(spawnCmd).toLowerCase()).toContain('cmd');
      } finally {
        process.env.PATH = origPath;
        process.env.PATHEXT = origExt;
        rmSync(dir, { recursive: true, force: true });
        restore();
      }
    });

    it('falls back to built-in defaults when PATHEXT and PATH are unset', () => {
      asWin32();
      const origPath = process.env.PATH;
      const origExt = process.env.PATHEXT;
      // `process.env.X = undefined` would store the STRING "undefined"; the
      // `??` fallbacks only fire on a genuinely absent key, so delete them.
      delete process.env.PATH;
      delete process.env.PATHEXT;
      try {
        const server = new TerminalServer({ projectRoot: process.cwd() });
        // Nothing on an empty PATH -> no batch shim -> the command is spawned
        // verbatim, which is what the built-in defaults must produce.
        server.create({ sessionId: 's', command: 'walkme', args: [] });
        const spawnCmd = mocks.spawn.mock.calls[0]?.[0];
        expect(spawnCmd).toBe('walkme');
        server.dispose();
      } finally {
        if (origPath !== undefined) process.env.PATH = origPath;
        if (origExt !== undefined) process.env.PATHEXT = origExt;
        restore();
      }
    });

    it('skips the batch-shim probe entirely off win32', () => {
      // This host IS win32, so the probe must be switched off explicitly to
      // reach the non-win32 arm of `create()`'s platform check.
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      try {
        const server = new TerminalServer({ projectRoot: process.cwd() });
        // A .cmd-looking command is spawned verbatim, with no cmd.exe shim.
        server.create({ sessionId: 's', command: 'agent.cmd' });
        const spawnCmd = mocks.spawn.mock.calls[0]?.[0];
        expect(spawnCmd).toBe('agent.cmd');
        server.dispose();
      } finally {
        restore();
      }
    });
  });

  it('resolves filesystem roots and falls back from missing working directories', () => {
    const filesystemRoot = path.parse(process.cwd()).root;
    const server = new TerminalServer({ projectRoot: filesystemRoot });
    const internal = server as unknown as {
      resolveCwd(cwd: string | undefined): string;
    };
    expect(internal.resolveCwd(filesystemRoot)).toBe(filesystemRoot);
    expect(internal.resolveCwd(path.join(filesystemRoot, 'definitely-missing-cwd'))).toBe(
      filesystemRoot,
    );
  });
});
