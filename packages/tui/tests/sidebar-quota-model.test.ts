/**
 * Sidebar PLAN QUOTA card model — which quota readings the right rail shows
 * for the provider and model in use, and that it never exceeds the row budget
 * the scroll clamp reserves.
 */

import {
  type ProviderQuotaSnapshot,
  type ProviderQuotaWindow,
  recordProviderQuota,
  resetProviderQuota,
} from '@wrongstack/core/quota';
import { afterEach, describe, expect, it } from 'vitest';
import { buildQuotaCardModel, type QuotaCardRow } from '../src/components/sidebar-quota-model.js';
import { SIDEBAR_QUOTA_BODY_ROWS } from '../src/ui-contracts.js';

afterEach(() => {
  resetProviderQuota();
});

const NOW = 1_790_000_000_000;
const HOUR = 3_600_000;
const inSeconds = (ms: number) => Math.floor((NOW + ms) / 1000);

function win(id: string, usedPercent: number, extra: Partial<ProviderQuotaWindow> = {}) {
  return { id, usedPercent, ...extra };
}

function snap(
  providerId: string,
  meterId: string,
  windows: ProviderQuotaWindow[],
  extra: Partial<ProviderQuotaSnapshot> = {},
): ProviderQuotaSnapshot {
  return { providerId, meterId, windows, capturedAt: NOW, ...extra };
}

const FIVE_HOUR = { windowMinutes: 300, resetsAt: inSeconds(2 * HOUR) };
const WEEK = { windowMinutes: 10080, resetsAt: inSeconds(5 * 24 * HOUR) };

function kinds(rows: readonly QuotaCardRow[]): string[] {
  return rows.map((r) => r.kind);
}

/**
 * Does a model-scoped meter named `meterId` apply to `model`? Probed through
 * the card: beside an account-wide meter, an applicable meter is shown and an
 * inapplicable one is folded into "+1 more".
 */
function meterApplies(meterId: string, model: string): boolean {
  const card = buildQuotaCardModel(
    [snap('p', 'default', [win('primary', 1)]), snap('p', meterId, [win('primary', 2)])],
    'p',
    model,
    NOW,
  );
  return !card?.rows.some((r) => r.kind === 'more');
}

function severityAt(usedPercent: number, reached = false): string | undefined {
  const card = buildQuotaCardModel(
    [
      snap('p', 'default', [win('primary', usedPercent)], {
        ...(reached ? { reachedWindowId: 'primary' } : {}),
      }),
    ],
    'p',
    'm',
    NOW,
  );
  return card?.headline?.severity;
}

describe('model matching and severity', () => {
  it('matches meter globs and differently-spelled slugs to the active model', () => {
    expect(meterApplies('MiniMax-M*', 'MiniMax-M3')).toBe(true);
    expect(meterApplies('MiniMax-M*', 'minimax-m3.1-flash-preview')).toBe(true);
    expect(meterApplies('gpt_5_1_codex_mini', 'gpt-5.1-codex-mini')).toBe(true);
    expect(meterApplies('gpt_5_1_codex_mini', 'gpt-5.1-codex')).toBe(false);
    expect(meterApplies('speech-hd', 'MiniMax-M3')).toBe(false);
    expect(meterApplies('a.(b)*', 'ab-anything')).toBe(true);
    expect(meterApplies('---', 'm')).toBe(false);
  });

  it('grades severity like the statusline chip', () => {
    expect(severityAt(10)).toBe('ok');
    expect(severityAt(70)).toBe('warn');
    expect(severityAt(90)).toBe('critical');
    expect(severityAt(5, true)).toBe('critical');
  });
});

