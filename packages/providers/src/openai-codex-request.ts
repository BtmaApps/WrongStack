import { createHash, randomUUID } from 'node:crypto';

import type { Request } from '@wrongstack/core/types';

import { CODEX_BASE_URL, codexModelsUrl, codexResponsesUrl } from './oauth/codex-protocol.js';

// ── OAuth refresh (shared protocol — see ./oauth/codex-protocol.ts) ──────────

export const DEFAULT_CODEX_BASE = CODEX_BASE_URL;

/**
 * Put the volatile system blocks after the conversation.
 *
 * They still reach the model, and being last they are also the most recent
 * thing it read — but nothing cacheable sits behind them any more.
 */
export function appendVolatileSystem(
  input: Record<string, unknown>[],
  volatileSystem: readonly string[],
): Record<string, unknown>[] {
  if (volatileSystem.length === 0) return input;
  return [
    ...input,
    { role: 'user', content: [{ type: 'input_text', text: volatileSystem.join('\n\n') }] },
  ];
}

/** Header-safe, session-stable affinity key used by the Codex backend. */
export function codexCacheSessionId(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const normalized = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  return normalized || undefined;
}

/** Stable UUID-shaped thread/request id derived from WrongStack's opaque session id. */
export function codexClientRequestId(sessionId: string | undefined): string {
  if (!sessionId) return randomUUID();
  const hex = createHash('sha256').update(sessionId).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

// ── URL + tool-choice helpers ────────────────────────────────────────────────

/** Normalize a base URL to the `/codex/responses` endpoint. */
export function resolveCodexUrl(baseUrl: string | undefined): string {
  return codexResponsesUrl(baseUrl ?? DEFAULT_CODEX_BASE);
}

/** Convert the HTTP Responses endpoint to the Codex WebSocket endpoint. */
export function resolveCodexWebSocketUrl(baseUrl: string | undefined): string {
  const httpUrl = resolveCodexUrl(baseUrl);
  return httpUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

/** Resolve the authenticated Codex model-catalog endpoint beside `/responses`. */
export function resolveCodexModelsUrl(baseUrl: string | undefined): string {
  return codexModelsUrl(baseUrl ?? DEFAULT_CODEX_BASE);
}

export function positiveContextLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export function mapToolChoice(
  choice: Request['toolChoice'],
): 'auto' | 'required' | 'none' | { type: 'function'; name: string } {
  if (choice === undefined) return 'auto';
  if (choice === 'auto' || choice === 'required' || choice === 'none') return choice;
  return { type: 'function', name: choice.name };
}
