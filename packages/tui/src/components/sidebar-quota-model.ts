// Pure view model for the sidebar PLAN QUOTA card.
//
// The provider-neutral quota store holds every reading any provider made this
// process — Codex's 5h/7d windows, Claude's unified limits, MiniMax's Token
// Plan meters, Copilot pools, Antigravity per-model buckets. A narrow rail
// cannot show all of that, and most of it is not about the turn in front of
// the user. So the card leads with the ACTIVE provider, narrowed to the meters
// and windows that apply to the ACTIVE model, and reduces every other provider
// to one row. Everything here is pure so the row budget the scroll clamp
// reserves can be proven against the rows actually produced.

import {
  DEFAULT_QUOTA_METER,
  formatQuotaResetIn,
  type ProviderQuotaSnapshot,
  type ProviderQuotaWindow,
  quotaExhaustionInMs,
  quotaResetInMs,
  quotaWindowLabel,
} from '@wrongstack/core/quota';
import { SIDEBAR_QUOTA_BODY_ROWS } from '../ui-contracts.js';

/**
 * Meters that describe the whole account rather than one model: they always
 * apply, whatever model is active. `codex` is the ChatGPT-login account
 * family, `general` a MiniMax plan's shared text pool.
 */
const ACCOUNT_METERS = new Set([
  DEFAULT_QUOTA_METER,
  'codex',
  'copilot',
  'antigravity',
  'balance',
  'credits',
  'general',
]);

export type QuotaSeverity = 'ok' | 'warn' | 'critical';

export interface QuotaWindowRow {
  kind: 'window';
  label: string;
  usedPercent: number;
  resetIn?: string | undefined;
  reached: boolean;
  severity: QuotaSeverity;
}

export type QuotaCardRow =
  | { kind: 'provider'; providerId: string; planLabel?: string | undefined }
  | { kind: 'meter'; title: string }
  | QuotaWindowRow
  | { kind: 'pace'; exhaustsIn: string }
  | { kind: 'credits'; text: string; empty: boolean }
  | {
      kind: 'other';
      providerId: string;
      label: string;
      usedPercent: number;
      reached: boolean;
      severity: QuotaSeverity;
    }
  | { kind: 'more'; count: number };

export interface QuotaCardModel {
  /**
   * Header badge: the most-consumed window among the ones this card actually
   * renders, else of anyone. It must name a window in {@link rows} — the badge
   * is the first thing read, and a card whose headline is a folded-away bucket
   * contradicts its own body (and colours itself from that hidden window).
   */
  headline?: { label: string; usedPercent: number; reached: boolean; severity: QuotaSeverity };
  /** At most {@link SIDEBAR_QUOTA_BODY_ROWS} rows. */
  rows: QuotaCardRow[];
}

function quotaSeverity(usedPercent: number, reached: boolean): QuotaSeverity {
  // Same thresholds as the statusline quota chip, so the two never disagree.
  if (reached || usedPercent >= 90) return 'critical';
  if (usedPercent >= 70) return 'warn';
  return 'ok';
}

/** Lowercase alphanumerics only, keeping `*` for globs: `MiniMax-M*` → `minimaxm*`. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9*]/g, '');
}

/**
 * Does a meter/window name refer to `model`? Names can be globs (MiniMax's
 * `MiniMax-M*`) or slugs spelled differently from the model id (Codex's
 * `gpt_5_1_codex_mini` for `gpt-5.1-codex-mini`), so both sides are
 * normalized before comparing.
 */
function quotaNameMatchesModel(name: string, model: string): boolean {
  const pattern = normalize(name);
  const target = normalize(model);
  if (pattern.length === 0 || target.length === 0) return false;
  if (!pattern.includes('*')) return pattern === target;
  // `normalize` leaves only [a-z0-9*], so `*` is the one regex-significant char.
  return new RegExp(`^${pattern.split('*').join('.*')}$`).test(target);
}

function meterAppliesTo(snapshot: ProviderQuotaSnapshot, model: string | undefined): boolean {
  if (ACCOUNT_METERS.has(snapshot.meterId)) return true;
  if (!model) return false;
  return (
    quotaNameMatchesModel(snapshot.meterId, model) ||
    (snapshot.meterLabel !== undefined && quotaNameMatchesModel(snapshot.meterLabel, model))
  );
}

/**
 * Windows of one meter that apply to `model`. A meter whose windows are
 * themselves per-model (Antigravity's buckets) narrows to the active model's
 * bucket when one exists; time windows (`5h`, `7d`) never match a model, so
 * they are all kept.
 */
function windowsFor(
  snapshot: ProviderQuotaSnapshot,
  model: string | undefined,
): { windows: ProviderQuotaWindow[]; hidden: number } {
  if (model) {
    const own = snapshot.windows.filter(
      (w) =>
        quotaNameMatchesModel(w.id, model) || quotaNameMatchesModel(quotaWindowLabel(w), model),
    );
    if (own.length > 0) return { windows: own, hidden: snapshot.windows.length - own.length };
  }
  return { windows: snapshot.windows, hidden: 0 };
}

