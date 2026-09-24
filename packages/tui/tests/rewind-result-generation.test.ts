import type { Agent } from '@wrongstack/core/agent';
import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionRewind } from '../src/hooks/use-session-rewind.js';
import { Text } from '../src/ink.js';
import { submitSlashCommand } from '../src/submit-slash-command.js';

type SubmitOptions = Parameters<typeof submitSlashCommand>[0];

/** Run one slash command whose handler advances the session generation the
 *  way /rewind does (stopping producers), and return the rendered entries. */
async function submitAdvancing(metadata: Record<string, unknown> | undefined) {
  const sessionGenerationRef = { current: 0 };
  const dispatch = vi.fn();
  const slashRegistry = {
    dispatch: vi.fn(async () => {
      sessionGenerationRef.current++;
      return { message: 'Rewind failed: boom', ...(metadata ? { metadata } : {}) };
    }),
  };
  await submitSlashCommand({
    trimmed: '/rewind 9',
    sessionGenerationRef,
    tokenPreviewsRef: { current: new Map() },
    isAutomaticBugHuntReplay: false,
    dispatch,
    pushSubmittedHistory: () => undefined,
    clearDraft: () => undefined,
    slashRegistry,
    agent: { ctx: {} },
    refreshGoalSummary: () => undefined,
    onBugHuntStarted: () => undefined,
  } as unknown as SubmitOptions);
  return dispatch.mock.calls
    .map(([action]) => action)
    .filter((a) => a.type === 'addEntry')
    .map((a) => `${a.entry.kind}: ${a.entry.text}`);
}

describe('slash results from commands that advance the session generation', () => {
  it('renders the result when the command flags that it advanced the generation', async () => {
    expect(await submitAdvancing({ advancedSessionGeneration: true })).toEqual([
      'user: /rewind 9',
      'info: Rewind failed: boom',
    ]);
  });

  it('still drops an unflagged result as stale output', async () => {
    expect(await submitAdvancing(undefined)).toEqual(['user: /rewind 9']);
  });
});

describe('useSessionRewind redo', () => {
  function mount(peek: unknown) {
    const abortLeader = vi.fn();
    const generation = { current: 0 };
    let hook: ReturnType<typeof useSessionRewind> | null = null;
    const agent = {
      ctx: {
        session: {
          id: 's1',
          peekRedo: vi.fn(async () => peek),
          restoreRedo: vi.fn(async () => null),
        },
        state: {},
        cwd: process.cwd(),
      },
    } as unknown as Agent;
    function Harness(): React.ReactElement {
      hook = useSessionRewind({
        agent,
        sessionsDir: process.cwd(),
        interruptController: { abortLeader } as never,
        liveDirector: () => null,
        sessionGenerationRef: generation,
      });
      return React.createElement(Text, null, 'x');
    }
    render(React.createElement(Harness));
    return { hook: () => hook!, abortLeader, generation };
  }

  it('does not abort a running turn when there is nothing to redo', async () => {
    const { hook, abortLeader, generation } = mount(null);
    expect(await hook().handleRewindRedo()).toBeNull();
    expect(abortLeader).not.toHaveBeenCalled();
    expect(generation.current).toBe(0);
  });

  it('stops the producers before redoing a pending rewind', async () => {
    const { hook, abortLeader, generation } = mount({ toPromptIndex: 1, events: [] });
    // The redo itself fails on the stub store; only the stop is under test.
    await hook()
      .handleRewindRedo()
      .catch(() => undefined);
    expect(abortLeader).toHaveBeenCalledTimes(1);
    expect(generation.current).toBe(1);
  });
});
