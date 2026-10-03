import { recordProviderQuota, resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, describe, expect, it } from 'vitest';
import { providerQuotaMenu } from '../src/tui-provider-quota-menu.js';

afterEach(() => resetProviderQuota());

describe('provider quota menu', () => {
  it('keeps configured providers without readings and every meter of reported providers', () => {
    const now = Date.now();
    recordProviderQuota('codex', [
      {
        providerId: 'codex',
        meterId: 'plan',
        planLabel: 'plus',
        capturedAt: now,
        windows: [
          { id: 'primary', label: '5h', usedPercent: 75, resetsAt: Math.floor(now / 1000) + 3600 },
        ],
      },
      {
        providerId: 'codex',
        meterId: 'extra',
        capturedAt: now,
        windows: [],
        credits: { hasCredits: false, unlimited: false, balance: '$0' },
        note: 'Upgrade available',
      },
    ]);
    recordProviderQuota('pool', [
      {
        providerId: 'pool',
        meterId: 'account',
        via: 'omniroute',
        capturedAt: now,
        windows: [{ id: 'weekly', usedPercent: 100 }],
        reachedWindowId: 'weekly',
      },
    ]);
    const menu = providerQuotaMenu({ unmetered: { type: 'openai' } });
    expect(menu.items.map((item) => item.id)).toEqual(['codex', 'pool', 'unmetered']);
    const codex = menu.items[0];
    expect(codex?.status).toBe('bad');
    expect(codex?.body).toContain('75% used · 25% left');
    expect(codex?.body).toMatch(/Resets in (59m|1h)/);
    expect(codex?.body).toContain('Plan: plus');
    expect(codex?.body).toContain('Credits: $0');
    expect(codex?.body).toContain('Upgrade available');
    expect(codex?.body).toContain('As of ');
    expect(menu.items[1]?.body).toContain('Pool account via omniroute');
    expect(menu.items[1]?.body).toContain('Limit reached: weekly');
    expect(menu.items[2]).toMatchObject({
      status: 'muted',
      summary: 'No quota reading available.',
    });
    expect(menu.items[2]?.actions?.[0]?.command).toBe('/provider-quota');
  });

  it('provides an explicit empty state', () => {
    const menu = providerQuotaMenu(undefined);
    expect(menu.items).toEqual([]);
    expect(menu.emptyText).toContain('No configured providers');
  });
});
