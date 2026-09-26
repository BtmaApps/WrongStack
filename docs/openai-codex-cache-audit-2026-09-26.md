# OpenAI Codex cache and token consumption audit

Date: 2026-09-26. WrongStack HEAD: `63a918164b7c081a924d6f60a7f17071d2d2893f`.
This audit covers the shared working tree, including other ongoing work, rather than HEAD alone. Original findings are preserved below; fixes implemented following the user's requests to continue are listed first. No inference requests were sent to a real account.

## Implemented fixes

### 2026-09-27: documented prefix order and measurement limits

- **Measured regression:** the probe counted instructions before tools. With unchanged tools and changed instructions, it reported 0 matching characters instead of the fixture's 17 tool characters. With changed tools and unchanged instructions, it incorrectly retained 3 instruction characters. Both regression assertions failed before the fix and passed afterwards.
- **Implemented:** local comparison now follows tools, instructions, then input. The exported `cacheablePrefixChars` field is retained for compatibility, with its documentation explicitly describing local character overlap. Neither a first local observation nor 100% local overlap proves a backend miss or hit. Test descriptions and provider comments now preserve that distinction.
- **Documentation review:** the official guide describes model-dependent breakpoints, retention, pricing, and key semantics. Shared text alone does not guarantee an eligible cached boundary. The source comments no longer claim that Responses universally lacks explicit breakpoints or that a cache key pins requests to one machine. This OAuth adapter still sends no unverified explicit cache controls. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).
- **Validation:** the initial focused run had 2 failures / 5 passes. After the fix, three focused files passed 41 tests. The complete provider and relevant CLI run passed **83 files / 1,307 tests**, with **1 file / 1 test skipped**, using `pnpm exec vitest run packages/providers/tests packages/cli/tests/codex-prompt-prefix-stability.test.ts packages/cli/tests/webui-server/setup-events.test.ts`. Biome and diff checks passed. Provider source typecheck initially encountered missing generated Core declarations; after the declarations became available, the unchanged typecheck command passed.
- **Remaining:** `WRONGSTACK_CODEX_ACCESS_TOKEN` was not set in this process, so no live inference or quota measurement was performed. This round fixes diagnostic accuracy; it does not establish additional token savings. The global architecture gate and full monorepo suite were not rerun.

### 2026-09-27: recovery from expired WebSocket continuation state

- `previous_response_not_found` and `websocket_connection_limit_reached` no longer immediately leave the session in SSE fallback mode. Before output starts, the affected connection is closed and the full input is sent once over a new WebSocket. Missing response state triggers this attempt only if `previous_response_id` was actually sent. A repeated state error follows the existing SSE fallback path; retries are bounded.
- Retry decisions use structured server error codes, not words in an error description. Partial output, cancellation, and `previous_response_not_found` appearing only in message text do not trigger reconnection.
- The diagnostic transport reason is recorded as `reconnect:<server-code>`. Recovery does not perform a separate prewarm; a successfully generated response marks the connection as warm, preventing a redundant `generate:false` request on the next turn.
- The live test now includes the first actual assistant response in the second request's history. It expects the second turn to send only the new user item and the first generated response's continuation ID. The previous test proved only that the first turn used the prewarm ID. This test remains opt-in and was not run against a real account in this round.

