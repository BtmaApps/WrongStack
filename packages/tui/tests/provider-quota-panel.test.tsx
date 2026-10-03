import { describe, expect, it, vi } from 'vitest';
import { ResourceMenu } from '../src/components/resource-menu.js';
import { displayWidth } from '../src/terminal-width.js';
import type { ResourceMenuSnapshot } from '../src/ui-contracts.js';
import { createAppJourney, waitForJourney } from './helpers/app-journey-harness.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const snapshot: ResourceMenuSnapshot = {
  id: 'provider-quota',
  title: 'Providers',
  items: [
    {
      id: 'codex',
      label: 'codex',
      summary: 'Plan quota',
      details: [],
      body: '5h: 25% used\nWeekly: 10% used',
      actions: [{ key: 'r', label: 'refresh quota', command: '/provider-quota' }],
    },
    {
      id: 'copilot',
      label: 'copilot',
      summary: 'Premium quota',
      details: [],
      body: 'Premium: 75% used',
      actions: [{ key: 'r', label: 'refresh quota', command: '/provider-quota' }],
    },
  ],
};

describe('provider quota panel', () => {
  it.each([40, 52, 80, 110])(
    'renders a narrow list and selected reading within %i columns',
    async (columns) => {
      const view = renderRealTty(
        <ResourceMenu snapshot={snapshot} selected={1} columns={columns} maxRows={12} />,
        { columns, rows: 40 },
      );
      try {
        await settle();
        const frame = view.lastFrame();
        expect(frame).toContain('Providers');
        expect(frame).toContain('codex');
        expect(frame).toContain('Premium: 75% used');
        expect(frame).not.toContain('5h: 25% used');
        const lines = frame.trimEnd().split('\n');
        expect(lines.length).toBeLessThanOrEqual(12);
        expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(columns);
      } finally {
        view.unmount();
      }
    },
  );

  it('refreshes using the canonical command, discards its dump and navigates without adding quota to history', async () => {
    const journey = createAppJourney();
    const run = vi.fn().mockResolvedValue({ message: 'QUOTA TEXT DUMP' });
    journey.props.slashRegistry.register({ name: 'provider-quota', description: 'Quota', run });
    const getResourceMenu = vi.fn(async () => snapshot);
    const view = journey.mount({ getResourceMenu });
    try {
      await waitForJourney(() => journey.props.slashRegistry.ownerOf('provider-quota') === 'tui');
      const result = await journey.props.slashRegistry.dispatch(
        '/provider-quota',
        journey.agent.ctx,
      );
      expect(result?.message).toBeUndefined();
      expect(run).toHaveBeenCalledOnce();
      expect(getResourceMenu).toHaveBeenCalledWith('provider-quota');
      await waitForJourney(() => (view.lastFrame() ?? '').includes('5h: 25% used'));
      view.stdin.write('\u001b[B');
      await waitForJourney(() => (view.lastFrame() ?? '').includes('Premium: 75% used'));
      expect(view.lastFrame()).not.toContain('QUOTA TEXT DUMP');
      expect(journey.agent.ctx.messages).toEqual([]);
      view.stdin.write('r');
      await waitForJourney(() => run.mock.calls.length === 2);
      await waitForJourney(() => (view.lastFrame() ?? '').includes('5h: 25% used'));
      expect(getResourceMenu).toHaveBeenCalledTimes(2);
      expect(view.lastFrame()).not.toContain('QUOTA TEXT DUMP');
      view.stdin.write('\u001b');
      await waitForJourney(() => !(view.lastFrame() ?? '').includes('5h: 25% used'));
      expect(journey.agent.ctx.messages).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
