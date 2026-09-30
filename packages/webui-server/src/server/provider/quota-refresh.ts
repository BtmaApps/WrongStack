import { getAllProviderQuota, withQuotaPace } from '@wrongstack/core/quota';
import type { ProviderConfig } from '@wrongstack/core/types';
import {
  type AccountQuotaVendor,
  makeProviderFromConfig,
  readProviderAccountQuota,
  refreshProviderAccountQuota,
} from '@wrongstack/providers';
import type { WebSocket } from 'ws';
import { normalizeKeys } from './keys-records.js';
import type { ProviderServiceContext } from './mutations.js';

/**
 * Minimum gap between two account reads for one provider. The reads spend no
 * plan allowance, but a panel that refreshes on open, on a timer and on a
 * button must not turn into a hammer when several tabs are open.
 */
const MIN_REFRESH_INTERVAL_MS = 20_000;

/** Outcome of one provider's read, reported back to the requesting tab. */
export interface QuotaRefreshOutcome {
  providerId: string;
  vendor: AccountQuotaVendor;
  ok: boolean;
  /** The provider was read moments ago; its standing reading was kept. */
  throttled?: boolean;
}

/** ChatGPT sign-in — the `openai-codex` family, under any config key. */
function isCodexConfig(providerId: string, cfg: ProviderConfig): boolean {
  return (cfg.type ?? providerId) === 'openai-codex' || cfg.family === 'openai-codex';
}

/**
 * Read one provider's account quota: through a built transport for ChatGPT /
 * Codex (its OAuth token may need a refresh, and the rotated token must reach
 * the persister this host installed), from the saved key for MiniMax / Z.AI.
 */
async function readAccountQuota(
  providerId: string,
  cfg: ProviderConfig,
  apiKey: string,
): Promise<{ vendor: AccountQuotaVendor; ok: boolean } | undefined> {
  if (isCodexConfig(providerId, cfg)) {
    try {
      const provider = makeProviderFromConfig(providerId, {
        ...cfg,
        type: cfg.type ?? providerId,
        family: cfg.family ?? 'openai-codex',
      });
      return (await readProviderAccountQuota(provider)) ?? { vendor: 'codex', ok: false };
    } catch {
      return { vendor: 'codex', ok: false };
    }
  }
  return refreshProviderAccountQuota({
    providerId,
    type: cfg.type,
    baseUrl: cfg.baseUrl,
    apiKey,
    managementToken: cfg.managementToken,
    quotaEndpoint: cfg.quotaEndpoint,
  });
}

/**
 * `provider.quota.refresh` — read the plan quota of every saved provider that
 * has an account read: ChatGPT / Codex (`/wham/usage`, the official client's
 * `/status` read), MiniMax, Z.AI / BigModel Coding Plan, Kimi Code, OpenCode
 * Go, OpenRouter, an OmniRoute gateway's pool (with its management token),
 * the prepaid balances and any configured `quotaEndpoint`. None of them is a
 * model call, so none spends the plan it reports — which is what lets the
 * panel show a quota before any session has run a turn.
 *
 * Claude has no such read and is skipped: its readings arrive with the
 * responses to real turns. Readings land in the shared quota store, whose
 * listener broadcasts them to every tab; the requesting tab additionally gets
 * a full replay plus the per-provider outcome, so a failed read can be shown
 * instead of a silently stale bar.
 */
export function createQuotaRefreshHandlers(ctx: ProviderServiceContext) {
  const lastRead = new Map<string, { at: number; vendor: AccountQuotaVendor; ok: boolean }>();

  async function readOne(providerId: string, cfg: ProviderConfig, now: number) {
    const keys = normalizeKeys(cfg);
    const apiKey = (keys.find((k) => k.label === cfg.activeKey) ?? keys[0])?.apiKey ?? '';
    // A keyless gateway (OmniRoute) is still read with its management token.
    if (!apiKey && !cfg.managementToken) return undefined;
    const last = lastRead.get(providerId);
    if (last && now - last.at < MIN_REFRESH_INTERVAL_MS) {
      return { providerId, vendor: last.vendor, ok: last.ok, throttled: true };
    }
    const result = await readAccountQuota(providerId, cfg, apiKey);
    if (result === undefined) return undefined;
    lastRead.set(providerId, { at: now, vendor: result.vendor, ok: result.ok });
    return { providerId, vendor: result.vendor, ok: result.ok };
  }

  async function handleProviderQuotaRefresh(ws: WebSocket): Promise<void> {
    let refreshed: QuotaRefreshOutcome[] = [];
    try {
      const providers = await ctx.loadConfigProviders();
      const now = Date.now();
      const outcomes = await Promise.all(
        Object.entries(providers).map(([id, cfg]) => readOne(id, cfg, now)),
      );
      refreshed = outcomes.filter((o): o is QuotaRefreshOutcome => o !== undefined);
    } catch {
      // A config that cannot be read leaves the panel with what it already has.
    }
    ctx.sendMessage(ws, {
      type: 'provider.quota',
      payload: { snapshots: withQuotaPace(getAllProviderQuota()), refreshed },
    });
  }

  return { handleProviderQuotaRefresh };
}