Source: OpenAI describes opening a new WebSocket and starting a fresh chain with full context, without `previous_response_id`, when connection state is missing or expired. No new API parameters were added to ChatGPT OAuth; the existing Codex body and headers were preserved. [Official WebSocket recovery guide](https://developers.openai.com/api/docs/guides/websocket-mode#reconnect-and-recover).

Validation: both positive recovery fixtures failed before the fix. Afterwards, each showed two sockets, zero HTTP calls, one recovery request with full context, and delta continuation on the next turn. Repeated failure, partial output, cancellation, misleading error text, and redundant second prewarm were also tested. The latest run passed **83 files / 1,307 tests, with 1 skipped test**. Provider and focused test typechecks, Biome, and diff checks passed. API snapshots are current. The global architecture gate still reports previous findings outside this scope; the full monorepo suite was not rerun in this round. These results do not measure live token or quota savings.

### Follow-up round: partial response replay and prewarm races

- An earlier answer in assistant content does not make a trailing partial reasoning block valid. The converter now checks for actual output or a tool call **after** the reasoning block. Complete reasoning is preserved; an unfinished trailing block is not sent to the backend.
- The JSON cache keyed only by mutable tool input object identity was removed. Changes to nested fields in the same object no longer send stale arguments. Raw backend JSON is still replayed only when it matches the current input.
- Prewarm could inspect the global `terminalSeen` flag and skip a failure at the end of the queue. It now reads the terminal event itself. Failed, incomplete, or cancelled responses are not accepted as continuation state. Cancellation immediately after prewarm also prevents the real model request. Prewarm remains disabled by default; this fix covers opt-in use.
- Eager `ReadableStream` pulls could start the inference watchdog during prewarm. A fixture with 100 ms of simulated prewarm and a 10 ms inference watchdog incorrectly triggered fallback. The stream is now created after prewarm, so the inference timeout is not consumed before its request starts.
- WebSocket types were extracted into the leaf module `codex-websocket-types.ts`, preserving existing import/export paths. No new file-size threshold violation was introduced.

Measurement: the initial two-file regression run had 7 failures and 18 passes; the additional watchdog fixture also failed before the fix. All 28 targeted tests passed afterwards. The subsequent provider and relevant CLI run passed **83 files / 1,301 tests, with 1 skipped test**: `pnpm exec vitest run packages/providers/tests packages/cli/tests/codex-prompt-prefix-stability.test.ts packages/cli/tests/webui-server/setup-events.test.ts`. Provider and focused test typechecks, Biome, and diff checks passed. API snapshots are current; the global architecture gate still reports findings from other work. An initial broad validation attempt ended with a Windows Ctrl+C exit; the counts above come from the completed rerun.

These results validate simulated transport and local behavior, not real-account cache hit rates or quota percentages. The full monorepo suite was not rerun in this round.

### Follow-up round: fallback, reasoning measurement, and validation blockers

- A WebSocket failure in one thread previously moved every thread in the provider to SSE. This was reproduced with a healthy sibling thread in the same provider. Fallback is now scoped to account/thread, with at most 64 entries. The affected thread avoids repeated failing WebSocket attempts while its healthy sibling can continue using WebSocket.
- `WRONGSTACK_CACHE_PROBE` usage records now include `reasoningOutputTokens` when supplied by the backend. This is a subset of `outputTokens` and must not be added to total cost again. Tests cover SSE and WebSocket, concurrent request ID correlation, zero values, and missing/invalid numbers. Missing values are not invented as zero. This telemetry is limited to the opt-in probe; no new reasoning total was added to the general UI.
- The earlier `setup-events` failure was fixed in the test data: the actual Brain event contract requires the emitter's session ID. The duplicate subscription check now uses a valid session, and a separate assertion verifies that events without a session ID are not broadcast.
- Pure request body conversion was extracted into `packages/providers/src/openai-codex-body.ts`. The architecture measurement decreased the provider class from 1,007 to 906 lines, resolving its growth finding. Only the Codex ratchet entry was updated using values from the official generated report; findings for other files were not accepted.
- The official snapshot generator was run and confirmed `Core API snapshots are current`. The global architecture gate still reports hotspot and test-only export findings from other work. This round does not establish a successful architecture release check.

Validation: `pnpm exec vitest run packages/providers/tests packages/cli/tests/webui-server/setup-events.test.ts packages/cli/tests/codex-prompt-prefix-stability.test.ts` passed **82 files / 1,289 tests, with 1 skipped test**. Provider source typecheck, focused provider test typecheck, Biome, and diff checks passed. The full-suite counts below are historical results from the preceding round; the full monorepo suite was not rerun in this round.

### Initial fix round

- **Measurement accuracy:** cache-write is now included in the probe total. Comparisons are separated by provider, account scope, model, thread, and relevant request settings. Concurrent requests are correlated with usage through request IDs; the generic cache key path without a session also matches. `matchingPrefixCharsPct` replaces `expectedHitPct` to describe character similarity only.
- **Transport diagnostics:** the opt-in probe records WebSocket full/delta decisions and the reasons `no-previous-response`, `request-settings-changed`, `history-shortened`, `history-changed`, and `prefix-match`. Sent and full input item counts share the same request ID; prompt and argument text are not logged.
- **Raw replay:** model tool arguments are preserved in `providerMeta` and survive JSON persistence. If raw JSON differs from the current tool input or is invalid, canonical input is used. Indented JSON and numeric representations such as `1e2` were tested through the actual parser/aggregation/WebSocket path. Older histories without raw metadata may safely fall back to full input.
- **Reasoning isolation:** reasoning replay rejection for one model/thread no longer disables replay for other threads or models. Remembered entries are bounded at 64.
- **Output control:** when the live catalog reports `support_verbosity: true`, the default is `low`; the adapter's `textVerbosity` option can override it. No parameter is added when support is unknown. When the catalog explicitly supports `none`, disabled reasoning sends `effort:none`; unsupported models are not forced to accept a new parameter.
- **Cache key:** long session IDs are converted to stable 64-character hashes, preventing collisions caused by truncating IDs with a shared long prefix.
- **Repeated live context:** fixed explanatory text was shortened and moved into the cacheable system section. Actual live values and the precedence of newer conversation content in conflicts were preserved. An initial regression against the small-prompt usage threshold was resolved by shortening the prose; the accounting validation threshold was not changed.

**Measured:** the audit fixture's live suffix decreased from 562–634 to 265–337 characters: 297 fewer repeated live characters per request, or 2,673 across nine requests. This is a character measurement, not a backend token or quota saving. Text moved into the fixed system section remains part of the model context.

With the final text, fixed `instructions` grew from 18,809 to 19,102 characters (+293). The live suffix shrank by 297 characters. Roughly half the repeated live suffix was relocated to the stable prefix; this did not remove half the total prompt. Actual backend token boundaries and cache hits still require measurement.

Fix validation: the final focused run passed 8 files / 141 tests; the provider package passed 80 files / 1,281 tests (1 skipped); WebUI passed 418 files / 5,646 tests. Core/provider source typechecks, focused typechecks for changed provider tests, and Biome passed. The raw package-wide test typecheck reported older fixture/type errors outside this scope; a fully passing typecheck is not claimed. The architecture check stopped because `architecture/core-public-api-snapshot.json`, already modified in the shared working tree, was stale. At that stage, snapshots belonging to other work were not regenerated on behalf of this change.

The root `pnpm test` run completed in 742 seconds: 3,351 files / 47,946 tests passed; 3 tests failed; 55 were skipped and 1 was marked todo. During the run, a provider loaded before the final reasoning fix conflicted with two new expectations. After completion, the failing files were rerun against current code: all 12 Codex regression tests passed; only the subscription/broadcast expectation at `packages/cli/tests/webui-server/setup-events.test.ts:91` remained failing (13 passes / 1 failure across 2 files). That file had not been changed as part of the cache work at that stage. Because the root run failed, the `pnpm test` chain did not reach WebUI; the 5,646 WebUI tests above came from a separate `pnpm --filter webui test` run. This does not establish successful full release validation.

**Preserved boundary:** changing live state was not blindly appended to durable history. Consequently, WebSocket delta remains 0/8 in the controlled scenario with a live suffix; sending full input preserves correct context. Full input does not imply that the entire backend prompt cache misses. Accumulating all historical live snapshots risks token growth and stale state; prefix equality checks were not relaxed.

**Remaining measurement:** real-account A/B testing and quota impact. The reasoning breakdown is now available in the probe, but no live-account savings are claimed.

## Conclusion

WrongStack already implements the basic cache mechanisms. The clearest gaps identified in the initial audit were repeated live context, imperfect preservation of server output, output/reasoning controls, and diagnostic measurements. Adding a cache key or TTL alone does not resolve them.

Token counts, cache discounts, JSON bytes sent over the network, and subscription quota are different metrics. WebSocket delta reduces transport volume; it does not make previous context free. OpenAI explicitly documents this for the Responses API. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state#passing-context-from-the-previous-response).

Codex credit pricing discounts cached input and has no separate cache-write charge. API key pricing is different. Credit rates alone do not determine included subscription usage limits. API cache-write multipliers or dollar estimates therefore should not be applied directly to ChatGPT OAuth quota. [Codex pricing](https://learn.chatgpt.com/docs/pricing#token-rates).

## Pipeline at the time of the initial audit

| Stage | WrongStack behavior | Assessment |
|---|---|---|
| System prompt | `agent-response.ts` freezes the prompt epoch and moves plan, contributor, glossary, and peers content to the end | Preserves stable context at the beginning |
| Live context | Ledger, continuity, nextsteps, and memory evidence are appended to each request, without being persisted in history | Preserves the earlier prefix but breaks exact append-only replay |
| Tool schemas | `toolsToResponses` sorts by name and caches compact definitions and array conversion in WeakMaps | Stable ordering; actual tool additions/removals still change the prefix |
| Lazy tools | `listForProvider`, `tool_search`/`tool_use`, and MCP gateway paths exist | Foundation for reducing schema cost while keeping tools accessible |
| Cache identity | Root `sessionId` is the cache key; separate `threadId` controls routing and connection identity | Sibling connections and turn state are isolated |
| Reasoning replay | Requests `reasoning.encrypted_content` and carries it into subsequent requests through provider metadata | Required infrastructure exists; rejection originally disabled replay across the provider instance |
| Transport | Real fetch uses WebSocket by default; matching prefixes use `previous_response_id`; errors before output fall back to SSE | Continuation correctness is protected, with actual Agent efficiency discussed below |
| Prewarm | Supported, disabled by default | Not the primary token savings mechanism |
| Compaction | History cleanup is gated by pressure thresholds and growth intervals | Avoid returning to history pruning on every tool turn |
| Token accounting | Stream parser separates input/read/write; the ledger tracks cumulative and last-request ratios | Main accounting and the diagnostic probe differ in accuracy |
| Local caches | Tool conversion, prompt epoch, model catalog, and OAuth refresh coordination | Reduce CPU/network work, without directly discounting model tokens |

Relevant sources: `packages/core/src/core/agent-response.ts`, `packages/providers/src/openai-codex.ts`, `packages/providers/src/codex-websocket.ts`, `packages/providers/src/tool-format/to-responses.ts`, `packages/core/src/execution/auto-compaction-middleware.ts`, `packages/core/src/infrastructure/provider-cache-ledger.ts`.

## Findings confirmed during the initial audit

### 1. Live context breaks WebSocket continuation

`composeRequestMessages` adds live context to the last message. In the next request, that previous message no longer has its live additions; the new live context appears later. However, `prepareRequestBody` requires the previous full input plus server output to remain an unchanged prefix. This condition is not met.

An experiment using the actual Agent, prompt builder, and Codex body conversion with a simulated WebSocket measured 3 user turns / 9 model requests:

| Controlled condition | Total requests | Delta requests |
|---|---:|---:|
| Existing live context | 9 | 0 |
| Live context removed for the experiment only | 9 | 8 |
| Live context removed; server tool arguments use indented JSON | 9 | 2 |

The first request is not expected to use delta. This experiment does not measure backend cache hit rates or actual quota savings. Removing live context is not recommended as a production solution because it can lose guidance and memory.

Recommendation: move fixed instructions into the stable prompt and generate only changing state in live content. Then evaluate a Codex replay design that preserves sent context exactly and appends changes as new items. Historical state accumulation, compaction, resume, and model changes must be considered together. Relaxing prefix checks to attach different context to an old response is incorrect.

### 2. Reserializing tool arguments can also break continuation

The server returns `arguments` as a raw string. The stream parser converts it into an object, and `to-responses.ts` runs `JSON.stringify` again. The new string can differ from the raw argument string retained by the WebSocket. Identical JSON values with different whitespace can break the continuation condition.

In the third experiment above, six tool responses with indented JSON reduced delta requests from eight to two even with live context removed. This transport behavior was verified; the frequency of such server JSON in real-account traffic was not measured.

Recommendation: preserve provider-specific raw replay fields separately from canonical, validated tool input. Runtime tool validation should continue using the object. Add resume/persistence tests for raw arguments, reasoning, and assistant item boundaries. Do not blindly forward raw metadata across providers.

### 3. The cache probe can report incorrect ratios and comparisons

`prompt-cache-probe.ts:recordCacheProbeUsage` sums only `input + cacheRead`, although the stream parser already separates cache-write from `input`.

Controlled fixture: input=100, cacheRead=600, cacheWrite=300. The actual total is 1,000 and the hit rate is 60%. The probe reports a total of 700 and a rate of 86%. This is a probe bug; the main `ProviderCacheLedger` does not make the same error. The absence of a separate write fee in Codex credit pricing does not justify dropping a field from token telemetry. Which models expose this field on the live endpoint still needs verification.

Other issues:

- Previous fingerprints are stored by `sessionKey` alone, allowing sibling threads under one root to be compared against each other.
- Fingerprint identity omits model/provider changes. A fixture changing the model with the same key and text reported `100% expectedHitPct`.
- Without a session, the body's generic cache key may not match `no-session` in usage records.
- `expectedHitPct` is derived from JSON characters and knows nothing about the tokenizer, hidden server prompt, model settings, actual cache boundaries, or TTL. It should not be presented as a backend hit prediction.

Recommendation: correlate requests and usage by request ID; compare within provider/account/model/thread scope; include cache-write in the denominator; distinguish character similarity from actual token hit rates by name. Add WebSocket full/delta/fallback counters and reasons for full input.

### 4. Output and reasoning savings lack sufficient controls

`openai-codex.ts:buildBody` does not send `text.verbosity`, and model policy does not carry `support_verbosity/default_verbosity`. Pi's inspected Codex body builder defaults to `low`. Official Codex checks model support and uses the configured setting or catalog default.

When `reasoning.enabled=false` or `effort=none`, WrongStack omits the reasoning field, as confirmed by the existing test. Omitting the field is not the same contract as explicitly sending `effort:none` to a supported model; it may use the backend default. Live behavior has not been measured. Pi uses explicit `none` or model-specific mapping according to support.

`output_tokens_details.reasoning_tokens` is not tracked separately. Total output is available, but the potentially reducible reasoning share is not visible. Measure this breakdown first. Reducing reasoning across all tasks can increase failed attempts and retries.

Recommendation: check model capability for verbosity, honor explicit user choices, verify support for `none`, and record reasoning tokens separately. Do not add `max_output_tokens`, which the ChatGPT route does not accept, as a supposed budget solution.

### 5. Repeated live instructions contain directly reducible input

The fixed `LIVE_CONTEXT_HEADER` explanation, lengthy static nextsteps gate rules, and continuity explanation are appended again on each request. `buildConversationContinuityBlock` also copies recent user messages already present in history, with a selected-text budget of up to 3,600 characters.

The small audit fixture's live suffix alone is 562–634 characters per request. It uses two simulated tools and should not be interpreted as a production session's prompt size or tokenizer result. The combined size of actual leader, ledger, plan, and memory content requires separate measurement.

Recommendation: explain fixed rules once and leave short state fields at the end. Tie continuity repetition to needs such as long tool chains or compaction, and compare task consistency. Use relevance and per-source budgets for memory retrieval; avoid blindly cutting text and losing important information.

## Comparison with official Codex, Pi, and OpenCode

Upstream commits observed during the audit: Codex `1a89aec960cd92e2c59ce49b7f3c3347a915e4a9`, Pi `2b0a123de98318c2ff8069661721ce0c3794c34e`, and OpenCode dev `a42f393c850bec0c0f395fb91bf19b1ee8b31666`. Sources were downloaded from the relevant branches; upstream behavior can change between versions. Pi's former `badlogic/pi-mono` address redirects to `earendil-works/pi`.

| Application | Inspected approach | Implication for WrongStack |
|---|---|---|
| Official Codex Rust | Stable cache key, model-supported verbosity, encrypted reasoning, exact-prefix WebSocket continuation, and continuation tracing | Our basic protocol is similar; exact replay and diagnostics need improvement |
| Pi | Session cache key, low verbosity, model-specific reasoning mapping, full/delta/fallback counters, and transcript tools on supported models | Output control and transport observability are useful; verify feature support |
| OpenCode | Session cache key, low verbosity on suitable GPT models, encrypted reasoning, opt-in WebSocket, and pruning of old tool output | Do not copy pruning directly; preserve our cache pressure gates |

Sources: [Codex client.rs](https://github.com/openai/codex/blob/1a89aec960cd92e2c59ce49b7f3c3347a915e4a9/codex-rs/core/src/client.rs), [Pi Codex Responses](https://github.com/earendil-works/pi/blob/2b0a123de98318c2ff8069661721ce0c3794c34e/packages/ai/src/api/openai-codex-responses.ts), [OpenCode transform](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/provider/transform.ts), [OpenCode Codex plugin](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/plugin/openai/codex.ts), [OpenCode compaction](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/session/compaction.ts).

OpenCode's pruning code protects the latest 40,000 tool tokens and marks older output when at least 20,000 tokens can be removed; skill output is protected. These are not recommended fixed thresholds for WrongStack. WrongStack already limits history rewrites using pressure and growth intervals.

## Implementation order and acceptance criteria

The following sequence records the original recommendations; completed work is described above.

1. **Measurement accuracy:** fix probe and transport counters. Test the 1,000/60% example above, two threads, model changes, and generic key matching.
2. **Unnecessary repetition:** move fixed live-context explanations and shrink repeated state. Reduce uncached input per request and total input per task while preserving task success.
3. **Output budget:** use low verbosity and appropriate reasoning on supported models. Compare output/reasoning and retries together per completed task.
4. **Replay:** preserve raw tool arguments and item boundaries; test append-only live state under controlled conditions. Target all 8/8 continuation opportunities in the no-tail control and the same result in the whitespace fixture. Scenarios with actual state must not lose information.
5. **Real-account A/B:** use the same model/account/effort/tool list across cold starts, warm tool chains, resume, compaction, tool activation, and sibling threads. Do not promise percentages from one short conversation.

Track per task: uncached input, cache read, cache write when available, output, reasoning, retries, compaction calls, bytes sent, full/delta counts, time to first token, and task success rate. Report quota-window changes separately.

API cache behavior varies by model family; newer models have explicit breakpoint and paid cache-write options. These documents do not establish that the ChatGPT OAuth endpoint accepts the same parameters. Add TTL or explicit cache settings only after route-specific verification. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Initial audit validation and limitations

- Five existing test files / 50 tests passed: `openai-codex-cache`, `codex-websocket`, `prompt-cache-probe`, CLI `codex-prompt-prefix-stability`, and Core `prompt-cache-prefix-stability`.
- Five additional audit fixture tests passed, with results shown in the table above. They characterize the original behavior rather than verify fixes.
- Reproduction command used: `pnpm exec vitest run --config .temp_files/codex-cache-audit/audit.config.ts .temp_files/codex-cache-audit/audit.test.ts --silent=false --reporter=verbose`.
- Audit source copies and fixtures were created under `.temp_files/codex-cache-audit/` as local, untracked investigation material.
- The initial temporary Vitest configuration merge accidentally expanded the scope; the run was stopped and the scope corrected. That run showed a failure in the `skill-loader-extra.test.ts` file-stamp cache test, which was not investigated as part of this audit. A passing full suite is not claimed.
- Real backend cache hits, reasoning consumption, quota changes, and net savings percentages were not measured in this work. Live measurements from previous sessions were not presented as results of this audit.
