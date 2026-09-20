# TypeSafe account

Shared credential, host and model for every System One feature. Manage the
account in **WebUI → Settings → Jev** or with **`/jev` in the TUI**. The
[settings and activity guide](./jev-settings-and-activity.md) covers feature
switches, connection tests and the live debug log.

Brain, memory triage/recall, topic changes, compaction, Kanban verification,
model tier selection and semantic lint allow judgments by default when an
account is configured. [Skill suggestion](./skills-suggestion.md) and the
[dispatch classifier](./fleet-dispatch-classifier.md) are separately opt-in.
Each consumer keeps its fallback when a judgment is unavailable.

```
wstack typesafe            inspect configuration (no network test)
wstack typesafe login      store a key in the active profile
wstack typesafe test       spend one question proving the key really works
```

## Why Jev is separate from chat providers

TypeSafe's Jev returns a typed judgment, not tokens. It has no messages, no
streaming chat, no tool execution and no reasoning effort — none of the
`Provider` interface applies. Putting it in the provider catalog would leak
`jev-latest` into the model picker, the subagent lanes, the council voters and
the fallback chain, where selecting it would simply break a turn.

OpenRouter exposes Jev through a separate *Decisions* endpoint, because a typed-judgment model does
not fit `/v1/chat/completions` there any better than it fits `Provider` here.

## Routes

Two hosts accept the identical `{state, questions, model}` body:

| Route | Endpoint | Model | Key |
|---|---|---|---|
| `typesafe` | `api.typesafe.ai/v1/systemone` | `jev-latest` | `TYPESAFE_API_KEY` |
| `openrouter` | `openrouter.ai/api/alpha/decisions` | `~typesafe/jev-latest` | `OPENROUTER_API_KEY` |
| `custom` | `typesafe.endpoint` | `jev-latest` | `TYPESAFE_API_KEY` |

Leave `typesafe.route` unset and it is inferred: an explicit `endpoint` means
`custom`, a configured `apiKey` means `typesafe`, and otherwise the route is
`typesafe` — **only `TYPESAFE_API_KEY` is ever picked up from the environment
without being asked for**. An `OPENROUTER_API_KEY` is nearly always there for
chat; inferring the OpenRouter route from it would send prompts to a host, and
bill a key, the user never chose for this feature. To use OpenRouter, set
`typesafe.route: "openrouter"` explicitly.

OpenRouter's Decisions endpoint is still on its `/api/alpha/` path and
OpenRouter warns it may move; that is why it is a table entry with a config
override rather than a constant in the client.

```sh
wstack typesafe login --route typesafe
# Or use an OpenRouter key, billed to OpenRouter:
wstack typesafe login --route openrouter
# Optional fixed OpenRouter version:
wstack typesafe login --route openrouter --model typesafe/jev-1.13
# A proxy needs its complete evaluation URL:
wstack typesafe login --route custom --endpoint https://proxy.example/v1/systemone
wstack typesafe test
```

The key is entered through a hidden prompt. Switching routes clears the old
endpoint and model; explicit `--endpoint` and `--model` replace them. Rotating
a key without changing routes preserves those settings. Custom endpoints must
be HTTP(S) URLs without embedded credentials or fragments.

