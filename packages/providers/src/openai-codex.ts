import type { CodexAccountCatalogHost } from './codex-account-catalog.js';
import {
  fetchContextLimits as fetchContextLimitsFromHost,
  publishLiveModels as publishLiveModelsFromHost,
  readAccountQuota as readAccountQuotaFromHost,
} from './codex-account-catalog.js';
import {
  CODEX_ROUTING_HINT_HEADER,
  codexCacheSessionId,
  codexClientRequestId,
  codexRoutingHint,
  compressCodexRequestBody,
  DEFAULT_CODEX_BASE,
  resolveCodexUrl,
  resolveCodexWebSocketUrl,
} from './openai-codex-request.js';
import {
  hasSubscriptionRefreshTransaction,
  renewRotatingOAuthCredential,
} from './subscription-refresh-store.js';

export {
  codexCacheSessionId,
  resolveCodexModelsUrl,
  resolveCodexUrl,
  resolveCodexWebSocketUrl,
} from './openai-codex-request.js';

/**
 * `openai-codex` wire family — the ChatGPT-backend Responses API.
 *
 * This is the transport used by "Sign in with ChatGPT" (OAuth) credentials.
 * It speaks the OpenAI **Responses** wire format (NOT chat/completions) and
 * targets `https://chatgpt.com/backend-api/codex/responses`, authenticating
 * with the OAuth access token + `chatgpt-account-id` header. It deliberately
 * leaves the API-key `openai` family (api.openai.com/chat/completions)
 * untouched — the two coexist as separate providers.
 *
 * Token lifecycle: the access token is short-lived. This adapter refreshes it
 * transparently — before a request when it is near expiry, and once more on a
 * 401 — using the stored refresh token, then invokes `onRefresh` so the CLI
 * can persist the rotated tokens back to the vault.
 *
 * The refresh endpoint + client id used to be duplicated here, with a comment
 * explaining that `providers` must not depend on `cli`. The layering was right;
 * the conclusion was not — the constants now live in `./oauth/codex-protocol.js`,
 * below both, so the CLI login flow, the headless WebUI flow, and this refresh
 * path share one definition instead of three that had to be kept in step by hand.
 */

import { createHash, randomUUID } from 'node:crypto';
import { recordProviderQuota } from '@wrongstack/core/quota';
import {
  type Capabilities,
  type ProviderApiKey,
  ProviderError,
  type ReasoningEffort,
  type Request,
  type StreamEvent,
} from '@wrongstack/core/types';
import {
  type CodexResponseMetadata,
  type CodexWebSocketFactory,
  CodexWebSocketFallbackError,
  CodexWebSocketPool,
  defaultCodexWebSocketFactory,
} from './codex-websocket.js';
import { capabilitiesForFamily } from './family-capabilities.js';
import type { BuildBodyContext } from './model-output-limits.js';
import {
  CODEX_ORIGINATOR,
  CODEX_USER_AGENT,
  type CodexTokens,
  refreshCodexTokens,
} from './oauth/codex-protocol.js';
import { OAuthRefreshCoordinator } from './oauth-refresh-coordinator.js';
import { extractAccountId, extractPlanType } from './openai-codex-account.js';
import { buildCodexRequestBody } from './openai-codex-body.js';
import {
  CODEX_REROUTE_REASON,
  type HeadersLike,
  translateCodexHttpError,
} from './openai-codex-errors.js';
import type { CodexLiveModel, CodexModelPolicy } from './openai-codex-model-policy.js';
import { parseCodexRateLimitHeaders } from './openai-codex-rate-limits.js';
import { parseOpenAIResponsesStream } from './openai-codex-stream.js';
import {
  isCacheProbeEnabled,
  recordCacheProbeRequest,
  recordCacheProbeUsage,
} from './prompt-cache-probe.js';
import { WireAdapter, type WireAdapterStreamOptions } from './wire-adapter.js';

// Owned by `codex-websocket.ts` (both transports carry it); re-exported here
// so the long-standing public name keeps resolving from the provider module.
export type { CodexResponseMetadata };

/**
 * Does this 400 blame a replayed reasoning item?
 *
 * The Responses API's reasoning validation errors all name the item type or a
 * `rs_`-prefixed id ("Item 'rs_…' of type 'reasoning' was provided without its
 * required following item"). Matching narrowly matters: a 400 for a malformed
 * tool schema must keep surfacing as an error, not be silently retried with
 * reasoning stripped and then fail again with a confusing second message.
 */
