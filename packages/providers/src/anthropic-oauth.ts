/**
 * `anthropic-oauth` wire family — Claude Pro/Max via "Sign in with Claude".
 *
 * Same wire as the API-key `anthropic` family (api.anthropic.com/v1/messages),
 * but authenticated with an OAuth access token instead of an API key. Three
 * things differ from the API-key path, all REQUIRED for the subscription
 * backend to accept the request:
 *   1. `Authorization: Bearer <access>` (no `x-api-key`).
 *   2. `anthropic-beta: claude-code-20250219,oauth-2025-04-20`.
 *   3. The first system block MUST be exactly the Claude Code identity line —
 *      Anthropic rejects OAuth requests whose system prompt doesn't lead with it.
 *
 * The API-key `anthropic` family is untouched. Tokens self-refresh (near-expiry
 * + once on 401) via the refresh token; rotated tokens persist through the same
 * `setOAuthTokenPersister` hook the codex family uses.
 */

import { recordProviderQuota } from '@wrongstack/core/quota';
import {
  type Capabilities,
  ParseError,
  type ProviderApiKey,
  ProviderError,
  type Request,
  type StreamEvent,
} from '@wrongstack/core/types';
import { parseAnthropicRateLimitHeaders } from './anthropic-rate-limits.js';
import type { HeadersLike } from './error-parse.js';
import { capabilitiesForFamily } from './family-capabilities.js';
import type { BuildBodyContext } from './model-output-limits.js';
import { oauthFailure } from './oauth/http.js';
import { OAuthRefreshCoordinator } from './oauth-refresh-coordinator.js';
import type { AnthropicStreamState } from './presets/anthropic.js';
import { anthropicWireFormat } from './presets/anthropic.js';
import {
  hasSubscriptionRefreshTransaction,
  renewRotatingOAuthCredential,
} from './subscription-refresh-store.js';
import { ANTHROPIC_SIGNER, streamWithThinkingSigner } from './thinking-signer.js';
import type { WireAdapterStreamOptions } from './wire-adapter.js';
import { WireFormatProvider } from './wire-format.js';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const DEFAULT_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const OAUTH_BETA = 'claude-code-20250219,oauth-2025-04-20';
/** Version string mimicked in the User-Agent so requests look like Claude Code. */
const CLAUDE_CODE_VERSION = '2.1.75';

/** Required first system block for OAuth/subscription requests. */
export const CLAUDE_CODE_SYSTEM_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

// ── Tool-name camouflage ─────────────────────────────────────────────────────
// The subscription backend can fingerprint a non-Claude-Code client by its tool
// names. We present Claude Code's canonical casing on the wire (read → Read,
// bash → Bash, …) for any tool whose name matches case-insensitively, and map
// the streamed tool_use name back to the caller's real tool so dispatch works.
// Tools without a Claude Code counterpart pass through unchanged.

const CLAUDE_CODE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'KillShell',
  'NotebookEdit',
  'Skill',
  'Task',
  'TaskOutput',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
] as const;

const CC_TOOL_BY_LOWER = new Map(CLAUDE_CODE_TOOLS.map((t) => [t.toLowerCase(), t]));

/** Map a real tool name to Claude Code's canonical casing (if it matches). */
function toClaudeCodeName(name: string): string {
  return CC_TOOL_BY_LOWER.get(name.toLowerCase()) ?? name;
}

/** Map a Claude-Code-cased name back to the caller's real tool name. */
function fromClaudeCodeName(name: string, tools: Request['tools']): string {
  const lower = name.toLowerCase();
  const match = tools?.find((t) => t.name.toLowerCase() === lower);
  return match?.name ?? name;
}

export interface AnthropicOAuthTokens {
  access: string;
  refresh: string;
  /** Absolute expiry in epoch milliseconds. */
  expires: number;
}

/** Refresh an expired Claude OAuth access token. */
export async function refreshAnthropicOAuthToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<AnthropicOAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // A refresh runs on a request's path, so it speaks the provider error
    // contract: the real status decides retry (429/5xx) vs. "sign in again"
    // (dead refresh token), and only the OAuth error CODE is kept -- the raw
    // body used to be pasted into the message.
    const text = await res.text().catch(() => '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON: the status alone classifies it
    }
    const body =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    throw oauthFailure('anthropic-oauth', res.status, body);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  if (
    !json?.access_token ||
    !json.refresh_token ||
    typeof json.expires_in !== 'number' ||
    !Number.isFinite(json.expires_in) ||
    json.expires_in <= 0
  ) {
    throw new ParseError({
      message: 'Claude token refresh response missing fields',
      source: 'anthropic-oauth',
    });
  }
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  };
}

