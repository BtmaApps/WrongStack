import type { Agent, RunResult } from '@wrongstack/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.js';
import {
  createAppJourney,
  createJourneyAgent,
  waitForJourney,
} from './helpers/app-journey-harness.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

vi.mock('@wrongstack/kanban', async (original) => ({
  ...(await original<typeof import('@wrongstack/kanban')>()),
  listBoards: vi.fn(async () => []),
}));
const panels = [
  ['F1', '\x1bOP', 'PROJECTS'],
  ['F2', '\x1bOQ', 'FLEET CONTROL'],
  ['F3', '\x1bOR', 'AGENTS'],
  ['F4', '\x1bOS', 'WORKTREES'],
  ['F5', '\x1b[15~', 'PLAN'],
  ['F6', '\x1b[17~', 'TODOS'],
  ['F7', '\x1b[18~', 'MESSAGE QUEUE'],
  ['F8', '\x1b[19~', 'PROCESSES'],
  ['F9', '\x1b[20~', 'GOAL'],
  ['F10', '\x1b[21~', 'SESSIONS'],
  ['F11', '\x1b[23~', 'COORDINATOR'],
  ['F12', '\x1b[24~', 'KANBAN'],
] as const;

describe('F1-F12 application journey', () => {
  it.each([
    [120, 40],
    [80, 24],
    [52, 16],
  ])('visits every panel at %ix%i during a live run', async (columns, rows) => {
    let signal: AbortSignal | undefined;
    const agent = createJourneyAgent() as Agent;
    agent.run = vi.fn(
      async (_blocks, options) =>
        new Promise<RunResult>((resolve) => {
          signal = options?.signal;
          signal?.addEventListener('abort', () => resolve({ status: 'aborted', iterations: 0 }));
        }),
    );
    const journey = createAppJourney(agent);
    const view = renderRealTty(
      <App
        {...journey.props}
        initialAsk="hold this run"
        getProjectPickerItems={async () => [
          { key: 'project', label: 'Audit project', kind: 'project' },
        ]}
        getLiveSessions={async () => []}
      />,
      { columns, rows },
    );
    try {
      await waitForJourney(() => signal !== undefined);
      for (const [key, sequence, title] of panels) {
        view.stdin.write(sequence);
        await settle(150);
        const failure = view.stdout.frames
          .join('\n')
          .match(/(?:ERROR|Maximum update depth)[\s\S]{0,1400}/)?.[0];
        expect(failure, `${key} opened at ${columns}x${rows}`).toBeUndefined();
        expect(view.lastFrame(), `${key} opened`).toContain(title);
        expect(signal?.aborted, `${key} did not abort work`).toBe(false);
        view.stdin.write('\x1b[B');
        view.stdin.write('\x1b[A');
        await settle(50);
        view.resize(columns, rows - 2);
        await settle(100);
        expect(view.lastFrame(), `${key} survives resize`).toContain(title);
        view.resize(columns, rows);
        await settle(100);
        view.stdin.write('\x1b');
        await settle(150);
        expect(view.lastFrame(), `${key} closes with Esc`).not.toContain(title);
        expect(signal?.aborted, `${key} close did not abort work`).toBe(false);
      }
    } finally {
      view.unmount();
    }
  });
});
