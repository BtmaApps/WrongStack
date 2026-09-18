# TypeSafe / Jev integration audit — 2026-09-18

## Current scope (read in code)

Jev is an auxiliary typed decision service. It does not generate code, run tools,
replace the main model, approve actions or vote in the council. Two consumers
share the route and credential resolver:

1. `skills.suggest.enabled`: CLI/TUI and WebUI request middleware. One wide
   ranking/gate request, optionally one shortlist request; a maximum 3-second
   combined deadline by default. Results are cached per session and latest user
   text through the tool loop. The result is advisory and does not load a skill.
2. `fleet.dispatch.typesafeClassifier`: CLI/TUI dispatch commands and the fleet
   host callback. Only ambiguous heuristic results reach Jev; one request asks
   both a role Choice and an applicability Noul. Default total timeout is 4s.
   Unconfigured accounts use the chat classifier; runtime errors or a decline
   return to heuristic/generalist routing.

Both are off by default and are excluded from repository-controlled settings.
Transport may retry transient failures once, within a consumer's total deadline.
Score is supported by the shared client but is not used by either live consumer.

## Authentication (read in code and upstream reference)

| Route | Authentication | Default model | Endpoint |
|---|---|---|---|
| Native | TypeSafe Bearer API key | `jev-latest` | `https://api.typesafe.ai/v1/systemone` |
| OpenRouter | OpenRouter Bearer API key | `~typesafe/jev-latest` | `https://openrouter.ai/api/alpha/decisions` |
| Custom | Configured key or `TYPESAFE_API_KEY` | `jev-latest` | Explicit full URL |

`typesafe.apiKey` is stored with the existing vault-aware profile writer and
takes precedence over the selected route's environment variable. OpenRouter
requires an explicit route. Chat auth-profile keys are not implicitly reused.
There is no native TypeSafe OAuth flow or dedicated WebUI auth panel.
Status is configuration inspection; the test command makes an actual API call.

The default local profile inspected during this audit had no TypeSafe credential
or feature switches enabled. Neither environment variable was present in the
agent process. No credentials, profile settings or user activation choices were
changed, and no live paid evaluation was performed.

## Repairs and regression evidence

The first four groups below were reproduced as failing tests before repair.

- **Independent questions lacked context:** the fleet applicability Noul could
  not see the candidate list held only in the Choice question. Candidate
  descriptions now also travel in shared state.
- **Route switching reused stale settings:** logging into OpenRouter after a
  custom route retained the old host/model. An explicit route change now clears
  them, with optional `--endpoint` and `--model` overrides. Rotation within a
  route preserves settings. Invalid custom endpoints fail before asking for a
  key or claiming the account is ready.
- **Malformed data became decisions:** out-of-range probabilities were clamped
  to valid values; empty, contradictory or invalid Choice distributions were
  accepted. They are now discarded. Cancellation during retry backoff stops a
  subsequent HTTP attempt and removes the abort listener.
- **Unavailable suggestions became negative advice:** failed evaluations added
  “no skill applies” to the model prompt. Middleware now consumes the existing
  trace to distinguish completed negative decisions from unavailable results.
  The deadline also releases the turn if a loader ignores cancellation. Partial
  gates and missing winner-fit answers are rejected, rather than changing the
  averaging denominator or borrowing another candidate's score.
- **Documentation drift:** corrected key precedence, client-scoped circuit
  breaker behavior, catalog-wide dispatch fallback, setup examples, model
  pinning, and the stale transport source path. Added README discovery.

Thresholds and the Choice/shortlist-fit policy remain unchanged. This audit does
not claim that a higher confidence value guarantees a better decision.

## Effectiveness and remaining evidence

The existing [skill evaluation notes](./skills-suggestion.md) record a
2026-09-17, 53-case evaluation on a 46-skill roster: 81% correct among 37 covered
cases, 8% wrong suggestions, 11% missed, and 13% needless suggestions among 16
uncovered cases at default thresholds. These are historical repository results,
not reproduced by this audit; the skill roster and descriptions have since been
edited. They do not measure whether the main agent actually followed the advice
or completed the user's task more accurately.

Current latency, decision accuracy and English/Turkish parity need a fresh
labeled evaluation with the selected route and a recorded model version. The
existing `wstack skill-suggest --eval <cases.jsonl> --sweep` supports that. Fleet
thresholds likewise require task/role examples; test fixtures establish routing
contracts rather than model quality. Do not lower thresholds based only on the
old roster's result.

There is no live Jev integration in Brain, permission policy, council voting,
memory reranking or per-tool selection. Adding those requires an independent
consumer, activation switch, fallback and domain-specific evaluation. The
existing two consumers are the concrete useful deployment scope today.

## Validation

- Focused integration/regression run: 12 files, 174 tests passed.
- Core and CLI `tsc --noEmit --incremental false`: passed.
- `node scripts/check-test-typecheck.mjs`: passed, zero new diagnostics against
  the repository baseline (pre-existing fixture diagnostics remain).
- Full `pnpm test`: result recorded below when complete.
- Live API calls, live UI interaction, packaging/release checks and installed
  service rebuild/restart were not performed.

## Upstream sources

- [Introduction and independent questions](https://docs.typesafe.ai/introduction)
- [HTTP API and Bearer authentication](https://docs.typesafe.ai/api)
- [Score semantics](https://docs.typesafe.ai/primitives/score)
- [OpenRouter latest alias](https://openrouter.ai/~typesafe/jev-latest)
- [OpenRouter Jev 1.13](https://openrouter.ai/typesafe/jev-1.13)

Checked 2026-09-18. OpenRouter's alpha endpoint and moving aliases should be
rechecked when upgrading; an explicitly pinned model can be set at login.
