# OpenAI cache management

WrongStack has two ChatGPT subscription transports. `openai-codex` uses the ChatGPT backend; `openai-chatgpt` uses Sign in with ChatGPT through the public Responses endpoint. They share normalized messages and usage, but endpoint capabilities differ. API-key OpenAI usage is a separate billing path.

## What consumes the allowance

Every model request reads context: instructions, tools, history, tool results and live evidence. A small final answer can follow many large input requests. Parallel and sequential child agents contribute their own calls. A local serialization cache or compressed HTTP body saves host work or upload bytes; it does not discount model tokens.

The official documentation says model, context, reasoning, tool use, retrieval and caching all affect plan usage. Credit rates alone do not establish included subscription consumption. Codex credit billing discounts cached input and has no separate cache-write charge; API pricing has different rules. [ChatGPT pricing and usage](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan), [token rates](https://learn.chatgpt.com/docs/pricing#token-rates).

An investigation on 2026-10-07 read the 400 most recently modified session summaries in the two local WrongStack project stores. It selected 51 `openai-chatgpt / gpt-6.1-sol` child sessions and summed only their `llm_response` events, excluding duplicate `session_end` totals:

| Metric | Recorded value |
|---|---:|
| Model calls | 194 |
| Fresh input tokens | 5,804,429 |
| Cache-read tokens | 444,672 |
| Cache-write tokens reported | 0 |
| Output tokens | 46,517 |
| Complete prompt tokens | 6,249,101 |
| Cache-read share | 7.12% |

This is a bounded historical sample, not an account-wide bill or a measurement after the repairs. An absent cache-write field contributes zero to this recorded total; it does not establish that no backend writes occurred. No `openai-codex` session matched this sample. One three-call child session loaded 94,734 prompt tokens, of which 2,176 were cache reads, and generated 1,379 output tokens. Its recorded estimates grew from 34,640 to 42,744 input tokens with 13 tools. These observations identify input reuse as a useful target; they do not establish which request component caused each live miss.

## Request stability contract

Both subscription adapters now keep stable system instructions separate from blocks marked with `markVolatileSystemBlock`. Marked blocks are sent after durable history. Their current values remain available to the model without being joined into the earlier `instructions` string. Core already moves prompt-epoch live state to the request tail; this adapter rule also covers later middleware such as SAGE turn memory and skill suggestions.

The public ChatGPT adapter previously joined every system block into instructions. A deterministic two-request fixture changed one marked live value while preserving 19,000 characters of instructions and 20 history items. Before the repair, ChatGPT instructions changed; the Codex control remained stable. Afterwards both preserve instructions and history while delivering the newest value. This is a request-correctness result, not a measured backend hit rate.

`req.cache.sessionId` supplies the owning subscription conversation's `prompt_cache_key` and `session-id`. The active `threadId`, or the session when absent, supplies separate `thread-id` and `x-client-request-id` values. Siblings can share the root partition without sharing thread identity. Overlong or header-unsafe IDs are hashed from their original opaque values; valid safe IDs stay unchanged. Replacing unsafe characters with underscores was lossy and merged distinct IDs such as `session/a` and `session?a`. Calls without a session fall back to the explicit generic `req.cache.key`. Generic Responses gateways retain their own key and caller-supplied routing headers.

OpenAI caching requires an unchanged rendered prefix and an eligible matching boundary. Tools, instructions, reasoning effort and verbosity can affect that prefix. For models before GPT-5.6 a stable key assists routing; on GPT-5.6 and later the documented key primarily separates accounting. Neither a stable key nor matching local JSON guarantees a cache hit. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Comparison with upstream agents

Sources inspected on 2026-10-07 are pinned below; these are source comparisons, not comparative task benchmarks.

| Agent | Relevant mechanism | WrongStack result |
|---|---|---|
| [Official Codex Rust client](https://github.com/openai/codex/blob/a6baf8867cb4c9726213c0884a5c8b11f0cfd8bf/codex-rs/core/src/client.rs) and [Responses headers](https://github.com/openai/codex/blob/a6baf8867cb4c9726213c0884a5c8b11f0cfd8bf/codex-rs/codex-api/src/endpoint/responses.rs) | Owning cache identity, thread identity, encrypted reasoning, verified WebSocket continuation | Codex adapter already implements these; public ChatGPT session identity now follows the same split |
| [Pi Codex](https://github.com/badlogic/pi-mono/blob/2db5e359bf84c1c0be51d2c5c5c5c7cf27072c2b/packages/ai/src/api/openai-codex-responses.ts) and [Pi public Responses](https://github.com/badlogic/pi-mono/blob/2db5e359bf84c1c0be51d2c5c5c5c7cf27072c2b/packages/ai/src/api/openai-responses.ts) | Session keys, transport statistics, model-specific options and route restrictions | WrongStack now records cache and reasoning diagnostics on public ChatGPT as well as Codex; restricted subscription fields remain omitted |
| [OpenCode provider projection](https://github.com/anomalyco/opencode/blob/ecc4916b5a9608c30e6dd58a67f2137b594407ca/packages/opencode/src/provider/transform.ts) and [Codex plugin](https://github.com/anomalyco/opencode/blob/ecc4916b5a9608c30e6dd58a67f2137b594407ca/packages/opencode/src/plugin/openai/codex.ts) | Session cache key and subscription-specific transport handling | Public ChatGPT now keeps the session key through generic prefix epochs; our existing pressure-gated compaction remains the history policy |

WrongStack sorts Responses tool definitions, preserves validated raw tool arguments, replays complete encrypted reasoning pairs, scopes Codex turn state and fallback per thread, and recovers expired WebSocket state with one bounded reconnect. Reasoning summaries now survive stream aggregation and JSON persistence, and both stateless replay and WebSocket prefix comparison use the original summary parts. Legacy summary-free metadata remains supported. Responses tool memoization compares name, description and schema content: an in-place list/schema edit invalidates the memo while execution-only edits retain it. On a changed definition, compaction is recomputed with the same existing prose budgets rather than reusing its stale object-identity memo.

## Inspect an actual workload

Enable the existing opt-in probe before starting the WrongStack process:

```powershell
$env:WRONGSTACK_CACHE_PROBE = 'D:\Codebox\PROJECTS\WrongStack\.temp_files\openai-cache-run.jsonl'
wstack
```

The process reads this setting once. Restart an already running host to enable it. Use a binary built from the repaired source; an installed older binary will retain its previous behavior. If the setting is omitted, `0` or `false`, the probe performs no fingerprint/file work.

Both adapters emit `req` and `usage` records, linked by `requestId`. The request record fingerprints tools, instructions and input items; it contains hashes and lengths, not their text or authentication tokens. Comparison scopes separate provider, account fingerprint, model, thread and relevant settings. Public Responses account fingerprints use the token hash, so token rotation starts a new local comparison scope. Concurrent calls own separate probe state even when callers reuse one Request object.

Interpret these fields separately:

- `promptTokens`: fresh input + cache read + cache write.
- `actualHitPct`: the backend-reported cache-read share of complete prompt tokens.
- `outputTokens`: total generated output, including reasoning.
- `reasoningOutputTokens`: the reported reasoning subset; do not add it again. Zero is retained; missing values stay unknown.
- `matchingPrefixCharsPct`: local serialized character overlap, not an expected backend token hit percentage.
- `instructionsChanged`, `toolsChanged`, `firstDivergentItem`: where the local request stopped matching.

Codex WebSocket additionally emits `transport` records for full/delta selection. Public ChatGPT currently uses HTTP, so it has no WebSocket delta records. HTTP public plan requests must send history and omit `previous_response_id`. WebSocket continuation, when supported, reduces transport volume while earlier context still counts as input. The public plan preview also rejects output caps and `prompt_cache_retention`; setting a longer TTL universally is not a valid remedy. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [conversation state](https://developers.openai.com/api/docs/guides/conversation-state#passing-context-from-the-previous-response).

## Operating policy

Keep model and reasoning settings stable during a task unless the work needs a change. Scope child-agent tasks and their source material; measure the complete task, including children, retries and compaction. Prefer useful bounded tool output, and keep tool definitions stable between calls. Preserve history until the existing context-pressure policy requires compaction; rewriting old tool results every turn can discard reusable context.

Investigate low cache-read share with the probe before choosing a remedy. If instructions change, inspect volatile middleware and prompt epochs. If tools change, inspect tool discovery and schema selection. If the local prefix remains stable but reported cache reads are low, investigate model boundary/retention and upstream routing instead of assuming the local cache is broken. Avoid periodic inference calls merely to keep a cache warm: those calls consume usage too.

The next workload measurement should compare the same representative task, account, model, settings and child-agent policy before/after a rebuilt host. Measure fresh/read/write input, output/reasoning, calls/retries, task correctness and actual quota-window changes. The first repair round made no inference requests. The bounded transport check below followed the second round; no subscription-saving percentage is claimed.

## Append-only live context, 2026-10-07

The Core request composer previously removed the live-context suffix from its old position and rebuilt it at the new request end. This preserved much of the serialized history, but rewrote the previous request's final input item. On models whose implicit cache boundary is that message ending, shared earlier characters do not establish reuse of that saved endpoint. The previous regression test explicitly allowed this final-item rewrite.

For providers with automatic cache control, including both OpenAI subscription adapters and account aliases, Core now retains request-only live-state snapshots at their original history positions. Changed state is appended as a separate message; identical state is sent once. Marked volatile system blocks added by request middleware follow the same rule. Stable instructions tell the model that the latest complete snapshot replaces older live state. The snapshots never enter the durable conversation journal and reset when the provider, thread, model or earlier history changes, including compaction and resume into different history. Native explicit-breakpoint providers retain their existing request composition.

The real Agent fixture now requires the complete previous input array to remain an exact prefix on both subscription routes, including the old live-context endpoint. Edge tests cover repeated calls, changed state without new history, empty state, mutable source blocks, middleware, account aliases and discarded history. These are request and transport invariants, not a measured cache-hit or quota-saving percentage. Retained snapshots also add input tokens until compaction; deduplication limits that growth, and actual provider usage remains necessary to assess the total benefit. No additional inference or prewarm request was made for this repair.

Validation for this repair: 18 focused checks passed on three consecutive runs; the Core request module passed 971 tests and the provider package passed 1,685 tests, with one opt-in live test skipped. Core/provider source typechecks and builds, changed-test typecheck, scoped Biome, documentation gates and `git diff --check` passed. The standalone executable was not rebuilt or installed, and no running host was restarted. Implementation: `packages/core/src/core/request-context-replay.ts` and `agent-response.ts`; proof and logs are retained in `.temp_files/ledger_packages-core-src-core-request-context-replay.md` and `.temp_files/openai-cache-context-replay/`.

## Second audit and bounded live check, 2026-10-07

Three additional defects were reproduced before their repairs: nonempty server reasoning summaries became empty during replay; two short opaque IDs shared one thread/turn-state scope; and a mutated tool list or nested schema retained an obsolete wire declaration. The unchanged proofs pass after repair. Permanent regression coverage is in `packages/providers/tests/responses-replay-invariants.test.ts`, including separate WebSocket connections for colliding IDs, a nonempty-summary delta continuation, missing/malformed summary metadata and mutable tool definitions.

The current source adapters were checked against the two saved accounts using `gpt-6.1-sol`. Each route made exactly three short HTTP calls with a stable synthetic reference and append-only conversation history. The reference was long enough to test cache reuse; it was not a real coding task. Credentials remained in memory, token renewal was disabled, and no prewarm or retry was performed. A diagnostic subclass used the production Codex body/headers/parser through its base HTTP stream to prevent automatic recovery attempts. Public ChatGPT used its normal Responses adapter. This is direct transport validation, not proof that a previously installed/running host has loaded the new source.

| Route | Call | Fresh input | Cache read | Complete prompt | Cache-read share | Output |
|---|---:|---:|---:|---:|---:|---:|
| openai-codex | 1 | 1,401 | 0 | 1,401 | 0% | 5 |
| openai-codex | 2 | 138 | 1,280 | 1,418 | 90.27% | 5 |
| openai-codex | 3 | 155 | 1,280 | 1,435 | 89.20% | 5 |
| openai-chatgpt | 1 | 1,401 | 0 | 1,401 | 0% | 5 |
| openai-chatgpt | 2 | 138 | 1,280 | 1,418 | 90.27% | 5 |
| openai-chatgpt | 3 | 155 | 1,280 | 1,435 | 89.20% | 5 |

Total: six model requests, 8,508 prompt tokens, 3,388 fresh input tokens, 5,120 cache-read tokens and 30 output tokens. No separate cache-write count was reported. All six responses contained text. Results are stored locally under `.temp_files/openai-cache-audit-round2/live-cache-results.json`; no credentials or response content are stored there. These measurements show that the repaired request path can reuse the live cache in this controlled scenario. They do not compare old/new code, explain every miss in the earlier 194-call sample, or measure changes in subscription quota windows.

Implementation: `packages/providers/src/openai-responses.ts`, `openai-codex-body.ts`, `openai-codex-request.ts`, `codex-websocket.ts`, `tool-format/to-responses.ts`, `prompt-cache-probe.ts`; Core request composition is in `packages/core/src/core/agent-response.ts`. Regression coverage is in `packages/providers/tests/openai-responses-cache.test.ts` and the existing Codex cache/WebSocket suites.

Validation on 2026-10-07: after the second round, the complete provider package plus CLI prefix test passed 1,690 tests in 113 files; one separate opt-in WebSocket live test was skipped. The second round's unchanged proofs and edge regressions passed 22 checks on three consecutive runs. Provider source typecheck, focused new-test typecheck, provider build, scoped Biome, documentation gates and `git diff --check` passed. Raw package-wide test typecheck reports errors in other fixtures; focused changed-file typecheck is clean. The full monorepo release matrix and representative task/quota A/B were not run.