Native authentication is a Bearer API key from the
[TypeSafe console](https://console.typesafe.ai/keys), not a chat-provider OAuth
login. OpenRouter uses its own Bearer API key. The configured `typesafe.apiKey`
takes precedence over the selected route's environment variable. Existing
OpenRouter chat auth-profile keys are not automatically borrowed: store the
chosen key here or use `OPENROUTER_API_KEY` with the explicit OpenRouter route.

Both features remain off after login. Enable the desired switches in the active
user profile, then restart the session/server that loaded that configuration:

```json
{
  "skills": { "suggest": { "enabled": true } },
  "fleet": { "dispatch": { "typesafeClassifier": true } }
}
```

## Where it runs

| Consumer | Surfaces | Calls and limits | Effect |
|---|---|---|---|
| Skill suggestion | Shared CLI/TUI request pipeline and WebUI server pipeline | 0–2 evaluations per distinct latest user text, cached per session across tool iterations; 3s combined deadline | Optional skill relevance hint; does not load/install a skill or force its use |
| Fleet dispatch | CLI/TUI `/delegate`, `/fleet dispatch`, and the fleet host's classifier callback | One evaluation containing Choice + Noul when the keyword heuristic is ambiguous; 4s total timeout | Selects an eligible role or declines to heuristic/generalist routing |
| `brain` | Brain ladder (CLI + WebUI), option-bearing requests below the council floor | Choice + "decidable" (concrete evidence) Noul, 4s | Settles only confident, evidence-backed decisions (conf ≥ 0.75, p ≥ 0.7, decidable ≥ 0.4); else the LLM tier runs as before. Tier `system-one` in traces |
| `memoryTriage` | `/memory triage`, post-session auto-triage | One Score per gray-zone memory (8 in parallel) and per merge pair | Decisive rating/verdict skips the LLM call; a YES merge needs p ≥ 0.8; the rest go to the LLM |
| `topicShift` | TUI + WebUI prompt submit, only after the local gate found low continuity | One Noul, ≤ 4s | ≥ 0.8 suggests a new context, ≤ 0.3 keeps it; the ambiguous middle goes to the provider classifier |
| `memoryRecall` | SAGE turn-context injection (itself opt-in) | One request per user message, one Noul per surviving candidate, 1.5s, cached across tool iterations | Can only DROP candidates (< 0.2); failure drops nothing |
| `compaction` | `selective` compaction strategy only | One Score per middle turn, chunks of 40, 8s | Keeps tail + opening turn, packs rated turns into the budget in code; any failure hands off to the LLM selector |
| `kanbanVerify` | `agent` checks in Kanban verification (process-wide hook) | One Noul per check over the task diff (≤ 24k chars), 8s | ≥ 0.92 passed, ≤ 0.08 failed, else the escalation stays open (skipped). Never re-judges a status a person set |
| `modelTier` | `delegate` with no tier/model and no role/phase tier route | One Choice over `modelTiers` levels, 3s | Confident pick (≥ 0.6) becomes the spawn tier; budgets/ceilings apply as for any tier |
| `semanticLint` | `wstack typesafe lint-conventions` (explicit command) | One Noul per regex candidate in the diff's added lines, 32 per request | Reports judged violations (≥ 0.7, `--threshold`); rules: built-in + `.wrongstack/semantic-lint.json` |
| `tool` | Agent calls `jev` when a structured judgment would help | Supplied JSON state and typed Noul/Choice/Score questions, using the account timeout | Returns validated answers, model and usage; errors leave the calling model to reason or use another tool. `jev_status` checks local availability without a request |

Each HTTP evaluation permits two attempts by default for transient errors.
Short requests (under 12 characters), small skill rosters, and confident
heuristic dispatches avoid calls. It is not wired into council voting,
approvals/permissions, every tool call, or normal chat generation. There is no
chat-model entry for Jev; configure its decision account in **Settings → Jev**
or with the CLI account commands.

## Judgments: on with an account, always with a fallback

The nine judgment features above (`typesafe.judgments.<id>`) differ from the
two original consumers in one way: they are **on whenever an account resolves
`ready`**, and `typesafe.judgments.<id>: false` turns one off. A TypeSafe key
exists for nothing else. Automatic judgments sit in front of existing paths;
the `tool` feature lets the calling model request a judgment explicitly and
handle failures itself. `wstack typesafe status` lists them.

`wstack typesafe check-judgments` runs every judgment on a few cases whose
right answer is not in doubt, against the live host, through the features' own
question builders. Run it after the `jev-latest` alias moves: a failure means a
question or threshold drifted, not that a hard case was hard. First run
(2026-09-19, jev-1.13.0): 15/15, 250–830ms per case, Turkish topic prompt
included.

`wstack typesafe replay-brain-ledger` replays this project's past BrainMonitor
decisions (file churn, tool-failure streak, stall, error storm — rebuilt from
`brain-ledger.jsonl`) through the Brain tier's questions and compares Jev with
what the council/policy recorded. First run (90 decisions, jev-1.13.0): Jev
picked "steer" on every case with p ≈ 0.98, while the council chose
"continue" on 35% of file-churn signals. The fix was not a probability
threshold but the "decidable" Noul, reworded to ask for concrete evidence
beyond the counts that raised the question: signal-only questions now score
0.05–0.13, an evidence-bearing request ~0.56, so `minDecidable` is 0.4 and
signal-only decisions go to the council/LLM. The same ledger shows 469 of 473
file-churn steers were followed by the same signal within minutes.

`wstack typesafe replay-memory-triage` opens the project's SAGE database
read-only, takes the Phase 1–2 gray zone as `/memory triage` would, and rates a
sample with Jev and with the configured LLM (same prompt and parser). First run
(2026-09-19, 40 of 3,456 gray-zone memories, hand-labelled as a third
reference): Jev 18/40 exact, 35/40 within one level, **never** rated a
keep-worthy memory as archivable; glm-5.3-flash 11/40 exact and would have
proposed archiving 7 durable rules. Jev errs optimistic (a few work logs rated
"useful"). Choice confidence did not separate right from wrong, so the
threshold stays at 0.55 and the level texts were sharpened instead.

The same run found that `/memory triage` sent the LLM `maxTokens: 60`: a
reasoning model spent it thinking and replied with nothing on every memory, so
Phase 3 rated nothing and Phase 4 read every pair as "NO". The budget is now
2,000, and an empty merge reply counts as an error instead of a verdict.

`wstack typesafe replay-topic-shift` rebuilds the conversation at each user
prompt from the session journals and replays the prompts that pass the
advisor's local gate through Jev alone and through the provider alone. First
run (30 gated prompts of 162, 2026-09-19): Jev answered all 30 — 22 decisive
"same topic", all correct by inspection, 8 left to the provider — and never
raised a false "new topic". The provider path (glm-5.3-flash) answered only
10/30 with its production request (`maxTokens: 180`, reasoning on): 9 empty
replies, 8 truncated JSON, 3 timeouts. With 1,024 tokens, JSON on the wire and
reasoning disabled it answers 30/30, agreeing with every decisive Jev call.

All of them share one client per (endpoint, model, credential) through
`resolveTypeSafeJudge`, so the auth breaker and the rest gate see every
feature's evidence. Every judgment treats any throw — resting, revoked,
timeout, malformed answer — as "take the fallback".

Malformed or incomplete answers do not supply a decision. A failed or timed-out
skill evaluation adds no relevance block; a valid negative evaluation can still
say no skill fits. Status only checks configuration; `test` proves the selected
host accepted the credential and answered a typed question.

## The credential

`typesafe.apiKey` is the normal place. The **field name is load-bearing**:
`isSecretField('apiKey')` is true, so the config walker encrypts it with the
profile's `SecretVault` on write (`enc:v1:…` on disk) and decrypts it on load.
Renaming the field would silently store the key in plaintext;
`config-secrets.test.ts` pins this.

`typesafe` is on the **in-project config denylist**. A repo-committed
`endpoint` or `route` would redirect every prompt this agent sees to a host the
repository chose.

## Three states, not two

`resolveTypeSafeAccount` reports which situation this is, because two of them
call for opposite behaviour:

| State | Meaning | What a host does |
|---|---|---|
| `unconfigured` | no credential anywhere | **Nothing.** The user did not ask for this |
| `ready` | locally resolvable account; key not yet tested | the feature attempts calls if its own switch is on |
| `unusable` | e.g. `route: custom` with no `endpoint` | warn once |

A feature that is switched **on** and cannot run warns once per process, at
warn level, naming the switch. It used to log at debug, which in practice was
silence: a flipped switch did nothing and nothing said why. Once — not per
construction — because the request pipeline is rebuilt per session and a daemon
would bury the signal in its own log.

`wstack doctor` reports the same condition from config, which is where someone
actually looks when they wonder why a switch did nothing. It is never
auto-fixed: turning the feature off would discard a deliberate choice, and
nothing can invent a credential.

## Revoked keys

The client does not retry a 401/403 — they fail identically every time. But
that is per request, and these features run per turn: a revoked key would buy a
rejected request, and its latency, on every turn forever, invisibly.

A breaker counts **consecutive** auth rejections (`typesafe.authFailureLimit`,
default 3) and then disables that client instance, saying so once. It never
trips on `429`/`529` (transient by the service's own documentation), on network
errors, or on `422` (a bad question is our bug, not a credential problem). One
success resets the count before the breaker opens. After it opens, recreate the
client/session after fixing the credential. Other sessions and consumers have
their own clients; this is not a process-global credential circuit breaker.

## Resting (429 / 5xx / timeouts)

The auth breaker deliberately ignores load. The rest gate (`rest.ts`) covers
it: a 429/529 counts double, a 5xx/408/timeout/network error counts once, and
at weight 2 the host **rests** — every client of that endpoint + credential
skips the network and throws `TypeSafeRestingError` immediately, so features
fall back without paying a timeout. First rest 30s; each failed probe after a
rest doubles it, capped at 10 minutes; one success resets it. 401/403/422 and
caller aborts never count. The gate is process-wide (rate limits are per
account); `wstack typesafe test` bypasses it so it always asks the host now.

## Cost

Jev bills input tokens only — $0.042 per million, output free. Every successful
response reports its usage through `onUsage`; hosts log it at debug and
`wstack typesafe test` prints the estimate for its single question. The estimate
is for display: a request routed through OpenRouter is billed by OpenRouter, and
neither host returns a price.

`wstack typesafe test` also prints the model id the service *reported*.
`jev-latest` is an alias and the version behind it moves — a threshold
calibrated against one version, in a trace that cannot name it, is silent drift.

## Adding a consumer

Each consumer keeps **its own switch** and **its own degraded path**.
Sharing a credential is not the same as wanting a behaviour, and what "running
without TypeSafe" means differs: the dispatch classifier falls back to the prose
classifier, the skill suggester emits no block at all.

Upstream references, checked 2026-09-18: [HTTP API](https://docs.typesafe.ai/api),
[independent typed questions](https://docs.typesafe.ai/introduction),
[OpenRouter Jev alias](https://openrouter.ai/~typesafe/jev-latest), and
[pinned Jev 1.13](https://openrouter.ai/typesafe/jev-1.13).

There is deliberately no shared `isTypeSafeAvailable()` helper. It would be a
single `if` standing in for two different questions, and the second caller to
adopt it would get the first caller's answer.
