import { describe, expect, it } from 'vitest';
import {
  buildQuotaCards,
  cardsInUse,
  countAccounts,
  type QuotaCard,
  quotaLevel,
  quotaPageSections,
} from '../../src/components/Quota/quota-model';
import type { QuotaSnapshot } from '../../src/stores';

const reset = Math.floor(Date.now() / 1000) + 3600;

function meter(
  providerId: string,
  meterId: string,
  usedPercent: number,
  extra: Partial<QuotaSnapshot> = {},
): QuotaSnapshot {
  return {
    providerId,
    meterId,
    windows: [{ id: 'w', usedPercent, resetsAt: reset }],
    capturedAt: 1,
    ...extra,
  };
}

const poolMeter = (provider: string, id: string, pct: number) =>
  meter('omniroute', `omniroute:${provider}:${id}`, pct, {
    via: 'omniroute',
    meterLabel: `${provider} · ${id}`,
  });

function card(providerId: string, vendor: QuotaCard['vendor'], meters: QuotaSnapshot[]): QuotaCard {
  return { providerId, aliases: [providerId], vendor, meters };
}

describe('routed model → pool account', () => {
  const PROVIDERS = [
    'claude',
    'codex',
    'github',
    'kimi-coding',
    'command-code',
    'antigravity',
    'opencode-go',
  ];
  const gateway = card(
    'omniroute',
    'omniroute',
    PROVIDERS.map((p) => poolMeter(p, 'c', 10)),
  );
  const accountsFor = (model: string) =>
    cardsInUse([gateway], [{ provider: 'omniroute', model }])[0]?.meters.map(
      (m) => m.meterId.split(':')[1],
    );

  it.each([
    ['claude/claude-opus-5', 'claude'],
    ['cc/claude-opus-5', 'claude'],
    ['no-think/cc/claude-opus-5', 'claude'],
    ['cx/gpt-6-astra', 'codex'],
    ['gh/claude-fable-5', 'github'],
    ['kmc/k3', 'kimi-coding'],
    ['cmd/claude-opus-4-7', 'command-code'],
    ['antigravity/gemini-3.6-flash-high', 'antigravity'],
    ['opencode-go/minimax-m3', 'opencode-go'],
  ])('%s draws on the %s account', (model, provider) => {
    expect(accountsFor(model)).toEqual([provider]);
  });

  it.each(['auto/best-coding', 'balanced-load', '/x', ''])(
    '%s names no single account',
    (model) => {
      expect(accountsFor(model)).toEqual([]);
    },
  );
});

describe('cardsInUse', () => {
  const cards = [
    card('zai-coding-plan', 'zai', [meter('zai-coding-plan', 'default', 10)]),
    card('omniroute', 'omniroute', [
      poolMeter('claude', 'c1', 60),
      poolMeter('github', 'c2', 100),
      poolMeter('antigravity', 'c3', 5),
    ]),
  ];

  it('keeps the cards of the providers in use, and pool accounts of the routed models', () => {
    const shown = cardsInUse(cards, [
      { provider: 'omniroute', model: 'cc/claude-opus-5' },
      { provider: 'omniroute', model: 'antigravity/gemini-3.6-flash' },
    ]);
    expect(shown.map((c) => c.providerId)).toEqual(['omniroute']);
    expect(shown[0]?.meters.map((m) => m.meterId)).toEqual([
      'omniroute:claude:c1',
      'omniroute:antigravity:c3',
    ]);
    expect(shown[0]?.hiddenPoolAccounts).toBe(1);
  });

  it('matches an alias provider id too', () => {
    const shared = { ...cards[0]!, aliases: ['zai-coding-plan', 'glm-work'] };
    expect(cardsInUse([shared], [{ provider: 'glm-work', model: 'glm-5.2' }])).toHaveLength(1);
  });

  it('shows nothing for providers without quota', () => {
    expect(cardsInUse(cards, [{ provider: 'anthropic', model: 'claude' }])).toEqual([]);
  });
});

describe('quotaPageSections', () => {
  const cards = [
    card('zai-coding-plan', 'zai', [meter('zai-coding-plan', 'default', 95)]),
    card('minimax-coding-plan', 'minimax', [meter('minimax-coding-plan', 'default', 20)]),
    card('deepseek', 'deepseek', [
      {
        providerId: 'deepseek',
        meterId: 'balance',
        windows: [],
        credits: { hasCredits: true, unlimited: false, balance: '$3.00' },
        capturedAt: 1,
      },
    ]),
    card('omniroute', 'omniroute', [poolMeter('claude', 'c1', 75), poolMeter('codex', 'c2', 10)]),
  ];

  it('puts each entry in one section, in-use first, most consumed first', () => {
    const s = quotaPageSections(cards, [{ provider: 'omniroute', model: 'cc/claude-opus-5' }]);
    expect(s.inUse.map((e) => e.title)).toEqual(['claude · c1']);
    expect(s.plans.map((e) => e.key)).toEqual(['zai-coding-plan', 'minimax-coding-plan']);
    expect(s.pool.map((e) => e.title)).toEqual(['codex · c2']);
    expect(s.balances.map((e) => e.key)).toEqual(['deepseek']);
  });

  it('summarises every entry, whatever the filter', () => {
    const s = quotaPageSections(cards, [], { query: 'deepseek' });
    expect(s.summary).toMatchObject({ accounts: 5, warn: 1, critical: 1 });
    expect(s.summary.nextRelief?.resetsAt).toBe(reset);
    expect(s.plans).toEqual([]);
    expect(s.balances.map((e) => e.key)).toEqual(['deepseek']);
  });

  it('narrows to entries near the limit', () => {
    const s = quotaPageSections(cards, [], { attentionOnly: true });
    expect([...s.plans, ...s.pool].map((e) => e.title ?? e.key)).toEqual([
      'zai-coding-plan',
      'claude · c1',
    ]);
    expect(s.balances).toEqual([]);
  });

  it('counts accounts the same way the side panel does', () => {
    expect(countAccounts(cards)).toBe(quotaPageSections(cards, []).summary.accounts);
  });
});

describe('buildQuotaCards', () => {
  it('trusts the vendor the server read a provider as over the config guess', () => {
    const cards = buildQuotaCards(
      { 'x\u0000default': meter('deepseek', 'default', 10) },
      [{ id: 'deepseek', type: 'deepseek' }],
      { deepseek: { providerId: 'deepseek', vendor: 'custom', ok: true, at: 1 } },
    );
    expect(cards.map((c) => [c.providerId, c.vendor])).toEqual([['deepseek', 'custom']]);
  });
});

describe('quotaLevel', () => {
  it('uses advisory 70/90 lines, and a cut-off is always critical', () => {
    expect(quotaLevel(69, false)).toBe('ok');
    expect(quotaLevel(70, false)).toBe('warn');
    expect(quotaLevel(90, false)).toBe('critical');
    expect(quotaLevel(5, true)).toBe('critical');
  });
});
