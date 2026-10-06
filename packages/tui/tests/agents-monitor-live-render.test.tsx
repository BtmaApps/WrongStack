import type { Agent, RunResult } from '@wrongstack/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.js';
import {
  createAppJourney,
  createJourneyAgent,
  waitForJourney,
} from './helpers/app-journey-harness.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

describe('F3 live rendering', () => {
  it.each([
    [120, 40],
    [80, 24],
    [52, 16],
  ])(
    'opens and closes F3 during an active run at %ix%i without aborting the agent',
    async (columns, rows) => {
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
      const view = renderRealTty(<App {...journey.props} initialAsk="keep running" />, {
        columns,
        rows,
      });
      try {
        await waitForJourney(() => signal !== undefined);
        view.stdin.write('\x1bOR');
        await settle(200);
        const failure = view.stdout.frames
          .join('\n')
          .match(/(?:ERROR|TypeError|ReferenceError|Maximum update depth)[\s\S]{0,2400}/)?.[0];
        expect(failure).toBeUndefined();
        expect(view.lastFrame()).toContain('AGENTS');
        expect(signal?.aborted).toBe(false);
        await settle(1200);
        expect(view.lastFrame()).toContain('AGENTS');
        expect(signal?.aborted).toBe(false);
        view.resize(columns, rows - 2);
        await settle(200);
        expect(view.lastFrame()).toContain('AGENTS');
        expect(signal?.aborted).toBe(false);
        view.stdin.write('\x1bOR');
        await settle(200);
        expect(view.lastFrame()).not.toContain('AGENTS');
        expect(signal?.aborted).toBe(false);
      } finally {
        view.unmount();
      }
    },
  );
});
