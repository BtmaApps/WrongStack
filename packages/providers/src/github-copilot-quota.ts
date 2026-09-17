/**
 * GitHub Copilot quota reporter — `GET /copilot_internal/user`.
 *
 * Copilot is the one metered subscription in this codebase that does NOT
 * report its budget in response headers. The chat endpoint says nothing about
 * remaining entitlement; the account's plan, its per-pool allowances, and the
 * monthly reset date live behind a separate GitHub API call. So unlike the
 * Codex and Anthropic reporters — which parse headers that arrive for free on
 * requests already in flight — this one has to ask.
 *
 * Asking is acceptable here for a reason specific to Copilot: the call goes to
 * `api.github.com` with the long-lived GitHub OAuth token, not to the metered
 * inference endpoint, so it spends no Copilot entitlement. That is what makes
 * it different from polling a metered provider to ask how much is left.
 *
 * It is still not free in wall-clock terms, so the call is bound to the token
 * lifecycle rather than the request path: the provider fires it after minting a
 * Copilot token (roughly twice an hour) and never awaits it, so a slow or
 * failed GitHub response can delay a turn by exactly nothing. A failure leaves
 * the previous reading standing.
 *
 * Response shape (the fields this reads):
 *
 *   copilot_plan            string   plan tier, e.g. `individual`, `business`
 *   quota_reset_date        string    `YYYY-MM-DD`, account-wide fallback
 *   quota_snapshots         object   keyed `chat` | `code` | `premium_interactions`
 *     .percent_remaining    number   0..100
 *     .remaining            number   absolute units left
 *     .entitlement          number   units in the allowance
 *     .unlimited            boolean
 *     .overage_permitted    boolean
 *     .quota_reset_at       number   epoch seconds — CAN BE 0, see below
 *
 * @module github-copilot-quota
 */

import {
  type ProviderQuotaSnapshot,
  type ProviderQuotaWindow,
  recordProviderQuota,
} from '@wrongstack/core/quota';
import { COPILOT_HEADERS } from './github-copilot-token.js';

/** Where the quota lives on github.com. Enterprise hosts mirror the path. */
const COPILOT_USER_URL = 'https://api.github.com/copilot_internal/user';

/**
 * Copilot meters a monthly allowance, so every window is 30 days.
 *
 * The API reports a reset instant but never a window length, and a window with
 * no length renders as its bare id in the status bar (`chat` rather than
 * `30d`). Stating the length here is what makes a Copilot reading read the
 * same way as a Codex or Claude one.
 */
const MONTHLY_WINDOW_MINUTES = 30 * 24 * 60;

/** Snapshot pools worth reporting, in the order a report should list them. */
const POOL_ORDER = ['premium_interactions', 'chat', 'code'] as const;

interface CopilotQuotaSnapshotJson {
  percent_remaining?: unknown;
  remaining?: unknown;
  entitlement?: unknown;
  unlimited?: unknown;
  overage_permitted?: unknown;
  quota_reset_at?: unknown;
}

