import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/main/ipc.js';
import { installShellStateReplay } from '../src/main/shell-state-replay.js';

describe('shell state replay', () => {
  it('sends current native locale and sidebar state on initial load and each reload', () => {
    const contents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false });
    let state = { locale: 'tr', sidebarCollapsed: false };
    installShellStateReplay(
      contents as unknown as Parameters<typeof installShellStateReplay>[0],
      () => state,
    );
    contents.emit('did-finish-load');
    expect(contents.send.mock.calls).toEqual([
      [IPC.localeChanged, 'tr'],
      [IPC.shellSidebarCollapsedChanged, false],
    ]);
    contents.send.mockClear();
    state = { locale: 'de', sidebarCollapsed: true };
    contents.emit('did-finish-load');
    expect(contents.send.mock.calls).toEqual([
      [IPC.localeChanged, 'de'],
      [IPC.shellSidebarCollapsedChanged, true],
    ]);
  });
  it('does not send IPC after the view is destroyed', () => {
    const contents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => true });
    installShellStateReplay(
      contents as unknown as Parameters<typeof installShellStateReplay>[0],
      () => ({ locale: 'en', sidebarCollapsed: false }),
    );
    contents.emit('did-finish-load');
    expect(contents.send).not.toHaveBeenCalled();
  });
});
