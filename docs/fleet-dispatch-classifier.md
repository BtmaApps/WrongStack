# Dispatch classifier (TypeSafe)

**Off by default.** Turning it on sends ambiguous task descriptions to a
third-party API. See [What leaves the machine](#what-leaves-the-machine).

## Where this sits

`dispatchAgent` routes a free-form task to one of the ~75 catalog roles in two
stages:

1. **Keyword heuristic** — scores each role's `capability.keywords` against the
   task. Deterministic, instant, no network. Settles most dispatches.
2. **Classifier** — runs only when the heuristic is *ambiguous*: confidence
   under `0.4`, or no keyword hit at all.

Nothing here changes stage 1. This replaces what stage 2 does, on the minority
of dispatches that reach it.

That minority is precisely the interesting case. The dispatcher's own comment
says why: an ambiguous task is "exactly when two siblings share vocabulary and a
summary alone cannot separate them" — `security-auditor` against
`security-architect`, `test-engineer` against `qa-analyst`. Reading what each
one actually does is the whole job.

## What changes

The existing classifier (`makeLLMClassifier`) renders a prompt template, asks
the session provider for prose with a 15s timeout, pulls the first `{...}` out
with a regex, `safeParse`s it, checks `role` is a string, and checks that string
is one of the candidates. Five places to fail, and a malformed reply is
indistinguishable from "I don't know".

`makeTypeSafeDispatchClassifier` asks one `Choice` over the candidate roles —
criteria are each role's `summary`, plus its `capability.rationale
.differentiatesFrom` contrast line where it has one. A Choice cannot return a
role that was not offered, so all five failure points collapse into one typed
answer.

Two things the prose path could not do at all:

**Decline honestly.** The `DispatchClassifier` contract has always allowed
returning `null`, but a model asked to pick one of six always picks one of six —
the only way to decline was to emit something unparseable. A `Noul` asks whether
*any* candidate genuinely suits the task rather than merely being closest, so
declining is a first-class answer. On a decline the dispatcher falls back to its
own routing (best heuristic guess, else the generalist `executor`), which is a
better answer for a task no specialist covers than a specialist chosen because
it was nearest.

**Report real confidence.** `dispatchAgent` recorded `confidence: 1` for every
LLM pick, because parsed JSON carries no certainty. `DispatchClassifier` now has
an optional `confidence` in its return; a Choice fills it from its distribution,
so a near-tie between two siblings reaches `DispatchResult.confidence` as the
near-tie it is. `makeLLMClassifier` omits it and keeps the historical `1` —
"no number" is the only honest answer there.

## Enabling it

```jsonc
// ~/.wrongstack/profiles/<name>/config.json
{
  "typesafe": { "apiKey": "..." },   // encrypted at rest; or TYPESAFE_API_KEY
  "fleet": {
    "dispatch": { "typesafeClassifier": true }
  }
}
```

`typesafe` is the same shared account the [skill suggester](./skills-suggestion.md)
uses, and `apiKey` is vault-encrypted on disk like any other credential.
Configuring the account turns nothing on by itself.

### Settings

`fleet.dispatch`:

| Field | Default | Description |
|---|---|---|
| `typesafeClassifier` | `false` | Use the typed classifier instead of the prose one. |
| `fitThreshold` | `0.35` | Decline when "does any candidate genuinely fit" lands below this. |
| `minConfidence` | `0.2` | Decline when the Choice's own confidence is below this. |

`minConfidence` is deliberately low. Several equally acceptable roles spread
probability the same way genuine confusion does, and refusing a near-tie between
two roles that would both do the job throws away a usable pick. It only catches
a distribution that says nothing at all.

The whole `fleet` subtree is stripped from in-project config, so a cloned
repository cannot switch this on, and `typesafe` is denied separately.

## Fallback behavior

Every failure path ends at the classifier the user already had, never at
nothing:

- `typesafeClassifier: true` with no resolvable account → the provider
  classifier. A missing API key is a setup problem, not a reason to lose
  routing.
- Transport failure, timeout, malformed answer, missing fit answer, a role that
  was not offered → `null`, and `dispatchAgent` falls back to its own routing.
- Fewer than two candidates → `null` without spending a request. One candidate
  is not a choice.

## What leaves the machine

Per ambiguous dispatch: the task description, and the role/summary/contrast
lines of up to `maxCandidates` (default 6) catalog roles. Confident heuristic
dispatches send nothing.

The task description is usually a subagent task the agent composed, which may
quote file paths or requirements from the conversation.

## Cost

One request per ambiguous dispatch. Compared to the prose path this replaces —
a full provider completion with a 15s timeout — it should be cheaper and faster,
but that has not been measured here.

## Code

| File | Role |
|---|---|
| `packages/core/src/coordination/dispatcher.ts` | The two-stage router and the `DispatchClassifier` seam. Unchanged except for the optional `confidence`. |
| `packages/core/src/coordination/typesafe-dispatch-classifier.ts` | The typed classifier. |
| `packages/cli/src/services/dispatch-classifier.ts` | Picks which classifier the config asks for. |
| `packages/core/src/typesafe/` | Shared client and account resolution. |

## Not done: mode selection

Modes (`DEFAULT_MODES`, ~18 of them) are deliberately **not** auto-selected. A
mode is a session-level preference the user sets with `setActiveMode` — it
changes response style, verbosity and token budget. Picking one per turn would
fight an explicit user choice rather than fill a gap, which is the opposite of
what both features here do: a skill suggestion and a role dispatch are decisions
the *agent* was already making on thin evidence.