function isReasoningReplayRejection(err: ProviderError): boolean {
  const message = `${err.message} ${JSON.stringify(err.body ?? '')}`;
  return /reasoning item|item\s+['"]?rs_[\w-]+|required following item/i.test(message);
}

/** Sticky-routing token the ChatGPT backend hands back on every response. */
const CODEX_TURN_STATE_HEADER = 'x-codex-turn-state';
/** Bound on remembered turn-state entries so a long-lived process cannot grow. */
const CODEX_TURN_STATE_MAX_SESSIONS = 64;

/**
 * Is this request a continuation of the turn already in flight, rather than a
 * new user turn?
 *
 * `x-codex-turn-state` is scoped to ONE turn: the official client keeps it in a
 * turn-scoped `OnceLock` and replays it on the requests that finish that turn
 * (the tool-call round-trips), never on the next user turn. In the canonical
 * message shape a tool-call round-trip is a user message carrying tool results,
 * so that is the boundary this reproduces.
 */
function isTurnContinuation(req: Request): boolean {
  const last = req.messages[req.messages.length - 1];
  if (last?.role !== 'user' || !Array.isArray(last.content)) return false;
  return last.content.some((block) => block.type === 'tool_result');
}
/** The official client proactively refreshes ChatGPT access tokens five minutes early. */
const CODEX_TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

/**
 * Token shape returned by a refresh. Structurally the shared
 * {@link CodexTokens}; kept as a named alias because it is part of this
 * package's published surface.
 */
export type CodexOAuthTokens = CodexTokens;

/**
 * Refresh an expired Codex access token using its refresh token.
 *
 * Thin alias over the shared {@link refreshCodexTokens} — the endpoint, client
 * id, body shape, and response validation are defined once in
 * `./oauth/codex-protocol.js`. The name is kept because it is exported from
 * this package's index and wired as the adapter's default `refreshFn`.
 */
export function refreshCodexAccessToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<CodexOAuthTokens> {
  return refreshCodexTokens(refreshToken, signal);
}

// extractAccountId lives in openai-codex-account.ts so the oauth entry can
// use it without bundling this provider. Re-exported for API compatibility.
export { extractAccountId } from './openai-codex-account.js';
export type { CodexLiveModel } from './openai-codex-model-policy.js';
export { codexOutputCap } from './openai-codex-model-policy.js';
export { parseOpenAIResponsesStream } from './openai-codex-stream.js';

// ── Provider ────────────────────────────────────────────────────────────────

export interface CodexCredentials {
  /** The OAuth access token (a JWT). */
  accessToken: string;
  /** The refresh token, used to mint a new access token before/at expiry. */
  refreshToken?: string | undefined;
  /** Access-token expiry, epoch ms. When absent, refresh only fires on 401. */
  expiresAt?: number | undefined;
  /** Cached ChatGPT account id. Re-derived from the live token when missing. */
  accountId?: string | undefined;
}

export interface OpenAICodexProviderOptions {
  credentials: CodexCredentials;
  baseUrl?: string | undefined;
  id?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  capabilities?: Partial<Capabilities> | undefined;
  streamOpts?: WireAdapterStreamOptions | undefined;
  /**
   * Persist rotated tokens after a successful refresh. The CLI wires this to
   * write back to the encrypted config so the new access/refresh pair survive
   * the session.
   */
  onRefresh?:
    | ((creds: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        accountId: string | undefined;
      }) => void)
    | undefined;
  /** Observe response metadata surfaced inside the Responses stream. */
  onResponseMetadata?: ((metadata: CodexResponseMetadata) => void) | undefined;
  /**
   * Receives the account's picker-visible model list every time the live
   * `/codex/models` catalog is re-read, so a host can keep its stored list in
   * step with the backend.
   *
   * The stored list used to be written once, at login, and never again: an
   * account that gained `gpt-6-astra` a week later kept whatever the login
   * happened to resolve. This rides the catalog probe the transport already
   * performs at request boundaries, so keeping the list live costs no extra
   * request.
   */
  onModels?: ((models: CodexLiveModel[]) => void) | undefined;
  /** Enable the Responses WebSocket transport; defaults on for the real fetch. */
  webSocket?: boolean | undefined;
  /** Injectable WebSocket factory for hosts and tests. */
  webSocketFactory?: CodexWebSocketFactory | undefined;
  /** Best-effort WebSocket prewarm before the first real response. */
  webSocketPrewarm?: boolean | undefined;
  /**
   * The stored account entry this transport was built from. With it, and a
   * host-installed subscription refresh transaction, every refresh runs under
   * the config file lock against the entry as it is ON DISK: a token another
   * process already rotated is adopted instead of replayed, and the rotation is
   * persisted atomically with the exchange. Codex rotates its refresh token on
   * every use, so two processes (TUI + WebUI, an editor's `wstack acp`)
   * refreshing from the same stored pair used to end with one of them getting
   * `refresh_token_reused` and the account needing a fresh sign-in.
   */
  credential?: ProviderApiKey | undefined;
  /** Override the refresh call (tests). */
  refreshFn?:
    | ((refreshToken: string, signal?: AbortSignal) => Promise<CodexOAuthTokens>)
    | undefined;
  /**
   * Reasoning effort for the Codex (gpt-5.x) reasoning models. Sent as
   * `reasoning.effort` with `summary: 'auto'` so chain-of-thought streams back
   * as thinking deltas. Request-level reasoning settings override this default.
   * Default 'medium'. Set 'none' to omit reasoning entirely.
   */
  reasoningEffort?: ReasoningEffort | undefined;
  /** Used only when the live model catalog explicitly supports verbosity. */
  textVerbosity?: 'low' | 'medium' | 'high' | undefined;
}