export interface AnthropicOAuthCredentials {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresAt?: number | undefined;
}

export interface AnthropicOAuthProviderOptions {
  credentials: AnthropicOAuthCredentials;
  baseUrl?: string | undefined;
  id?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  streamOpts?: WireAdapterStreamOptions | undefined;
  onRefresh?:
    | ((creds: { accessToken: string; refreshToken: string; expiresAt: number }) => void)
    | undefined;
  refreshFn?:
    | ((refreshToken: string, signal?: AbortSignal) => Promise<AnthropicOAuthTokens>)
    | undefined;
  /**
   * The stored account entry this transport was built from. With a host
   * refresh transaction installed, renewals run under the config lock against
   * the entry on disk (see `renewRotatingOAuthCredential`): Claude rotates its
   * refresh token on every use, so a process-local renewal let a second process
   * replay a consumed token and forced a fresh sign-in.
   */
  credential?: ProviderApiKey | undefined;
}

export class AnthropicOAuthProvider extends WireFormatProvider<AnthropicStreamState> {
  override readonly id: string;
  override readonly capabilities: Capabilities;

  private access: string;
  private refresh: string | undefined;
  private credential: ProviderApiKey | undefined;
  private readonly refreshFn: (
    refreshToken: string,
    signal?: AbortSignal,
  ) => Promise<AnthropicOAuthTokens>;
  /** Shared OAuth refresh machinery — see packages/providers/src/oauth-refresh-coordinator.ts */
  private readonly refreshCoordinator: OAuthRefreshCoordinator<
    AnthropicOAuthTokens,
    NonNullable<AnthropicOAuthProviderOptions['onRefresh']> extends (p: infer P) => void ? P : never
  >;

  constructor(opts: AnthropicOAuthProviderOptions) {
    super(anthropicWireFormat, {
      apiKey: opts.credentials.accessToken,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE,
      fetchImpl: opts.fetchImpl,
      streamOpts: opts.streamOpts,
    });
    this.id = opts.id ?? 'anthropic-oauth';
    this.capabilities = capabilitiesForFamily('anthropic-oauth');
    this.access = opts.credentials.accessToken;
    this.refresh = opts.credentials.refreshToken;
    this.refreshFn = opts.refreshFn ?? refreshAnthropicOAuthToken;
    this.credential = opts.credential ? { ...opts.credential } : undefined;
    this.refreshCoordinator = new OAuthRefreshCoordinator<
      AnthropicOAuthTokens,
      {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      }
    >({
      initialRefreshKey: opts.credentials.refreshToken,
      initialExpiresAt: opts.credentials.expiresAt,
      label: 'Anthropic OAuth',
      hooks: {
        refreshFn: (key, signal) => this.exchangeRefreshToken(key, signal),
        // The host transaction already wrote the rotation under its lock.
        onRefresh: (payload) => {
          if (!(this.credential && hasSubscriptionRefreshTransaction())) opts.onRefresh?.(payload);
        },
        formatPayload: (_tokens, derived) => ({
          accessToken: derived.accessToken,
          refreshToken: derived.refreshKey ?? '',
          expiresAt: derived.expiresAt,
        }),
        projectTokens: (tokens) => ({
          accessToken: tokens.access,
          expiresAt: tokens.expires,
          // Anthropic rotates its refresh token on every refresh.
          refreshKey: tokens.refresh,
        }),
        applyTokens: (derived) => {
          this.access = derived.accessToken;
          if (derived.refreshKey !== undefined) {
            this.refresh = derived.refreshKey;
          }
        },
      },
    });
  }

