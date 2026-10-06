# Prompt Caching

WrongStack treats prompt caching as **provider-agnostic**. Every request carries a
stable cache-partition key derived from the frozen system-prompt prefix, and each
provider wire maps that single concept onto its own native mechanism. Adapters expose cache controls and usage where supported. Actual hits depend on
prefix stability and provider behavior; inspect recorded usage in
`/context`.

## The unified cache key

Each request gets `req.cache.key` — a short, content-addressed hash of the stable
system-prompt epoch (`deriveCachePrefixKey`, `packages/core/src/utils/cache-key.ts`).
Because it is derived from the prefix content (not the session id), two sessions with
the same system prompt produce the same key, so provider backends route
prefix-sharing requests to the same automatic-cache partition.

- Set once per prompt epoch (WeakMap-cached), attached to `baseReq.cache` in
  `core/agent-response.ts`.
- The config-driven `cache.ttl` is **merged** over it by the ModelRuntime middleware
  (`applyModelRuntime`), so both survive.
- Anthropic ignores the key (it uses explicit markers); only auto-cache wires read it.

## Per-provider mechanisms

| Provider family | `cacheControl` | Mechanism |
|---|---|---|
| Anthropic (+ Claude OAuth) | `native` | Explicit `cache_control` breakpoints on the stable prefix, capped at Anthropic's global limit of 4 (see below). TTL tunable via `cache.ttl` (`5m`/`1h`). |
| OpenAI · GitHub Copilot | `auto` | The key is sent as `prompt_cache_key` so automatic caching hits on load-balanced backends. |
| Codex (Responses API) | `auto` | Same `prompt_cache_key`, on the Responses body. |
| DeepSeek / OpenAI-compatible | `none`* | Automatic server-side caching needs no client key. Read-side hit tokens are still reported. |
| Google Gemini | `none`* | **Implicit** caching is automatic on a byte-stable prefix (no setup). **Explicit** `cachedContents` is opt-in (see below). |
| Mistral · local (vLLM/Ollama/LM Studio) | `none` | No client-side prompt-cache API. vLLM does automatic server-side prefix caching. |

\* `none` here means "no explicit client breakpoint control" — the provider may still
cache automatically.

The mechanism label for the active provider is shown by `/context cache`.

## Anthropic breakpoint cap

Anthropic rejects requests with more than 4 `cache_control` breakpoints, counted
globally across `tools + system + messages`. A rich system prompt (skills + mode +
plan + autonomy contributors + the two per-turn volatile blocks) can exceed that.
`capAnthropicCacheBreakpoints` (`packages/providers/src/cache-breakpoint-cap.ts`) is
the single chokepoint in the Anthropic wire `buildBody`: when over budget it keeps
the first marker (static prefix anchor), the last (largest incremental prefix), any
ttl-pinned marker, then fills remaining slots by the widest prefix gap — and strips
the rest. It never adds a breakpoint. The cap prevents an invalid request; cache-hit or
latency improvement must be measured separately.

## Gemini explicit caching (opt-in)

Set `modelRuntime.cache.geminiExplicit: true` to create a server-side
`cachedContents` resource for the system instruction + tool defs and reference it by
name each turn (bigger savings on large stable prefixes). `GoogleProvider.stream()`
hashes the prefix, reuses a live cache or creates one (`POST .../cachedContents`),
then references it and omits the now-cached fields from the live body. State lives on
the provider instance; the resource expires by server TTL (no dispose plumbing
needed). It is **best-effort**: a too-small prefix or any HTTP error falls back to a
normal inline request, while cancellation and normal provider failures still follow the request lifecycle. Default is off —
implicit caching already covers the common case for free.

## Visibility

Cache accounting is parsed from every provider's usage into the canonical `Usage`
(`cacheRead`/`cacheWrite`) and accumulated by the token counter, which also tracks
**USD saved** (cached tokens billed at the cache-read rate instead of full input).

- **Live**: the status-bar cache chip; the context-fill bar.
- **`/context`**: a `cache-hit: N% · read/write · saved ~$X` line, plus a per-provider
  split once a session spans more than one provider.
- **`/context cache`**: a consolidated report — session hit ratio, tokens, USD saved,
  the active provider's mechanism, and the per-provider breakdown
  (`ProviderCacheLedger`, `packages/core/src/infrastructure/provider-cache-ledger.ts`,
  which reconstructs per-provider stats from the `token.accounted` event stream).

## Configuration

```jsonc
{
  "modelRuntime": {
    "cache": {
      "ttl": "1h",            // 5m | 1h — Anthropic explicit-cache TTL
      "geminiExplicit": false // opt-in Gemini server-side cachedContents
    }
  }
}
```

Per-subagent overrides go under `modelMatrix[*].modelRuntime.cache`.

## Code map

- `packages/core/src/utils/cache-key.ts` — `deriveCachePrefixKey`
- `packages/core/src/execution/model-runtime.ts` — `resolveCacheForRequest`, cache merge
- `packages/providers/src/prompt-cache-key.ts` — `applyPromptCacheKey` (OpenAI family)
- `packages/providers/src/cache-breakpoint-cap.ts` — Anthropic 4-breakpoint cap
- `packages/providers/src/google.ts` — Gemini explicit `cachedContents` flow
- `packages/core/src/infrastructure/token-counter.ts` — `cacheStats()` (+ `savedUsd`)
- `packages/core/src/infrastructure/provider-cache-ledger.ts` — per-provider aggregation
- `packages/cli/src/slash-commands/context.ts` — `/context` + `/context cache`