export class OpenAICodexProvider extends WireAdapter {
  override readonly id: string;
  override readonly capabilities: Capabilities;

  private access: string;
  private refresh: string | undefined;
  private accountId: string | undefined;
  private credential: ProviderApiKey | undefined;
  private readonly refreshFn: (
    refreshToken: string,
    signal?: AbortSignal,
  ) => Promise<CodexOAuthTokens>;
  /** Shared OAuth refresh machinery — see packages/providers/src/oauth-refresh-coordinator.ts */
  private readonly refreshCoordinator: OAuthRefreshCoordinator<
    CodexOAuthTokens,
    NonNullable<OpenAICodexProviderOptions['onRefresh']> extends (p: infer P) => void ? P : never
  >;
  private readonly reasoningEffort: ReasoningEffort;
  private readonly textVerbosity: 'low' | 'medium' | 'high';
  /** Explicit caller override; absent means "defer to the model's catalog default". */
  private readonly configuredReasoningEffort: ReasoningEffort | undefined;
  private readonly onResponseMetadata?: ((metadata: CodexResponseMetadata) => void) | undefined;
  private readonly onModels?: ((models: CodexLiveModel[]) => void) | undefined;
  /** Last live list, so an unchanged catalog does not re-notify the host. */
  private lastModelsSignature: string | undefined;
  private readonly useWebSocket: boolean;
  private readonly webSocketPrewarm: boolean;
  private readonly webSocketPool: CodexWebSocketPool | undefined;
  private readonly webSocketDisabled = new Set<string>();
  private contextLimits = new Map<string, CodexModelPolicy>();
  /**
   * Per-conversation `x-codex-turn-state`, the backend's sticky-routing token.
   *
   * The backend returns it on every `/codex/responses` response and expects it
   * back on the remaining requests of the SAME turn; that is what keeps a
   * turn's tool-call round-trips pinned to the machine already holding the
   * conversation's cached prefix. Dropping it (as this transport used to)
   * re-rolls routing on every tool result — the requests with the longest
   * shared prefix in the whole session, and so the ones a cache miss costs
   * most.
   */
  private readonly turnState = new Map<string, string>();
  /**
   * A rejected reasoning replay must not disable unrelated models or threads
   * sharing this provider. Entries are bounded like the turn-state map.
   */
  private readonly reasoningReplayDisabled = new Set<string>();
  /** `openai-model` from the response headers, per request (see `model_rerouted`). */
  private readonly servedModels = new WeakMap<Request, string>();
  private readonly cacheProbeRequests = new WeakMap<
    object,
    {
      requestId: string;
      sessionKey: string;
      reasoningTokens?: number | undefined;
    }
  >();
  private contextLimitsEtag: string | undefined;
  private contextLimitsRefresh: Promise<void> | undefined;
  private contextLimitsFreshUntil = 0;
  private contextLimitsRetryAfter = 0;

