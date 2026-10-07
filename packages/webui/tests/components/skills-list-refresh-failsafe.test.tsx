// Bug-hunt r66 (2026-10-07) — SkillsList refresh fail-safe.
// handleRefreshAll set checkingForUpdates(true) fire-and-forget; a lost
// `skills.updated` frame (server restart, socket drop) left the refresh
// spinner stuck until remount. The fail-safe timeout mirrors the protection
// handleExportAll gets from listenOnce's 30s timeout in the same file.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wsRef = vi.hoisted(() => ({
  current: null as null | {
    checkForUpdates: ReturnType<typeof vi.fn>;
    handlers: Map<string, (msg: unknown) => void>;
  },
}));

function makeClient() {
  const handlers = new Map<string, (msg: unknown) => void>();
  const client = {
    checkForUpdates: vi.fn(),
    on: vi.fn((event: string, handler: (msg: unknown) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    send: vi.fn(),
    handlers,
  };
  return client;
}

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ client: wsRef.current }),
}));
vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
  i18n: { language: 'en' },
}));
vi.mock('@/lib/view-navigation', () => ({ showPanel: vi.fn() }));
vi.mock('../../src/components/SidePanel/SkillCreateDialog.js', () => ({
  SkillCreateDialog: () => null,
  useSkillCreateForm: () => ({ createModalOpen: false, setCreateModalOpen: vi.fn() }),
}));
vi.mock('../../src/components/SidePanel/SkillInstallDialog.js', () => ({
  SkillInstallDialog: () => null,
  useSkillInstallForm: () => ({ installModalOpen: false, setInstallModalOpen: vi.fn() }),
}));
vi.mock('../../src/components/SidePanel/use-skills-one-shot.js', () => ({
  useSkillsOneShotListener: () => vi.fn(),
}));

import { SkillsList } from '../../src/components/SidePanel/SkillsList.js';

describe('SkillsList refresh fail-safe (lost skills.updated frame)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsRef.current = makeClient();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function clickRefresh(): void {
    // t() returns the key in this harness — the button title is the stable handle.
    const refresh = screen.getByTitle('activity:skillsList.checkUpdatesTitle');
    fireEvent.click(refresh);
  }

  it('fail-safe clears the spinner when the skills.updated frame never arrives', async () => {
    render(<SkillsList />);
    clickRefresh();
    expect(wsRef.current?.checkForUpdates).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    const refresh = screen.getByTitle('activity:skillsList.checkUpdatesTitle');
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  });

  it('unmount during a pending refresh clears the fail-safe timer', async () => {
    const { unmount } = render(<SkillsList />);
    clickRefresh();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('CONTROL: a real skills.updated frame clears the spinner immediately', async () => {
    render(<SkillsList />);
    clickRefresh();
    const handler = wsRef.current?.handlers.get('skills.updated');
    expect(handler).toBeDefined();
    await act(async () => {
      handler?.({
        payload: { success: true, error: null, updated: [], unchanged: [], errors: [] },
      });
    });
    const refresh = screen.getByTitle('activity:skillsList.checkUpdatesTitle');
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  });
});
