import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.pid = 32198;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  }),
}));
vi.mock('../src/main/runtime-process.js', () => ({
  findFreePort: async (startPort: number) => startPort,
  waitForHttpReady: async () => {},
  terminateProcessTree: async () => {},
  waitForChildExit: async () => true,
}));
vi.mock('../src/main/desktop-privileged-actions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/main/desktop-privileged-actions.js')>()),
  authorizeDesktopRuntimeStart: async () => ({ allowed: true }),
}));

import { DesktopRuntimeManager } from '../src/main/runtime-manager.js';

describe('DesktopRuntimeManager shared HTTP/WebSocket listener', () => {
  it('uses the bound HTTP port for desktop WebSocket IPC requests', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-ws-port-'));
    const manager = new DesktopRuntimeManager();
    (manager as unknown as { stateFile: string }).stateFile = path.join(projectRoot, 'state.json');
    try {
      const runtime = await manager.openProject(projectRoot, {
        kind: 'global-settings',
        touchRecent: false,
      });
      const httpUrl = manager.getRuntimeUrlWithToken(runtime.id);
      const wsUrl = manager.getRuntimeWsUrlWithToken(runtime.id);
      expect(httpUrl).toBeDefined();
      expect(wsUrl).toBeDefined();
      expect(new URL(wsUrl!).port).toBe(new URL(httpUrl!).port);
      expect(runtime.wsPort).toBe(runtime.httpPort);
      const args = vi.mocked(spawn).mock.calls[0]?.[1];
      expect(args).toContain('--port');
      expect(args).not.toContain('--ws-port');
    } finally {
      await manager.closeAll();
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });
});