  constructor(opts: OpenAICodexProviderOptions) {
    super(
      opts.credentials.accessToken,
      opts.baseUrl ?? DEFAULT_CODEX_BASE,
      opts.fetchImpl,
      opts.streamOpts,
    );
    this.id = opts.id ?? 'openai-codex';
    this.access = opts.credentials.accessToken;
    this.refresh = opts.credentials.refreshToken;
    this.accountId = opts.credentials.accountId ?? extractAccountId(this.access) ?? undefined;
    this.refreshFn = opts.refreshFn ?? refreshCodexAccessToken;
    this.credential = opts.credential ? { ...opts.credential } : undefined;
    this.refreshCoordinator = new OAuthRefreshCoordinator<
      CodexOAuthTokens,
      {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        accountId: string | undefined;
      }
    >({
      initialRefreshKey: opts.credentials.refreshToken,
      initialExpiresAt: opts.credentials.expiresAt,
      refreshSkewMs: CODEX_TOKEN_REFRESH_SKEW_MS,
      label: 'Codex OAuth',
      hooks: {
        refreshFn: (key, signal) => this.exchangeRefreshToken(key, signal),
        // The host transaction already wrote the rotation under its lock.
        onRefresh: (payload) => {
          if (!this.refreshesInHostTransaction()) opts.onRefresh?.(payload);
        },
        formatPayload: (_tokens, derived) => ({
          accessToken: derived.accessToken,
          refreshToken: derived.refreshKey ?? '',
          expiresAt: derived.expiresAt,
          accountId: this.accountId,
        }),
        projectTokens: (tokens) => ({
          accessToken: tokens.access,
          expiresAt: tokens.expires,
          // Codex rotates its refresh token on every refresh.
          refreshKey: tokens.refresh,
        }),
        applyTokens: (derived) => {
          this.access = derived.accessToken;
          if (derived.refreshKey !== undefined) {
            this.refresh = derived.refreshKey;
          }
          // Re-derive the ChatGPT account id from the new access token, falling
          // back to the cached value if the new JWT lacks the claim.
          this.accountId = extractAccountId(derived.accessToken) ?? this.accountId;
          // A pooled WebSocket captured the old bearer/account headers at
          // handshake time. Never reuse it after token rotation — but let a
          // response already streaming on it finish (retire, not close).
          this.webSocketPool?.retireAll();
        },
      },
    });
    this.configuredReasoningEffort = opts.reasoningEffort;
    this.reasoningEffort = opts.reasoningEffort ?? 'medium';
    this.textVerbosity = opts.textVerbosity ?? 'low';
    this.onResponseMetadata = opts.onResponseMetadata;
    this.onModels = opts.onModels;
    this.webSocketPrewarm = opts.webSocketPrewarm ?? false;
    this.useWebSocket = opts.webSocket ?? opts.fetchImpl === undefined;
    this.webSocketPool = this.useWebSocket
      ? new CodexWebSocketPool(opts.webSocketFactory ?? defaultCodexWebSocketFactory)
      : undefined;
    this.capabilities = capabilitiesForFamily('openai-codex', { ...opts.capabilities });
  }

  private refreshesInHostTransaction(): boolean {
    return this.credential !== undefined && hasSubscriptionRefreshTransaction();
  }