  private async exchangeRefreshToken(
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<AnthropicOAuthTokens> {
    const stored = this.credential;
    const renewed = stored
      ? await renewRotatingOAuthCredential({
          providerId: this.id,
          stored,
          accessToken: this.access,
          refreshToken,
          exchange: (key) => this.refreshFn(key, signal),
          signInHint:
            'Claude sign-in has no refresh token. Sign in again: wstack auth login claude',
        })
      : undefined;
    if (!renewed) return this.refreshFn(refreshToken, signal);
    this.credential = renewed.credential;
    return renewed.tokens;
  }

  /**
   * Claude subscription traffic is Anthropic-signed: other services' thinking
   * blocks are filtered out before sending and a signature rejection is
   * repaired once — see thinking-signer.ts.
   */
  override async *stream(req: Request, opts: { signal: AbortSignal }) {
    yield* streamWithThinkingSigner(req, opts, ANTHROPIC_SIGNER, (r) => this.streamOnce(r, opts));
  }

  private async *streamOnce(req: Request, opts: { signal: AbortSignal }) {
    await this.ensureFreshToken(opts.signal);
    try {
      yield* this.remapToolNames(super.stream(req, opts), req.tools);
    } catch (err) {
      if (err instanceof ProviderError && err.status === 401 && this.refresh) {
        await this.doRefresh(opts.signal);
        yield* this.remapToolNames(super.stream(req, opts), req.tools);
        return;
      }
      throw err;
    }
  }

  /** Map Claude-Code-cased tool_use names in the stream back to real names. */
  private async *remapToolNames(
    events: AsyncIterable<StreamEvent>,
    tools: Request['tools'],
  ): AsyncIterable<StreamEvent> {
    for await (const ev of events) {
      if (
        (ev.type === 'tool_use_start' || ev.type === 'content_block_start') &&
        typeof (ev as { name?: string }).name === 'string'
      ) {
        yield { ...ev, name: fromClaudeCodeName((ev as { name: string }).name, tools) };
      } else {
        yield ev;
      }
    }
  }

  private async ensureFreshToken(signal: AbortSignal): Promise<void> {
    await this.refreshCoordinator.ensureFreshToken(signal);
  }

  private async doRefresh(signal: AbortSignal): Promise<void> {
    await this.refreshCoordinator.doRefresh(signal);
  }

  /**
   * Read the subscription's remaining allowance off a successful response.
   *
   * This is the path where the reading actually matters: a Pro/Max login is
   * metered on a 5-hour and a 7-day rolling window, and
   * `anthropic-ratelimit-unified-*` is the only channel that reports the burn.
   * Reading it here means the status chip can show the plan draining instead of
   * the user discovering it as a 429 mid-turn — at no request cost, because
   * these headers arrive on requests the session was making anyway.
   */
  protected override onResponseHeaders(headers: HeadersLike | undefined, _req: Request): void {
    const snapshots = parseAnthropicRateLimitHeaders(this.id, headers);
    if (snapshots.length > 0) recordProviderQuota(this.id, snapshots);
  }

  protected override buildHeaders(_req: Request): Record<string, string> {
    return {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'anthropic-version': ANTHROPIC_VERSION,
      authorization: `Bearer ${this.access}`,
      'anthropic-beta': OAUTH_BETA,
      // Present as the official Claude Code CLI so the subscription backend
      // accepts the request and the client isn't trivially fingerprinted.
      'user-agent': `claude-cli/${CLAUDE_CODE_VERSION}`,
      'x-app': 'cli',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  protected override buildBody(req: Request, ctx: BuildBodyContext): Record<string, unknown> {
    const body = super.buildBody(req, ctx);
    // Prepend the required Claude Code identity block (unless already present).
    const existing = (body['system'] as { type: 'text'; text: string }[] | undefined) ?? [];
    const alreadyLed = existing[0]?.text?.startsWith(CLAUDE_CODE_SYSTEM_PROMPT) === true;
    body['system'] = alreadyLed
      ? existing
      : [{ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT }, ...existing];

    // Present Claude Code's canonical tool names on the wire, consistently
    // across both the tool definitions and the tool_use blocks in history.
    const tools = body['tools'] as Array<{ name?: string }> | undefined;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (typeof t.name === 'string') t.name = toClaudeCodeName(t.name);
      }
    }
    const messages = body['messages'] as Array<{ content?: unknown }> | undefined;
    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (!Array.isArray(m.content)) continue;
        for (const block of m.content as Array<{ type?: string; name?: string }>) {
          if (block?.type === 'tool_use' && typeof block.name === 'string') {
            block.name = toClaudeCodeName(block.name);
          }
        }
      }
    }
    return body;
  }
}
