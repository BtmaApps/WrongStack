import type { HistoryRetention, RequestResidency } from '@wrongstack/core/utils';
import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { ContextPanel, type ContextPanelData } from '../src/components/context-panel.js';
import { emptyMemoryContextMonitor } from '../src/memory-context-monitor.js';
import { waitForFrame } from './helpers/frame-wait.js';

function residency(over: Partial<RequestResidency> = {}): RequestResidency {
  return {
    seq: 7,
    at: 1_000,
    providerId: 'anthropic',
    model: 'claude-opus-5-5',
    mechanism: 'explicit',
    segments: [
      { kind: 'tools', tokens: 3_680, lane: 'cached', count: 40 },
      { kind: 'system', tokens: 5_400, lane: 'cached', count: 3 },
      { kind: 'history-prior', tokens: 17_160, lane: 'cached', count: 30 },
      { kind: 'history-new', tokens: 3_430, lane: 'written', count: 2 },
      {
        kind: 'live-tail',
        tokens: 1_801,
        lane: 'uncached',
        count: 3,
        parts: [
          { source: 'memory-evidence', tokens: 1_143 },
          { source: 'ledger', tokens: 429 },
        ],
      },
    ],
    lanes: { cached: 26_240, written: 3_430, uncached: 1_801 },
    total: 31_471,
    expectedCacheRatio: 0.83,
    actual: { input: 2_400, cacheRead: 29_000, cacheWrite: 3_500, total: 34_900, cacheRatio: 0.83 },
    verdict: 'hit',
    breakers: [],
    sincePreviousMs: 90_000,
    next: { rewritten: false, pendingMessages: 2, pendingTokens: 1_200 },
    ...over,
  };
}

function retention(): HistoryRetention {
  return {
    preserveK: 6,
    eliseThreshold: 1_200,
    preserveStart: 26,
    classes: {
      protected: { messages: 6, tokens: 5_718 },
      'elision-candidate': { messages: 2, tokens: 9_000 },
      compactable: { messages: 22, tokens: 5_872 },
      elided: { messages: 0, tokens: 0 },
      digest: { messages: 1, tokens: 300 },
    },
    total: 20_890,
  };
}

function data(over: Partial<ContextPanelData> = {}): ContextPanelData {
  return {
    ctxPct: 0.16,
    ctxTokens: 31_471,
    ctxMaxTokens: 200_000,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    mode: 'balanced',
    uptime: '3m',
    breakdown: undefined,
    residency: residency(),
    retention: retention(),
    fleetEntries: [],
    leaderIterations: 4,
    leaderToolCalls: 9,
    leaderStatus: 'idle',
    memoryContext: emptyMemoryContextMonitor(),
    ...over,
  };
}

describe('ContextPanel Residency tab', () => {
  it('jumps to Residency with key 6 and shows lanes, segments, verdict and retention', async () => {
    const { lastFrame, stdin, unmount } = render(
      React.createElement(ContextPanel, { data: data(), onClose: () => {} }),
    );
    stdin.write('6');
    const frame = await waitForFrame({ lastFrame }, (f) => f.includes('LAST REQUEST'));
    expect(frame).toContain('system prompt (stable)');
    expect(frame).toContain('live context · this request');
    expect(frame).toContain('memory-evidence 1.1k');
    expect(frame).toContain('not cached');
    expect(frame).toContain('hit — the prefix was reused as expected');
    expect(frame).toContain('read 29.0k');
    expect(frame).toContain('HISTORY RETENTION');
    expect(frame).toContain('elision candidates');
    expect(frame).toContain('compaction digests');
    expect(frame).not.toContain('already elided');
    expect(frame).not.toContain('PRESSURE');
    unmount();
  });

  it('names what broke the cache', async () => {
    const { lastFrame, stdin, unmount } = render(
      React.createElement(ContextPanel, {
        data: data({
          residency: residency({
            verdict: 'miss',
            breakers: [{ kind: 'tools', detail: 'tool surface changed (40 → 41 definitions)' }],
          }),
        }),
        onClose: () => {},
      }),
    );
    stdin.write('6');
    const frame = await waitForFrame({ lastFrame }, (f) => f.includes('↯'));
    expect(frame).toContain('miss — nothing was read from cache');
    expect(frame).toContain('tool surface changed (40 → 41 definitions)');
    unmount();
  });

  it('shows an honest empty state before the first request', async () => {
    const { lastFrame, stdin, unmount } = render(
      React.createElement(ContextPanel, {
        data: data({ residency: undefined }),
        onClose: () => {},
      }),
    );
    stdin.write('6');
    const frame = await waitForFrame({ lastFrame }, (f) => f.includes('No request sent yet'));
    expect(frame).toContain('No request sent yet');
    expect(frame).toContain('HISTORY RETENTION');
    unmount();
  });
});
