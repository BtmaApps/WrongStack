import {
  formatAutoWakeNotice,
  formatAutoWakeSuppressedNotice,
  formatDeliveryPendingNotice,
} from '@wrongstack/webui-protocol';
import { finiteNumber } from './context-load.js';

// ── Helpers ─────────────────────────────────────────────────────────

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * The transcript line for a background-delegation notice, or `null` when the
 * frame carries nothing to show (an `undisplayed` hold never reaches a tab).
 */
export function delegationNoticeText(
  type: string,
  payload: Record<string, unknown>,
): string | null {
  const delegationIds = stringList(payload['delegationIds']);
  if (type === 'delegation.delivery_pending') {
    return formatDeliveryPendingNotice(
      delegationIds,
      finiteNumber(payload['count'], delegationIds.length || 1),
    );
  }
  if (type === 'delegation.auto_wake_started') {
    return formatAutoWakeNotice(delegationIds, finiteNumber(payload['chain'], 0));
  }
  if (type === 'delegation.auto_wake_suppressed') {
    if (payload['reason'] !== 'chain_cap') return null;
    return formatAutoWakeSuppressedNotice(finiteNumber(payload['pending'], 1));
  }
  return null;
}

export function messageId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}
