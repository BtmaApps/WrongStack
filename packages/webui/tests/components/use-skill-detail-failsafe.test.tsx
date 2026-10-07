/**
 * Regression guard: the skill save/uninstall ws exchanges must be
 * failure-safe. `handleSaveEdit` and `handleUninstallSkill` register one-shot
 * ack handlers; a lost reply (server restart, socket drop) or a throwing send
 * used to leave `editSaving`/`uninstalling` stuck true forever with the
 * listener leaked (bug-hunt r64, 2026-10-07). Both exchanges now carry a
 * 15s fail-safe timeout and a throw guard, mirroring the content fetch's own
 * timeout protection in the same hook.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillDetail } from '../../src/components/use-skill-detail.js';
import { useUIStore } from '../../src/stores/ui-store.js';

const wsRef = vi.hoisted(() => ({
  current: { client: undefined as undefined | Record<string, unknown> },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => wsRef.current,
}));

vi.mock('@/lib/view-navigation', () => ({
  showPanel: vi.fn(),
}));

const skill = {
  name: 'demo-skill',
  description: 'demo',
  version: '1.0.0',
  source: 'project',
  sourceUrl: 'github:demo/repo',
  ref: 'main',
  path: '/skills/demo',
  trigger: 'demo',
  scope: ['demo'],
};

function makeClient(editSkillImpl?: () => void) {
  const registered: Record<string, (msg: unknown) => void> = {};
  const client = {
    on: vi.fn((event: string, handler: (msg: unknown) => void) => {
      registered[event] = handler;
    }),
    off: vi.fn((event: string) => {
      delete registered[event];
    }),
    send: vi.fn(),
    editSkill: vi.fn(editSkillImpl),
    uninstallSkill: vi.fn(),
  };
  return { client, registered };
}

async function renderSkillHook(client: Record<string, unknown>) {
  wsRef.current.client = client;
  useUIStore.setState({
    skillsState: {
      selectedSkill: skill,
      navHistory: [skill],
      historyIndex: 0,
      knownRefs: {},
      updateAvailableCount: 0,
    },
  } as never);
  const rendered = renderHook(() => useSkillDetail({}));
  await act(async () => {
    rendered.result.current.setEditContent('new body');
  });
  return { result: rendered.result };
}

describe('useSkillDetail — save/uninstall exchanges are failure-safe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useUIStore.setState({ skillsState: undefined } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('save: a throwing editSkill removes the handler and clears editSaving', async () => {
    const { client, registered } = makeClient(() => {
      throw new Error('boom');
    });
    const { result } = await renderSkillHook(client);
    let caught: unknown;
    await act(async () => {
      try {
        result.current.handleSaveEdit();
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeUndefined();
    expect(registered['skills.edited']).toBeUndefined();
    expect(result.current.editSaving).toBe(false);
    expect(result.current.editError).toContain('boom');
  });

  it('save: a never-acked save fires the fail-safe and removes the handler', async () => {
    const { client, registered } = makeClient();
    const { result } = await renderSkillHook(client);
    await act(async () => {
      result.current.handleSaveEdit();
    });
    expect(registered['skills.edited']).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(registered['skills.edited']).toBeUndefined();
    expect(result.current.editSaving).toBe(false);
  });

  it('save: happy ack cleans up by itself', async () => {
    const { client, registered } = makeClient();
    const { result } = await renderSkillHook(client);
    await act(async () => {
      result.current.handleSaveEdit();
    });
    expect(registered['skills.edited']).toBeDefined();
    await act(async () => {
      registered['skills.edited']?.({ payload: { success: true, error: null } });
    });
    expect(registered['skills.edited']).toBeUndefined();
    expect(result.current.editSaving).toBe(false);
    expect(result.current.editMode).toBe(false);
  });

  it('uninstall: a throwing uninstallSkill removes the handler and clears uninstalling', async () => {
    const registered: Record<string, (msg: unknown) => void> = {};
    const client = {
      on: vi.fn((event: string, handler: (msg: unknown) => void) => {
        registered[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete registered[event];
      }),
      send: vi.fn(),
      editSkill: vi.fn(),
      uninstallSkill: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    wsRef.current.client = client;
    const { result } = await renderSkillHook(client as Record<string, unknown>);
    await act(async () => {
      await result.current.handleUninstallSkill(skill);
    });
    expect(registered['skills.uninstalled']).toBeUndefined();
    expect(result.current.uninstalling).toBe(false);
    expect(result.current.editError).toContain('boom');
  });

  it('uninstall: a never-acked uninstall fires the fail-safe', async () => {
    const { client, registered } = makeClient();
    const { result } = await renderSkillHook(client);
    await act(async () => {
      await result.current.handleUninstallSkill(skill);
    });
    expect(registered['skills.uninstalled']).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(registered['skills.uninstalled']).toBeUndefined();
    expect(result.current.uninstalling).toBe(false);
  });
});