function worstWindows(
  meters: readonly {
    snapshot: ProviderQuotaSnapshot;
    windows: readonly ProviderQuotaWindow[];
  }[],
): { snapshot: ProviderQuotaSnapshot; window: ProviderQuotaWindow } | undefined {
  let best: { snapshot: ProviderQuotaSnapshot; window: ProviderQuotaWindow } | undefined;
  for (const { snapshot, windows } of meters) {
    for (const window of windows) {
      if (!best || window.usedPercent > best.window.usedPercent) best = { snapshot, window };
    }
  }
  return best;
}

/** {@link worstWindows} over the windows each snapshot reports itself. */
function worstWindow(
  snapshots: readonly ProviderQuotaSnapshot[],
): { snapshot: ProviderQuotaSnapshot; window: ProviderQuotaWindow } | undefined {
  return worstWindows(snapshots.map((snapshot) => ({ snapshot, windows: snapshot.windows })));
}

function windowRow(
  snapshot: ProviderQuotaSnapshot,
  window: ProviderQuotaWindow,
  now: number,
): QuotaWindowRow {
  const reached = snapshot.reachedWindowId === window.id;
  const resetIn = formatQuotaResetIn(quotaResetInMs(window, now));
  return {
    kind: 'window',
    label: quotaWindowLabel(window),
    usedPercent: window.usedPercent,
    ...(resetIn !== undefined ? { resetIn } : {}),
    reached,
    severity: quotaSeverity(window.usedPercent, reached),
  };
}

function creditsRow(snapshot: ProviderQuotaSnapshot): QuotaCardRow | undefined {
  const credits = snapshot.credits;
  if (!credits) return undefined;
  if (credits.unlimited) return { kind: 'credits', text: 'credits unlimited', empty: false };
  if (credits.balance !== undefined) {
    return { kind: 'credits', text: `credits ${credits.balance}`, empty: !credits.hasCredits };
  }
  return {
    kind: 'credits',
    text: credits.hasCredits ? 'credits available' : 'no credits',
    empty: !credits.hasCredits,
  };
}

/** Is a meter name worth a title row, or would it just repeat the provider? */
function meterTitle(snapshot: ProviderQuotaSnapshot): string | undefined {
  if (snapshot.meterLabel) return snapshot.meterLabel;
  if (ACCOUNT_METERS.has(snapshot.meterId)) return undefined;
  return snapshot.meterId;
}

/**
 * Build the card for `activeProviderId` running `activeModel`.
 *
 * Returns undefined when no provider has reported anything — the card is not
 * rendered at all for API-key sessions, which have no plan to meter.
 */