interface CopilotUserJson {
  copilot_plan?: unknown;
  quota_reset_date?: unknown;
  quota_snapshots?: Record<string, CopilotQuotaSnapshotJson> | null;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** `premium_interactions` → `premium interactions`, for a one-line label. */
function poolLabel(pool: string): string {
  return pool.replaceAll('_', ' ');
}

/**
 * Account-wide reset, as epoch seconds, from the `YYYY-MM-DD` day string.
 *
 * Per-pool `quota_reset_at` is authoritative when present, but it is reported
 * as a literal `0` on some accounts — a value that would render as "resets in
 * 56 years ago" if passed through, so it has to be treated as absent and
 * backfilled from the account-wide date. Midnight UTC is the coarsest honest
 * reading of a date with no time in it.
 */
function accountResetSeconds(json: CopilotUserJson): number | undefined {
  const day = str(json.quota_reset_date);
  if (day === undefined) return undefined;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function parsePool(
  snapshot: CopilotQuotaSnapshotJson,
  pool: string,
  fallbackResetsAt: number | undefined,
): ProviderQuotaWindow | undefined {
  // An unlimited pool has no budget to burn, and rendering it as 0% used would
  // put a permanently-green bar in the report for something that cannot move.
  if (snapshot.unlimited === true) return undefined;
  const percentRemaining = num(snapshot.percent_remaining);
  const remaining = num(snapshot.remaining);
  const entitlement = num(snapshot.entitlement);
  // Prefer the reported percentage; derive it from the counts only when the
  // API omits it. Deriving needs a non-zero entitlement — an entitlement of 0
  // means the pool is not part of this plan, not that it is 100% consumed.
  const usedPercent =
    percentRemaining !== undefined
      ? 100 - percentRemaining
      : remaining !== undefined && entitlement !== undefined && entitlement > 0
        ? 100 - (remaining / entitlement) * 100
        : undefined;
  if (usedPercent === undefined) return undefined;
  const ownReset = num(snapshot.quota_reset_at);
  const resetsAt = ownReset !== undefined && ownReset > 0 ? Math.trunc(ownReset) : fallbackResetsAt;
  return {
    id: pool,
    label: poolLabel(pool),
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    windowMinutes: MONTHLY_WINDOW_MINUTES,
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

/**
 * Turn a `/copilot_internal/user` body into at most one snapshot.
 *
 * Every pool becomes a window of a single meter rather than a meter of its
 * own: they share one plan, one reset, and one "is this account about to stop
 * working" question, which is exactly what a meter is. Modelling them as
 * separate meters would give the report three plan headers for one
 * subscription.
 */
export function parseCopilotQuotaJson(
  providerId: string,
  body: unknown,
  now: number = Date.now(),
): ProviderQuotaSnapshot[] {
  if (typeof body !== 'object' || body === null) return [];
  const json = body as CopilotUserJson;
  const snapshots = json.quota_snapshots;
  if (typeof snapshots !== 'object' || snapshots === null) return [];

  const fallbackResetsAt = accountResetSeconds(json);
  const seen = new Set<string>();
  const ordered = [
    ...POOL_ORDER.filter((pool) => pool in snapshots),
    // Report pools GitHub adds later too — the plan's shape is theirs to
    // change, and a new allowance the user is being metered on is exactly the
    // thing this exists to show.
    ...Object.keys(snapshots).sort(),
  ];
  const windows: ProviderQuotaWindow[] = [];
  for (const pool of ordered) {
    if (seen.has(pool)) continue;
    seen.add(pool);
    const raw = snapshots[pool];
    if (typeof raw !== 'object' || raw === null) continue;
    const window = parsePool(raw, pool, fallbackResetsAt);
    if (window) windows.push(window);
  }
  if (windows.length === 0) return [];

  const planLabel = str(json.copilot_plan);
  return [
    {
      providerId,
      meterId: 'copilot',
      windows,
      ...(planLabel !== undefined ? { planLabel } : {}),
      capturedAt: now,
    },
  ];
}

/**
 * Fetch the account's Copilot quota and record it. Resolves to `false` when
 * nothing could be read.
 *
 * Every failure path is silent by design: this runs detached from the request
 * path, so there is no caller to report an error to, and a status chip that
 * cannot be refreshed is not a reason to surface anything to the user. The
 * previous reading stays visible.
 */
export async function reportCopilotQuota(
  providerId: string,
  githubToken: string,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal; now?: number } = {},
): Promise<boolean> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(COPILOT_USER_URL, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${githubToken}`,
        'x-github-api-version': '2025-04-01',
        ...COPILOT_HEADERS,
      },
      signal: opts.signal
        ? AbortSignal.any([opts.signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const json: unknown = await res.json();
    const snapshots = parseCopilotQuotaJson(providerId, json, opts.now ?? Date.now());
    if (snapshots.length === 0) return false;
    recordProviderQuota(providerId, snapshots);
    return true;
  } catch {
    return false;
  }
}
