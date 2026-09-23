import { afterEach, describe, expect, it, vi } from 'vitest';

const resumeSession = vi.hoisted(() => vi.fn());
vi.mock('../src/boot/tui-session-resume.js', () => ({ resumeSession }));

import { getAutoSuggestions, setAutoSuggestions } from '../src/services/suggestion-store.js';
import { createTuiResumeCallback } from '../src/tui-resume-callback.js';

function callback(todos: unknown[] = []) {
  const agent = { ctx: { todos } };
  const dependencies = {
    state: {},
    agent,
    tokenCounter: {},
    switchProviderAndModel: vi.fn(),
    events: {},
  } as unknown as Parameters<typeof createTuiResumeCallback>[0];
  return { run: createTuiResumeCallback(dependencies), dependencies };
}

afterEach(() => {
  resumeSession.mockReset();
  setAutoSuggestions([]);
});

describe('TUI resume callback', () => {
  it('reports the failed stage and forwards progress callbacks', async () => {
    const { run, dependencies } = callback();
    const onLoadProgress = vi.fn();
    const onStage = vi.fn();
    resumeSession.mockImplementation(async (options) => {
      options.onFailure({ stage: 'open_writer', message: 'journal is unreadable' });
      return null;
    });

    await expect(run('session-a', onLoadProgress, onStage)).rejects.toThrow(
      'journal is unreadable (at open_writer)',
    );
    expect(resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({ ...dependencies, onLoadProgress, onStage }),
      'session-a',
    );
  });

  it('clears stale auto suggestions and offers resumed next steps without executing them', async () => {
    const { run } = callback();
    setAutoSuggestions(['stale prompt']);
    resumeSession.mockResolvedValue({
      attached: true,
      lastAssistantText: '<nextsteps>\n1. Inspect the parser\n</nextsteps>',
      entries: [],
    });

    const result = await run('session-b');
    expect(getAutoSuggestions()).toEqual([]);
    expect(result.nextSteps).toEqual(['Inspect the parser']);
  });

  it('does not offer next steps for a read-only resume', async () => {
    const { run } = callback();
    resumeSession.mockResolvedValue({
      attached: false,
      lastAssistantText: '<nextsteps>\n1. Inspect the parser\n</nextsteps>',
      entries: [],
    });
    expect((await run('session-c')).nextSteps).toEqual([]);
  });
});