export function buildQuotaCardModel(
  snapshots: readonly ProviderQuotaSnapshot[],
  activeProviderId: string | undefined,
  activeModel: string | undefined,
  now: number = Date.now(),
  budget: number = SIDEBAR_QUOTA_BODY_ROWS,
): QuotaCardModel | undefined {
  if (snapshots.length === 0) return undefined;

  const own = snapshots.filter((s) => s.providerId === activeProviderId);
  const applicable = own.filter((s) => meterAppliesTo(s, activeModel));
  // A provider whose meters are all model-scoped for OTHER models still has a
  // plan the user is spending: showing nothing would read as "no quota".
  const shown = applicable.length > 0 ? applicable : own;

  // Narrow to the windows the card will actually render BEFORE choosing the
  // worst one. Picking over each snapshot's own window list let a per-model
  // bucket belonging to a DIFFERENT model — one the body folds into
  // "+N more" — set the headline, the card's accent colour, and the pace row,
  // so the badge advertised a window the user cannot see and a genuine pace
  // warning landed on no row at all.
  const narrowed = shown.map((snapshot) => ({ snapshot, ...windowsFor(snapshot, activeModel) }));
  let hidden = own.length - shown.length;
  for (const { hidden: hiddenWindows } of narrowed) hidden += hiddenWindows;

  const activeWorst = worstWindows(narrowed);
  const exhaustsIn = activeWorst
    ? formatQuotaResetIn(
        quotaExhaustionInMs(
          activeWorst.snapshot.providerId,
          activeWorst.snapshot.meterId,
          activeWorst.window,
          now,
        ),
      )
    : undefined;

  const detail: QuotaCardRow[] = [];
  // Every window row, paired with the window object it was built from. The
  // clamp below can drop rows, and the badge has to be reconciled against
  // what SURVIVED — pairing by object identity does that exactly, where
  // pairing by display label would alias two windows that share a label.
  const detailWindows: Array<{ rowIndex: number; window: ProviderQuotaWindow }> = [];
  for (const { snapshot, windows } of narrowed) {
    const title = meterTitle(snapshot);
    if (title !== undefined && (windows.length > 0 || snapshot.credits)) {
      detail.push({ kind: 'meter', title });
    }
    for (const window of windows) {
      detailWindows.push({ rowIndex: detail.length, window });
      detail.push(windowRow(snapshot, window, now));
      // The pace warning sits right under the window it is about.
      if (exhaustsIn !== undefined && window === activeWorst?.window) {
        detail.push({ kind: 'pace', exhaustsIn });
      }
    }
    const credits = creditsRow(snapshot);
    if (credits) detail.push(credits);
  }

  if (detail.length > 0) {
    // Named once, above its meters: the hero card already says which provider
    // is active, but the "other" rows below make the name necessary here.
    const planLabel = shown.find((s) => s.planLabel !== undefined)?.planLabel;
    detail.unshift({
      kind: 'provider',
      providerId: activeProviderId ?? '',
      ...(planLabel !== undefined ? { planLabel } : {}),
    });
    // Every window row just moved down one. `detailWindows` holds the index
    // each row was BUILT at, and the badge reconciliation below compares
    // those against positions in this array — so without the shift it read
    // every window one row too high, and called a window sitting exactly at
    // the clamp boundary "kept" after the body had folded it into "+N more".
    for (const entry of detailWindows) entry.rowIndex += 1;
  }

  const others: QuotaCardRow[] = [];
  const otherIds = [...new Set(snapshots.map((s) => s.providerId))].filter(
    (id) => id !== activeProviderId,
  );
  const otherWorst: Array<{ snapshot: ProviderQuotaSnapshot; window: ProviderQuotaWindow }> = [];
  for (const id of otherIds) {
    const worst = worstWindow(snapshots.filter((s) => s.providerId === id));
    if (worst) otherWorst.push(worst);
  }
  otherWorst.sort((a, b) => b.window.usedPercent - a.window.usedPercent);
  for (const { snapshot, window } of otherWorst) {
    const reached = snapshot.reachedWindowId === window.id;
    others.push({
      kind: 'other',
      providerId: snapshot.providerId,
      label: quotaWindowLabel(window),
      usedPercent: window.usedPercent,
      reached,
      severity: quotaSeverity(window.usedPercent, reached),
    });
  }

  if (detail.length === 0 && others.length === 0) return undefined;

  // Fit the budget: the active provider's rows first, other providers after,
  // and one "+N more" row standing in for whatever did not fit.
  let rows = [...detail, ...others];
  let overflow = hidden;
  // How many of the ACTIVE provider's detail rows the clamp below leaves
  // standing. It has to be measured at the slice, not derived from `rows`
  // afterwards: `rows` then also holds the `others` rows and the "+N more"
  // filler, and counting those as kept detail rows let the badge name a
  // window the body had just folded away.
  let keptDetailCount = detail.length;
  if (rows.length + (overflow > 0 ? 1 : 0) > budget) {
    const keep = Math.max(0, budget - 1);
    overflow += rows.length - keep;
    rows = rows.slice(0, keep);
    keptDetailCount = Math.min(detail.length, keep);
  }
  if (overflow > 0) rows.push({ kind: 'more', count: overflow });

  // Reconcile the badge with the rows the budget ACTUALLY kept. Choosing the
  // worst window before the clamp is only half the contract: `rows.slice(0,
  // keep)` can drop that very window into "+N more", leaving the badge
  // advertising a bucket the body never shows and colouring the card from it.
  // Matched by window IDENTITY (the index the row was built at), never by
  // display label — two windows can legitimately share a label, and label
  // matching would call a dropped window "rendered" because a kept one has
  // the same name.
  const picked = activeWorst ?? worstWindow(snapshots);
  const pickedRendered =
    picked !== undefined &&
    (picked === activeWorst
      ? detailWindows.some(
          (entry) => entry.window === picked.window && entry.rowIndex < keptDetailCount,
        )
      : rows
          .slice(keptDetailCount)
          .some((row) => row.kind === 'other' && row.providerId === picked.snapshot.providerId));
  const headline =
    picked && pickedRendered
      ? (() => {
          const reached = picked.snapshot.reachedWindowId === picked.window.id;
          return {
            label: quotaWindowLabel(picked.window),
            usedPercent: picked.window.usedPercent,
            reached,
            severity: quotaSeverity(picked.window.usedPercent, reached),
          };
        })()
      : survivingWindowRow(rows);

  return { ...(headline !== undefined ? { headline } : {}), rows };
}

/**
 * The worst window row the card actually RENDERS — the badge's fallback when
 * the window chosen before the clamp was cut into "+N more". `other` rows count:
 * when the active provider meters nothing, an other-provider row IS the badge.
 */
function survivingWindowRow(rows: readonly QuotaCardRow[]): QuotaCardModel['headline'] {
  let worst: QuotaCardModel['headline'];
  for (const row of rows) {
    if (row.kind !== 'window' && row.kind !== 'other') continue;
    if (!worst || row.usedPercent > worst.usedPercent) {
      worst = {
        label: row.label,
        usedPercent: row.usedPercent,
        reached: row.reached,
        severity: row.severity,
      };
    }
  }
  return worst;
}
