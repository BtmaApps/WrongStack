/**
 * PLAN QUOTA sidebar card through the real Ink renderer (fake TTY).
 *
 * The scroll clamp reserves exactly header + SIDEBAR_QUOTA_BODY_ROWS + caps for
 * this card, which is only honest if every model row renders as ONE terminal
 * line at every rail width. These tests hold the card to that, and to the
 * frame-width contract every other sidebar card keeps.
 */

import { recordProviderQuota, resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, describe, expect, it } from 'vitest';
import type { State } from '../src/app-state.js';
import type { FleetEntry } from '../src/app-state-fleet.js';
import {
  computeSidebarContentWidth,
  computeSidebarWidth,
  RightSidebar,
} from '../src/components/sidebar.js';
import { SidebarContent } from '../src/components/sidebar-content.js';
import { buildQuotaCardModel, type QuotaCardModel } from '../src/components/sidebar-quota-model.js';
import { Box } from '../src/ink.js';
import { estimateSidebarMaxScroll } from '../src/reducers/workspace-panels.js';
import { displayWidth } from '../src/terminal-width.js';
import { SIDEBAR_QUOTA_BODY_ROWS } from '../src/ui-contracts.js';
import { createTestState } from './helpers/create-test-state.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

afterEach(() => {
  resetProviderQuota();
});

const ENTRIES: Record<string, FleetEntry> = {
  leader: { id: 'leader', name: 'Leader Agent', status: 'idle' } as FleetEntry,
};

const now = Date.now();
const HOUR = 3_600_000;

function card(): QuotaCardModel {
  const model = buildQuotaCardModel(
    [
      {
        providerId: 'minimax-coding-plan',
        meterId: 'MiniMax-M*',
        meterLabel: 'MiniMax-M*',
        planLabel: 'token plan',
        windows: [
          {
            id: 'primary',
            usedPercent: 73,
            windowMinutes: 300,
            resetsAt: Math.floor((now + 3 * HOUR) / 1000),
          },
          {
            id: 'secondary',
            usedPercent: 34,
            windowMinutes: 10080,
            resetsAt: Math.floor((now + 6 * 24 * HOUR) / 1000),
          },
        ],
        capturedAt: now,
      },
      {
        providerId: 'openai-codex-with-a-long-account-alias',
        meterId: 'codex',
        windows: [{ id: 'primary', usedPercent: 100, windowMinutes: 300 }],
        reachedWindowId: 'primary',
        capturedAt: now,
      },
      {
        providerId: 'minimax-balance',
        meterId: 'balance',
        windows: [{ id: 'primary', usedPercent: 12 }],
        credits: { hasCredits: true, unlimited: false, balance: '12.50' },
        capturedAt: now,
      },
    ],
    'minimax-coding-plan',
    'MiniMax-M3',
    now,
  );
  if (!model) throw new Error('expected a card');
  return model;
}

async function renderSidebar(columns: number, quota: QuotaCardModel | undefined) {
  const rows = 60;
  const sidebarWidth = computeSidebarWidth(columns);
  const contentWidth = computeSidebarContentWidth(sidebarWidth);
  const view = renderRealTty(
    <Box width={columns} height={rows} justifyContent="flex-end" overflowX="hidden">
      <RightSidebar width={sidebarWidth} maxHeight={rows}>
        <SidebarContent
          contextWindow={{ used: 48_000, max: 200_000 }}
          cacheStats={{ readTokens: 0, writeTokens: 0, hitRatio: 0, savedUsd: 0 }}
          quota={quota}
          entries={ENTRIES}
          fleetCounts={{ running: 0, idle: 1, pending: 0, completed: 0 }}
          provider="minimax-coding-plan"
          model="MiniMax-M3"
          width={contentWidth}
        />
      </RightSidebar>
    </Box>,
    { columns, rows },
  );
  await settle();
  return view;
}

describe('PLAN QUOTA sidebar card', () => {
  it.each([100, 140, 200])('renders one line per model row at %i columns', async (columns) => {
    const quota = card();
    const view = await renderSidebar(columns, quota);
    try {
      const lines = view.lines();
      expect(lines.every((line) => displayWidth(line) <= columns)).toBe(true);
      const header = lines.findIndex((line) => line.includes('PLAN QUOTA'));
      expect(header).toBeGreaterThanOrEqual(0);
      const bottom = lines.findIndex((line, i) => i > header && line.includes('╰'));
      // Header + one line per row, nothing soft-wrapped onto a second line.
      expect(bottom - header - 1).toBe(quota.rows.length);
      const body = lines.slice(header, bottom).join('\n');
      expect(body).toContain('73%');
      expect(body).toContain('MAX');
      // Narrow rails truncate the provider name rather than wrapping it.
      expect(body).toContain(columns >= 140 ? 'minimax-coding-plan' : 'minimax-coding');
      if (columns >= 200) expect(body).toContain('token plan');
    } finally {
      view.unmount();
    }
  });

  it('is absent when no provider meters a plan', async () => {
    const view = await renderSidebar(140, undefined);
    try {
      expect(view.lastFrame()).not.toContain('PLAN QUOTA');
      expect(view.lastFrame()).toContain('PROMPT CACHE');
    } finally {
      view.unmount();
    }
  });

  it('reserves the card in the sidebar scroll budget only once quota exists', () => {
    const state = createTestState() as State;
    const before = estimateSidebarMaxScroll(state, 1);
    recordProviderQuota('minimax', [
      {
        providerId: 'minimax',
        meterId: 'MiniMax-M*',
        windows: [{ id: 'primary', usedPercent: 5 }],
        capturedAt: now,
      },
    ]);
    expect(estimateSidebarMaxScroll(state, 1) - before).toBe(3 + SIDEBAR_QUOTA_BODY_ROWS);
  });
});