describe('buildQuotaCardModel', () => {
  it('renders nothing when no provider meters a plan', () => {
    expect(buildQuotaCardModel([], 'anthropic', 'claude')).toBeUndefined();
    // A reading with no windows and no credits has nothing to show.
    expect(buildQuotaCardModel([snap('x', 'default', [])], 'x', 'm')).toBeUndefined();
  });

  it('shows the MiniMax meter that covers the active model, with both windows', () => {
    const card = buildQuotaCardModel(
      [
        snap(
          'minimax-coding-plan',
          'MiniMax-M*',
          [win('primary', 73, FIVE_HOUR), win('secondary', 34, WEEK)],
          { meterLabel: 'MiniMax-M*', planLabel: 'token plan' },
        ),
      ],
      'minimax-coding-plan',
      'MiniMax-M3',
      NOW,
    );
    expect(card?.headline).toEqual({
      label: '5h',
      usedPercent: 73,
      reached: false,
      severity: 'warn',
    });
    expect(card?.rows).toEqual([
      { kind: 'provider', providerId: 'minimax-coding-plan', planLabel: 'token plan' },
      { kind: 'meter', title: 'MiniMax-M*' },
      {
        kind: 'window',
        label: '5h',
        usedPercent: 73,
        resetIn: '2h',
        reached: false,
        severity: 'warn',
      },
      {
        kind: 'window',
        label: '7d',
        usedPercent: 34,
        resetIn: '5d',
        reached: false,
        severity: 'ok',
      },
    ]);
  });

  it('keeps the Codex account meter, hides another model’s meter and counts it', () => {
    const card = buildQuotaCardModel(
      [
        snap('openai-codex', 'codex', [win('primary', 20, FIVE_HOUR), win('secondary', 5, WEEK)], {
          planLabel: 'pro',
        }),
        snap('openai-codex', 'gpt_5_1_codex_mini', [win('primary', 95, FIVE_HOUR)], {
          meterLabel: 'GPT-5.1-Codex-Mini',
        }),
      ],
      'openai-codex',
      'gpt-5.1-codex',
      NOW,
    );
    expect(kinds(card?.rows ?? [])).toEqual(['provider', 'window', 'window', 'more']);
    expect(card?.rows.at(-1)).toEqual({ kind: 'more', count: 1 });
    // The headline is the ACTIVE model's worst window, not the hidden 95%.
    expect(card?.headline?.usedPercent).toBe(20);
  });

  it('shows the model-scoped Codex meter when that model is the one running', () => {
    const card = buildQuotaCardModel(
      [
        snap('openai-codex', 'codex', [win('primary', 20, FIVE_HOUR)]),
        snap('openai-codex', 'gpt_5_1_codex_mini', [win('primary', 95, FIVE_HOUR)], {
          meterLabel: 'GPT-5.1-Codex-Mini',
        }),
      ],
      'openai-codex',
      'gpt-5.1-codex-mini',
      NOW,
    );
    expect(kinds(card?.rows ?? [])).toEqual(['provider', 'window', 'meter', 'window']);
    expect(card?.headline).toMatchObject({ usedPercent: 95, severity: 'critical' });
  });

  it('falls back to every meter when none is scoped to the active model', () => {
    const card = buildQuotaCardModel(
      [snap('p', 'other_model', [win('primary', 50, FIVE_HOUR)])],
      'p',
      'this-model',
      NOW,
    );
    expect(kinds(card?.rows ?? [])).toEqual(['provider', 'meter', 'window']);
  });

  it('narrows per-model buckets (Antigravity) to the active model', () => {
    const card = buildQuotaCardModel(
      [
        snap('google-antigravity', 'antigravity', [
          win('gemini-3-pro', 80),
          win('gemini-3-flash', 10),
          win('claude-sonnet', 99),
        ]),
      ],
      'google-antigravity',
      'gemini-3-flash',
      NOW,
    );
    const windows = (card?.rows ?? []).filter((r) => r.kind === 'window');
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ label: 'gemini-3-flash', usedPercent: 10 });
    expect(card?.rows.at(-1)).toEqual({ kind: 'more', count: 2 });
    // The headline is a window this card RENDERS. The hidden 99% bucket is
    // neither badged nor allowed to colour the card red on the badge.
    expect(card?.headline).toEqual({
      label: 'gemini-3-flash',
      usedPercent: 10,
      reached: false,
      severity: 'ok',
    });
  });

  it('warns under the visible bucket, never one it folded away', () => {
    // gemini-3-flash climbs 40% → 60% over 30 minutes, so the last hour's pace
    // fills it in ~1h, before its reset. The forecast is per window, so it must
    // be read off the buckets the card actually renders: choosing a hidden one
    // leaves the card with no pace warning anywhere.
    const reading = (usedPercent: number, at: number) =>
      snap(
        'google-antigravity',
        'antigravity',
        [
          win('gemini-3-pro', 80),
          win('gemini-3-flash', usedPercent, FIVE_HOUR),
          win('claude-sonnet', 99),
        ],
        { capturedAt: at },
      );
    recordProviderQuota('google-antigravity', [reading(40, NOW - 30 * 60_000)], NOW - 30 * 60_000);
    recordProviderQuota('google-antigravity', [reading(60, NOW)], NOW);
    const card = buildQuotaCardModel(
      [reading(60, NOW)],
      'google-antigravity',
      'gemini-3-flash',
      NOW,
    );
    expect(kinds(card?.rows ?? [])).toEqual(['provider', 'window', 'pace', 'more']);
    expect(card?.rows[2]).toEqual({ kind: 'pace', exhaustsIn: '1h' });
  });

  it('marks the window cutting the account off', () => {
    const card = buildQuotaCardModel(
      [snap('p', 'default', [win('primary', 100, FIVE_HOUR)], { reachedWindowId: 'primary' })],
      'p',
      undefined,
      NOW,
    );
    expect(card?.headline).toMatchObject({ reached: true, severity: 'critical' });
    expect(card?.rows[1]).toMatchObject({ kind: 'window', reached: true });
  });

  it('reduces every other provider to one row, worst first', () => {
    const card = buildQuotaCardModel(
      [
        snap('minimax', 'MiniMax-M*', [win('primary', 10, FIVE_HOUR)]),
        snap('openai-codex', 'codex', [win('primary', 30, FIVE_HOUR), win('secondary', 60, WEEK)]),
        snap('anthropic-oauth', 'default', [win('primary', 91, FIVE_HOUR)], {
          reachedWindowId: 'primary',
        }),
      ],
      'minimax',
      'MiniMax-M3',
      NOW,
    );
    const others = (card?.rows ?? []).filter((r) => r.kind === 'other');
    expect(others).toEqual([
      {
        kind: 'other',
        providerId: 'anthropic-oauth',
        label: '5h',
        usedPercent: 91,
        reached: true,
        severity: 'critical',
      },
      {
        kind: 'other',
        providerId: 'openai-codex',
        label: '7d',
        usedPercent: 60,
        reached: false,
        severity: 'ok',
      },
    ]);
    expect(card?.headline?.usedPercent).toBe(10);
  });

  it('still shows other providers when the active one meters nothing', () => {
    const card = buildQuotaCardModel(
      [snap('openai-codex', 'codex', [win('primary', 42, FIVE_HOUR)])],
      'anthropic',
      'claude',
      NOW,
    );
    expect(kinds(card?.rows ?? [])).toEqual(['other']);
    // No active reading: the badge falls back to the worst anywhere.
    expect(card?.headline?.usedPercent).toBe(42);
  });

  it('renders credits, including a pay-as-you-go balance with no windows', () => {
    const rows = (credits: ProviderQuotaSnapshot['credits']) =>
      buildQuotaCardModel([snap('p', 'balance', [], { credits })], 'p', 'm', NOW)?.rows ?? [];
    expect(rows({ hasCredits: true, unlimited: false, balance: '12.50' })).toContainEqual({
      kind: 'credits',
      text: 'credits 12.50',
      empty: false,
    });
    expect(rows({ hasCredits: false, unlimited: false, balance: '0' })).toContainEqual({
      kind: 'credits',
      text: 'credits 0',
      empty: true,
    });
    expect(rows({ hasCredits: true, unlimited: true })).toContainEqual({
      kind: 'credits',
      text: 'credits unlimited',
      empty: false,
    });
    expect(rows({ hasCredits: true, unlimited: false })).toContainEqual({
      kind: 'credits',
      text: 'credits available',
      empty: false,
    });
    expect(rows({ hasCredits: false, unlimited: false })).toContainEqual({
      kind: 'credits',
      text: 'no credits',
      empty: true,
    });
  });

  it('warns under the window the last hour’s pace will fill before reset', () => {
    const reading = (usedPercent: number, at: number) =>
      snap('openai-codex', 'codex', [win('primary', usedPercent, FIVE_HOUR)], { capturedAt: at });
    recordProviderQuota('openai-codex', [reading(40, NOW - 30 * 60_000)], NOW - 30 * 60_000);
    recordProviderQuota('openai-codex', [reading(60, NOW)], NOW);
    const card = buildQuotaCardModel([reading(60, NOW)], 'openai-codex', 'gpt-5', NOW);
    expect(kinds(card?.rows ?? [])).toEqual(['provider', 'window', 'pace']);
    expect(card?.rows[2]).toEqual({ kind: 'pace', exhaustsIn: '1h' });
  });

  it('badges a window the "+N more" clamp kept out of the body', () => {
    // `codex` is an ACCOUNT meter, so all eight windows apply to the active
    // model and none is narrowed away. The worst one is deliberately LAST, so
    // the row budget is the only thing that can drop it — and the header badge
    // is contracted to name a window this card actually RENDERS.
    //
    // Every window carries an explicit `label`: `win()` otherwise leaves the
    // card to DERIVE one from `windowMinutes`, and eight FIVE_HOUR windows
    // would all be called `5h` — the badge could then name a dropped window
    // and still match a rendered one by name.
    const windows = [
      win('w10', 10, { ...FIVE_HOUR, label: 'w10' }),
      win('w20', 20, { ...FIVE_HOUR, label: 'w20' }),
      win('w30', 30, { ...FIVE_HOUR, label: 'w30' }),
      win('w40', 40, { ...FIVE_HOUR, label: 'w40' }),
      win('w50', 50, { ...FIVE_HOUR, label: 'w50' }),
      win('w60', 60, { ...FIVE_HOUR, label: 'w60' }),
      win('w70', 70, { ...FIVE_HOUR, label: 'w70' }),
      win('w99', 99, { ...FIVE_HOUR, label: 'w99' }),
    ];
    const card = buildQuotaCardModel(
      [snap('openai-codex', 'codex', windows)],
      'openai-codex',
      'gpt-5',
      NOW,
    );
    // The clamp fired and dropped the tail, `w99` among it.
    expect(card?.rows).toHaveLength(SIDEBAR_QUOTA_BODY_ROWS);
    const visible = (card?.rows ?? []).filter((r) => r.kind === 'window').map((r) => r.label);
    expect(visible).not.toContain('w99');
    // So the badge must name a window that IS rendered, not the folded 99%.
    expect(visible).toContain(card?.headline?.label);
    expect(card?.headline?.usedPercent).toBeLessThan(99);
  });

  it('still badges the worst window when it survives the clamp', () => {
    // Boundary: the same fixture with the worst window FIRST, so the clamp
    // fires but keeps it. The badge must not degrade just because the card
    // overflowed.
    const windows = [
      win('w99', 99, { ...FIVE_HOUR, label: 'w99' }),
      win('w10', 10, { ...FIVE_HOUR, label: 'w10' }),
      win('w20', 20, { ...FIVE_HOUR, label: 'w20' }),
      win('w30', 30, { ...FIVE_HOUR, label: 'w30' }),
      win('w40', 40, { ...FIVE_HOUR, label: 'w40' }),
      win('w50', 50, { ...FIVE_HOUR, label: 'w50' }),
      win('w60', 60, { ...FIVE_HOUR, label: 'w60' }),
      win('w70', 70, { ...FIVE_HOUR, label: 'w70' }),
    ];
    const card = buildQuotaCardModel(
      [snap('openai-codex', 'codex', windows)],
      'openai-codex',
      'gpt-5',
      NOW,
    );
    expect(card?.rows).toHaveLength(SIDEBAR_QUOTA_BODY_ROWS);
    expect(card?.headline).toMatchObject({ label: 'w99', usedPercent: 99, severity: 'critical' });
  });

  it('badges a window at the exact clamp boundary that the body folded away', () => {
    // The exact off-by-one the reconciliation has to survive. The provider row
    // is UNSHIFTED onto the front of `detail` after the window rows are built,
    // so every recorded row index shifts down one relative to the rendered
    // array. A window sitting exactly ON the clamp boundary is therefore the
    // one the shifted index mis-reports as "kept": it is the last row dropped,
    // and it carries the highest usedPercent, so the badge would advertise it
    // — and colour the card from it — while the body shows only "+N more".
    //
    // 8 windows + the provider row = 9 detail rows; a 7-row budget keeps 6.
    // `w6` is the 7th detail row: dropped by the clamp, and the worst window.
    const windows = [
      win('w1', 10, { ...FIVE_HOUR, label: 'w1' }),
      win('w2', 20, { ...FIVE_HOUR, label: 'w2' }),
      win('w3', 30, { ...FIVE_HOUR, label: 'w3' }),
      win('w4', 40, { ...FIVE_HOUR, label: 'w4' }),
      win('w5', 50, { ...FIVE_HOUR, label: 'w5' }),
      win('w6', 99, { ...FIVE_HOUR, label: 'w6' }),
      win('w7', 70, { ...FIVE_HOUR, label: 'w7' }),
      win('w8', 80, { ...FIVE_HOUR, label: 'w8' }),
    ];
    const card = buildQuotaCardModel(
      [snap('openai-codex', 'codex', windows)],
      'openai-codex',
      'gpt-5',
      NOW,
    );
    expect(card?.rows).toHaveLength(SIDEBAR_QUOTA_BODY_ROWS);
    const visible = (card?.rows ?? []).filter((r) => r.kind === 'window').map((r) => r.label);
    // `w6` was folded away, so it must not be the badge.
    expect(visible).not.toContain('w6');
    expect(card?.headline?.label).not.toBe('w6');
    // And the badge still names a window the body actually renders.
    expect(visible).toContain(card?.headline?.label);
  });

  it('never exceeds the row budget, folding the rest into "+N more"', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      snap(`provider-${i}`, 'default', [win('primary', i * 5, FIVE_HOUR)]),
    );
    const card = buildQuotaCardModel(
      [snap('active', 'default', [win('primary', 1), win('secondary', 2)]), ...many],
      'active',
      'm',
      NOW,
    );
    expect(card?.rows).toHaveLength(SIDEBAR_QUOTA_BODY_ROWS);
    expect(card?.rows.at(-1)).toEqual({
      kind: 'more',
      count: 3 + 12 - (SIDEBAR_QUOTA_BODY_ROWS - 1),
    });
    // The active provider's rows are never the ones folded away.
    expect(kinds(card?.rows ?? []).slice(0, 3)).toEqual(['provider', 'window', 'window']);
  });
});
