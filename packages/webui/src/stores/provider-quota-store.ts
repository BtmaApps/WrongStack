/**
 * Zustand store for subscription plan quota — the browser mirror of the
 * server-side store in `@wrongstack/core/quota`.
 *
 * Metered providers (ChatGPT/Codex today, any plan-backed login next) report
 * how much of their rolling budget is spent on the responses to requests the
 * agent already makes. The server broadcasts every reading as `provider.quota`;
 * a tab that connected mid-session asks once with `provider.quota.get`, because
 * the reading is never re-fetched from the provider — asking a metered plan how
 * much you have spent costs a request against the very budget you are checking.
 *
 * Deliberately global rather than per-session: a plan belongs to the account,
 * not to a conversation. Every tab shows the same numbers, and a reading that
 * arrived while another tab was in the foreground stays valid here.
 *
 * The shape mirrors `ProviderQuotaSnapshot` exactly. It is redeclared rather
 * than imported: this bundle is browser-only and pulling a Node-side entry in
 * for four field names is how `node:fs` ends up in the Vite graph.
 */

import { create } from 'zustand';

export interface QuotaWindow {
  id: string;
  label?: string | undefined;
  usedPercent: number;
  windowMinutes?: number | undefined;
  /** Absolute reset time in epoch **seconds**. */
  resetsAt?: number | undefined;
  /**
   * When the last hour's pace fills the window (epoch **seconds**). Set by the
   * server only when that lands before `resetsAt`.
   */
  exhaustsAt?: number | undefined;
}

export interface QuotaCredits {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string | undefined;
}

export interface QuotaSnapshot {
  providerId: string;
  meterId: string;
  meterLabel?: string | undefined;
  planLabel?: string | undefined;
  windows: QuotaWindow[];
  credits?: QuotaCredits | undefined;
  reachedWindowId?: string | undefined;
  note?: string | undefined;
  capturedAt: number;
}

interface ProviderQuotaState {
  /** Every known meter, keyed `providerId\0meterId`. */
  meters: Record<string, QuotaSnapshot>;
  /** Merge readings for one provider (a `provider.quota` push). */
  apply: (snapshots: readonly QuotaSnapshot[]) => void;
  clear: () => void;
}

function key(snapshot: QuotaSnapshot): string {
  return `${snapshot.providerId}\u0000${snapshot.meterId}`;
}

/** Runtime shape check — WS payloads are untyped by the time they land here. */
function isSnapshot(value: unknown): value is QuotaSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<QuotaSnapshot>;
  return (
    typeof s.providerId === 'string' &&
    typeof s.meterId === 'string' &&
    Array.isArray(s.windows) &&
    typeof s.capturedAt === 'number'
  );
}

export const useProviderQuotaStore = create<ProviderQuotaState>((set) => ({
  meters: {},
  apply: (snapshots) =>
    set((state) => {
      const next = { ...state.meters };
      for (const snapshot of snapshots) {
        if (!isSnapshot(snapshot)) continue;
        // Carry forward labels a later reading does not restate — the server
        // does the same, and a reconnect replay must not blank the plan name.
        const previous = next[key(snapshot)];
        next[key(snapshot)] = {
          ...snapshot,
          ...(snapshot.planLabel === undefined && previous?.planLabel !== undefined
            ? { planLabel: previous.planLabel }
            : {}),
          ...(snapshot.meterLabel === undefined && previous?.meterLabel !== undefined
            ? { meterLabel: previous.meterLabel }
            : {}),
        };
      }
      return { meters: next };
    }),
  clear: () => set({ meters: {} }),
}));

/**
 * The window a one-line surface should show: the most-consumed one across every
 * provider and meter, ties broken toward the sooner reset.
 *
 * Same rule as the TUI chip. A status bar has room for one number, and the one
 * that matters is the one nearest to cutting the user off — not the first
 * provider to report.
 */
export function selectWorstQuotaWindow(
  meters: Record<string, QuotaSnapshot>,
): { snapshot: QuotaSnapshot; window: QuotaWindow } | undefined {
  let best: { snapshot: QuotaSnapshot; window: QuotaWindow } | undefined;
  for (const snapshot of Object.values(meters)) {
    for (const window of snapshot.windows) {
      if (!best || window.usedPercent > best.window.usedPercent) {
        best = { snapshot, window };
        continue;
      }
      if (window.usedPercent === best.window.usedPercent) {
        const a = window.resetsAt;
        const b = best.window.resetsAt;
        if (a !== undefined && (b === undefined || a < b)) best = { snapshot, window };
      }
    }
  }
  return best;
}

/** `5h` / `7d` / the window's own label / its id. */
export function quotaWindowLabel(window: QuotaWindow): string {
  if (window.label) return window.label;
  const minutes = window.windowMinutes;
  if (minutes !== undefined && Number.isFinite(minutes) && minutes > 0) {
    if (minutes % 1440 === 0) return `${minutes / 1440}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
  }
  return window.id;
}

/** Compact `4h 12m` / `38m` / `45s` countdown, or undefined when unknown/past. */
export function formatQuotaResetIn(
  window: QuotaWindow | undefined,
  now: number = Date.now(),
): string | undefined {
  if (window?.resetsAt === undefined) return undefined;
  const ms = window.resetsAt * 1000 - now;
  if (ms <= 0) return undefined;
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}
