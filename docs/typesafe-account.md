# TypeSafe account

Shared credential, host and model for every System One feature. Two consume it
today: [skill suggestion](./skills-suggestion.md) and the
[dispatch classifier](./fleet-dispatch-classifier.md). Both are off by default,
and both keep working — differently — when there is no account.

```
wstack typesafe            what is configured, and whether anything works
wstack typesafe login      store a key in the active profile
wstack typesafe test       spend one question proving the key really works
```

## Why this is not a provider

TypeSafe's Jev returns a typed judgment, not tokens. It has no messages, no
streaming, no tools, no output tokens and no reasoning effort — none of the
`Provider` interface applies. Putting it in the provider catalog would leak
`jev-latest` into the model picker, the subagent lanes, the council voters and
the fallback chain, where selecting it would simply break a turn.

This is not a WrongStack-specific judgment call. OpenRouter — the universal
chat aggregator — does not list Jev in `GET /api/v1/models` either; it exposes
it behind a separate *Decisions* endpoint, because a typed-judgment model does
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
| `ready` | usable account | the feature runs, if its own switch is on |
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
default 3) and then disables TypeSafe for the process, saying so once. It never
trips on `429`/`529` (transient by the service's own documentation), on network
errors, or on `422` (a bad question is our bug, not a credential problem). One
success resets the count, so a key rotated mid-session recovers without a
restart.

## Cost

Jev bills input tokens only — $0.042 per million, output free. Every successful
response reports its usage through `onUsage`; hosts log it at debug and
`wstack typesafe test` prints the estimate for its single question. The estimate
is for display: a request routed through OpenRouter is billed by OpenRouter, and
neither host returns a price.

`wstack typesafe test` also prints the model id the service *reported*.
`jev-latest` is an alias and the version behind it moves — a threshold
calibrated against one version, in a trace that cannot name it, is silent drift.

## Adding a third consumer

Each consumer keeps **its own `enabled` switch** and **its own degraded path**.
Sharing a credential is not the same as wanting a behaviour, and what "running
without TypeSafe" means differs: the dispatch classifier falls back to the prose
classifier, the skill suggester emits no block at all.

There is deliberately no shared `isTypeSafeAvailable()` helper. It would be a
single `if` standing in for two different questions, and the second caller to
adopt it would get the first caller's answer.