  /** One refresh-token exchange; see {@link OpenAICodexProviderOptions.credential}. */
  private async exchangeRefreshToken(
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<CodexOAuthTokens> {
    const stored = this.credential;
    const renewed = stored
      ? await renewRotatingOAuthCredential({
          providerId: this.id,
          stored,
          accessToken: this.access,
          refreshToken,
          exchange: (key) => this.refreshFn(key, signal),
          project: (tokens, current) => ({
            accountId: extractAccountId(tokens.access) ?? current.accountId,
          }),
          signInHint:
            'ChatGPT sign-in has no refresh token. Sign in again: wstack auth login chatgpt',
        })
      : undefined;
    if (!renewed) return this.refreshFn(refreshToken, signal);
    this.credential = renewed.credential;
    return renewed.tokens;
  }

  /**
   * Re-check the ChatGPT Codex model catalog at request boundaries. The
   * official Codex client treats `context_window` as the default and
   * `max_context_window` as the ceiling allowed for configured overrides
   * (codex-rs/models-manager/src/model_info.rs, with_config_overrides).
   * Report that maximum, falling back to the default for older catalogs;
   * the agent loop still clamps it to its configured baseline and any
   * learned overflow limit. Using the default as a hard cap incorrectly
   * reduces a configured 1M window to 272K even on long-context models.
   * Return an input ceiling after reserving output headroom. A conditional
   * GET observes catalog changes before each provider call.
   */
  async refreshContextLimit(
    model: string,
    opts: { signal: AbortSignal },
  ): Promise<{ maxContext: number; source: 'provider' } | undefined> {
    await this.ensureFreshToken(opts.signal);
    const now = Date.now();
    if (now < this.contextLimitsFreshUntil || now < this.contextLimitsRetryAfter) {
      const cached = this.contextLimits.get(model)?.sendCeiling;
      return cached ? { maxContext: cached, source: 'provider' } : undefined;
    }
    this.contextLimitsRefresh ??= this.fetchContextLimits(opts.signal).finally(() => {
      this.contextLimitsRefresh = undefined;
    });
    await this.contextLimitsRefresh;
    const maxContext = this.contextLimits.get(model)?.sendCeiling;
    return maxContext ? { maxContext, source: 'provider' } : undefined;
  }

  private async fetchContextLimits(signal: AbortSignal): Promise<void> {
    return fetchContextLimitsFromHost.call(this.codexAccountCatalogHost(), signal);
  }

  /**
   * Hand the host the account's live model list, but only when it changed.
   *
   * The catalog is re-read on a five-minute cadence and revalidated with an
   * ETag, so most reads return the same list; notifying every time would make
   * a host that persists the list rewrite its config on a timer.
   */
  private publishLiveModels(models: CodexLiveModel[]): void {
    publishLiveModelsFromHost.call(this.codexAccountCatalogHost(), models);
  }

  override async *stream(req: Request, opts: { signal: AbortSignal }): AsyncIterable<StreamEvent> {
    // A fresh cache object survives request spreads/tool filtering without
    // mixing simultaneous calls, even when callers reuse a Request object.
    const probe = isCacheProbeEnabled()
      ? {
          requestId: '',
          sessionKey: 'no-session',
          reasoningTokens: undefined as number | undefined,
        }
      : undefined;
    if (probe) {
      req = { ...req, cache: { ...req.cache } };
      this.cacheProbeRequests.set(req.cache!, probe);
    }
    await this.ensureFreshToken(opts.signal);
    let emitted = false;
    // `track` is a plain generator expression, so it has no `this`; the probe
    // below needs the provider id from the enclosing scope.
    const providerId = this.id;
    const track = async function* (source: AsyncIterable<StreamEvent>): AsyncIterable<StreamEvent> {
      for await (const event of source) {
        // `message_start` carries no user-visible content. A backend can emit
        // it before a response.failed envelope, and retrying at that point is
        // still safe. Every other streamed event is treated as an output
        // boundary to prevent duplicate text/tool/reasoning delivery.
        if (event.type !== 'message_start') emitted = true;
        // The charge for the request whose prefix the probe just fingerprinted.
        // Recorded here rather than in `parseStream` because the WebSocket
        // transport parses the stream itself and never calls that override.
        if (event.type === 'message_stop' && isCacheProbeEnabled()) {
          recordCacheProbeUsage({
            provider: providerId,
            sessionKey: probe?.sessionKey ?? 'no-session',
            requestId: probe?.requestId,
            model: req.model,
            threadId: req.cache?.threadId ?? req.cache?.sessionId,
            usage: event.usage,
            reasoningTokens: probe?.reasoningTokens,
          });
        }
        yield event;
      }
    };
    let transportError: unknown;
    try {
      if (
        this.useWebSocket &&
        !this.webSocketDisabled.has(this.webSocketScope(req)) &&
        this.webSocketPool
      ) {
        yield* track(this.streamWebSocket(req, opts));
      } else {
        yield* track(super.stream(req, opts));
      }
      return;
    } catch (err) {
      transportError = err;
      if (err instanceof CodexWebSocketFallbackError && !emitted) {
        // Match the official client: once this session proves WebSocket
        // incompatible, keep using HTTP instead of paying for a failed upgrade
        // before every turn.
        this.webSocketDisabled.add(this.webSocketScope(req));
        if (this.webSocketDisabled.size > CODEX_TURN_STATE_MAX_SESSIONS) {
          const oldest = this.webSocketDisabled.values().next().value;
          if (oldest !== undefined) this.webSocketDisabled.delete(oldest);
        }
        try {
          yield* track(super.stream(req, opts));
          return;
        } catch (sseError) {
          transportError = sseError;
        }
      }
    }

    const err = transportError;
    // A 401 means the token went stale between the pre-flight check and the
    // request (or we had no expiry to check). Refresh once and retry only before
    // any output has been emitted, so a mid-stream auth failure cannot duplicate it.
    if (!emitted && err instanceof ProviderError && err.status === 401 && this.refresh) {
      await this.doRefresh(opts.signal);
      yield* track(super.stream(req, opts));
      return;
    }
    // Reasoning replay is a token-and-quota optimisation, never a requirement.
    // If the backend rejects a replayed reasoning item before output starts, retry
    // over SSE without replay rather than stranding the session.
    if (
      !emitted &&
      !this.reasoningReplayDisabled.has(this.reasoningReplayKey(req)) &&
      err instanceof ProviderError &&
      err.status === 400 &&
      isReasoningReplayRejection(err)
    ) {
      this.reasoningReplayDisabled.add(this.reasoningReplayKey(req));
      if (this.reasoningReplayDisabled.size > CODEX_TURN_STATE_MAX_SESSIONS) {
        const oldest = this.reasoningReplayDisabled.values().next().value;
        if (oldest !== undefined) this.reasoningReplayDisabled.delete(oldest);
      }
      yield* track(super.stream(req, opts));
      return;
    }
    throw err;
  }

  private streamWebSocket(req: Request, opts: { signal: AbortSignal }): AsyncIterable<StreamEvent> {
    const effectiveReq = this.applyMaxToolsFilter(req);
    const body = this.buildBody(effectiveReq, {
      capabilities: this.capabilities,
      providerId: this.id,
    });
    const headers = this.buildHeaders(effectiveReq);
    headers['OpenAI-Beta'] = 'responses_websockets=2026-02-06';
    // Handshake headers are captured once per pooled connection, so a value
    // that changes per request cannot ride on them. The WebSocket protocol
    // carries turn state in the request's `client_metadata` instead, exactly
    // as the official client does.
    const turnState = headers[CODEX_TURN_STATE_HEADER];
    delete headers[CODEX_TURN_STATE_HEADER];
    return this.webSocketPool!.stream(
      {
        url: resolveCodexWebSocketUrl(this.baseUrl),
        headers,
        request: effectiveReq,
        body,
        fallbackModel: effectiveReq.model,
        providerId: this.id,
        signal: opts.signal,
        // Same budget as the SSE hang guard (configurable; 0 disables) instead
        // of the transport's fixed 30s, which killed long silent reasoning.
        stallTimeoutMs: this.streamHangTimeoutMs,
        prewarm: this.webSocketPrewarm,
        probeRequestId: effectiveReq.cache
          ? this.cacheProbeRequests.get(effectiveReq.cache)?.requestId
          : undefined,
        ...(turnState ? { turnState } : {}),
        onTurnState: (value) => this.rememberTurnState(effectiveReq, value),
        onMetadata: (metadata) => this.handleResponseMetadata(effectiveReq, metadata),
        onHeaders: (responseHeaders) => this.onResponseHeaders(responseHeaders, effectiveReq),
      },
      (body, model, _providerId, onMetadata) =>
        this.parseStream(body, model, effectiveReq, onMetadata),
    );
  }

  /**
   * Consume a `response.metadata` frame.
   *
   * On the WebSocket transport there are no HTTP response headers after the
   * handshake, so this frame is the ONLY delivery of the quota windows, the
   * catalog etag and the sticky-routing token for every turn after the first.
   * Reading only the etag here left a WebSocket session's quota reporting
   * frozen at whatever the handshake happened to return.
   */
  private handleResponseMetadata(_req: Request, metadata: CodexResponseMetadata): void {
    const etag = metadata.headers['x-models-etag'];
    if (etag && etag !== this.contextLimitsEtag) {
      this.contextLimitsEtag = etag;
      this.contextLimitsFreshUntil = 0;
    }
    this.rememberTurnState(_req, metadata.headers[CODEX_TURN_STATE_HEADER]);
    const planLabel =
      metadata.headers['x-codex-plan-type'] ?? extractPlanType(this.access) ?? undefined;
    const snapshots = parseCodexRateLimitHeaders(new Headers(metadata.headers)).map((snapshot) =>
      snapshot.planLabel === undefined && planLabel !== undefined
        ? { ...snapshot, planLabel }
        : snapshot,
    );
    if (snapshots.length > 0) recordProviderQuota(this.id, snapshots);
    this.onResponseMetadata?.(metadata);
  }

  /**
   * Read the plan quota from the account usage endpoint (`GET /wham/usage`)
   * and record it — the reading a surface needs BEFORE any turn, since the
   * `x-codex-*` headers only arrive on responses.
   *
   * This is a status read, not a model call: the official client's `/status`
   * uses it, and it spends none of the plan it reports. The token is refreshed
   * first when due (and once more on a 401), through the same coordinator —
   * and persistence hook — every request uses, so a rotated refresh token is
   * never lost. Like other account reads it skips the trace proxy. Resolves to
   * the snapshots recorded, or an empty array when nothing could be read.
   */
  async readAccountQuota(opts: { signal?: AbortSignal | undefined; timeoutMs?: number } = {}) {
    return readAccountQuotaFromHost.call(this.codexAccountCatalogHost(), opts);
  }

  private async ensureFreshToken(signal: AbortSignal): Promise<void> {
    await this.refreshCoordinator.ensureFreshToken(signal);
  }

  private async doRefresh(signal: AbortSignal): Promise<void> {
    await this.refreshCoordinator.doRefresh(signal);
  }

  protected override buildUrl(_req: Request): string {
    return resolveCodexUrl(this.baseUrl);
  }

  /**
   * Harvest the two out-of-band signals the ChatGPT backend only sends in
   * response headers.
   *
   * Quota (`x-codex-*-used-percent`, window minutes, reset-at, credits) is the
   * ONLY place a ChatGPT-login user's remaining 5h/weekly allowance is
   * reported. Without reading it the first sign of an exhausted plan is a 429
   * mid-turn; with it, surfaces can show the burn rate before it bites.
   *
   * `x-codex-turn-state` is retained here and replayed by `buildHeaders` on the
   * remaining requests of the same turn — see `resolveTurnState`, which expires
   * it as soon as a new user turn begins.
   */
  protected override onResponseHeaders(headers: HeadersLike | undefined, _request: Request): void {
    if (!headers) return;
    this.rememberTurnState(_request, headers.get(CODEX_TURN_STATE_HEADER) ?? undefined);
    const served = (headers.get('openai-model') ?? headers.get('x-openai-model'))?.trim();
    if (served) this.servedModels.set(_request, served);
    // `x-codex-plan-type` is the account's live tier as the backend sees it.
    // The JWT claim is a snapshot taken when the token was minted, so it goes
    // stale across an upgrade; prefer the header and keep the claim as the
    // fallback for backends that omit it.
    const planLabel =
      headers.get('x-codex-plan-type')?.trim() || extractPlanType(this.access) || undefined;
    const snapshots = parseCodexRateLimitHeaders(headers).map((snapshot) =>
      snapshot.planLabel === undefined && planLabel !== undefined
        ? { ...snapshot, planLabel }
        : snapshot,
    );
    if (snapshots.length > 0) recordProviderQuota(this.id, snapshots);
    const etag = headers.get('x-models-etag');
    if (etag && etag !== this.contextLimitsEtag) {
      this.contextLimitsEtag = etag;
      this.contextLimitsFreshUntil = 0;
    }
  }

  protected override buildHeaders(_req: Request): Record<string, string> {
    const headers: Record<string, string> = {
      ...super.buildHeaders(_req),
      authorization: `Bearer ${this.access}`,
      originator: CODEX_ORIGINATOR,
      'user-agent': CODEX_USER_AGENT,
    };
    if (this.accountId) headers['chatgpt-account-id'] = this.accountId;
    const cacheSessionId = codexCacheSessionId(_req.cache?.sessionId);
    const cacheThreadId = codexCacheSessionId(_req.cache?.threadId) ?? cacheSessionId;
    if (cacheSessionId) headers['session-id'] = cacheSessionId;
    if (cacheThreadId) {
      const clientRequestId = codexClientRequestId(cacheThreadId);
      headers['thread-id'] = clientRequestId;
      headers['x-client-request-id'] = clientRequestId;
    } else {
      headers['x-client-request-id'] = randomUUID();
    }
    const turnState = this.resolveTurnState(_req);
    if (turnState) headers[CODEX_TURN_STATE_HEADER] = turnState;
    const routingHint = codexRoutingHint(_req.model);
    if (routingHint) headers[CODEX_ROUTING_HINT_HEADER] = routingHint;
    return headers;
  }

  /** Key under which this request's turn state is remembered. */
  private turnStateKey(req: Request): string {
    return (
      codexCacheSessionId(req.cache?.threadId) ??
      codexCacheSessionId(req.cache?.sessionId) ??
      '__default__'
    );
  }

  private reasoningReplayKey(req: Request): string {
    return JSON.stringify([this.accountId, req.model, this.turnStateKey(req)]);
  }

  private webSocketScope(req: Request): string {
    return JSON.stringify([this.accountId, this.turnStateKey(req)]);
  }

  /**
   * The sticky-routing token to send with this request, expiring the stored one
   * when the request opens a new turn.
   *
   * The catalog probe passes a synthetic empty request through `buildHeaders`;
   * it must neither send nor invalidate a conversation's turn state.
   */
  private resolveTurnState(req: Request): string | undefined {
    if (req.messages.length === 0) return undefined;
    const key = this.turnStateKey(req);
    if (!isTurnContinuation(req)) {
      this.turnState.delete(key);
      return undefined;
    }
    return this.turnState.get(key);
  }

  private rememberTurnState(req: Request, value: string | undefined): void {
    if (!value || req.messages.length === 0) return;
    const key = this.turnStateKey(req);
    // Re-insert so the map stays in least-recently-used order for the eviction
    // below; a Map preserves insertion order and delete+set moves the entry.
    this.turnState.delete(key);
    this.turnState.set(key, value);
    while (this.turnState.size > CODEX_TURN_STATE_MAX_SESSIONS) {
      const oldest = this.turnState.keys().next().value;
      if (oldest === undefined) break;
      this.turnState.delete(oldest);
    }
  }

  protected override buildBody(req: Request, ctx: BuildBodyContext): Record<string, unknown> {
    const body = buildCodexRequestBody(req, {
      capabilities: ctx.capabilities,
      policy: this.contextLimits.get(req.model),
      includeReasoning: !this.reasoningReplayDisabled.has(this.reasoningReplayKey(req)),
      configuredReasoningEffort: this.configuredReasoningEffort,
      reasoningEffort: this.reasoningEffort,
      textVerbosity: this.textVerbosity,
    });
    // Opt-in local comparison within the same account/model/thread/settings.
    // Changed segments can explain lost overlap, but unchanged JSON cannot
    // prove the backend's rendered prefix, cache boundaries or routing.
    if (isCacheProbeEnabled()) {
      const sessionKey = String(body['prompt_cache_key'] ?? 'no-session');
      const probe = req.cache ? this.cacheProbeRequests.get(req.cache) : undefined;
      if (probe) {
        probe.requestId = randomUUID();
        probe.sessionKey = sessionKey;
        probe.reasoningTokens = undefined;
      }
      recordCacheProbeRequest({
        provider: this.id,
        sessionKey,
        requestId: probe?.requestId,
        threadId: req.cache?.threadId ?? req.cache?.sessionId,
        // Used only in the in-memory identity; never written into the log.
        accountScope: createHash('sha256')
          .update(this.accountId ?? this.access)
          .digest('hex'),
        settings: [
          body['reasoning'],
          body['text'],
          body['tool_choice'],
          body['parallel_tool_calls'],
        ],
        model: req.model,
        instructions: String(body['instructions'] ?? ''),
        tools: body['tools'] as readonly unknown[] | undefined,
        items: body['input'] as readonly unknown[],
      });
    }
    return body;
  }

  protected override parseStream(
    body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | null,
    fallbackModel: string,
    req: Request,
    onMetadata?: ((metadata: CodexResponseMetadata) => void) | undefined,
  ): AsyncIterable<StreamEvent> {
    const probe = req.cache ? this.cacheProbeRequests.get(req.cache) : undefined;
    return parseOpenAIResponsesStream(
      body,
      fallbackModel,
      this.id,
      onMetadata ?? ((metadata) => this.handleResponseMetadata(req, metadata)),
      probe
        ? (tokens) => {
            probe.reasoningTokens = tokens;
          }
        : undefined,
      {
        onWrappedHttpError: (status, rawText, headers) =>
          this.translateError(status, rawText, headers),
        servedModel: () => this.servedModels.get(req),
        rerouteReason: CODEX_REROUTE_REASON,
      },
    );
  }

  protected override encodeRequestBody(
    json: string,
    headers: Record<string, string>,
  ): string | Uint8Array {
    return compressCodexRequestBody(json, headers, this.baseUrl);
  }

  /** Translate an HTTP failure and mine its quota headers — see `translateCodexHttpError`. */
  protected override translateError(
    status: number,
    text: string,
    headers?: HeadersLike,
  ): ProviderError {
    return translateCodexHttpError(this.id, status, text, headers);
  }

  private codexAccountCatalogHost(): CodexAccountCatalogHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.baseUrl satisfies CodexAccountCatalogHost['baseUrl']);
    void (this.buildHeaders satisfies CodexAccountCatalogHost['buildHeaders']);
    void (this.contextLimitsEtag satisfies CodexAccountCatalogHost['contextLimitsEtag']);
    void (this.fetchImpl satisfies CodexAccountCatalogHost['fetchImpl']);
    void (this
      .contextLimitsFreshUntil satisfies CodexAccountCatalogHost['contextLimitsFreshUntil']);
    void (this
      .contextLimitsRetryAfter satisfies CodexAccountCatalogHost['contextLimitsRetryAfter']);
    void (this.contextLimits satisfies CodexAccountCatalogHost['contextLimits']);
    void (this.publishLiveModels satisfies CodexAccountCatalogHost['publishLiveModels']);
    void (this.onModels satisfies CodexAccountCatalogHost['onModels']);
    void (this.lastModelsSignature satisfies CodexAccountCatalogHost['lastModelsSignature']);
    void (this.access satisfies CodexAccountCatalogHost['access']);
    void (this.accountId satisfies CodexAccountCatalogHost['accountId']);
    void (this.ensureFreshToken satisfies CodexAccountCatalogHost['ensureFreshToken']);
    void (this.doRefresh satisfies CodexAccountCatalogHost['doRefresh']);
    void (this.id satisfies CodexAccountCatalogHost['id']);
    return this as unknown as CodexAccountCatalogHost;
  }
}
