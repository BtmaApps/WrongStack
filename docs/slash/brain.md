# /brain — The Global Brain (decision support, autonomy ceiling, status)

## What it does

Inspects and steers the session's **Brain** — the decision layer that sits
between the agents and the human. Every autonomous subsystem (Director,
Goal orchestrator, Eternal engine, BrainMonitor and production coordinator) routes its blocking
decisions through one shared Brain instance, bound at
`TOKENS.BrainArbiter`.

```
/brain                  Status: autonomy ceiling + recent decisions
/brain status           Same
/brain stats            Per-tier decision counts — which tier resolved each decision
/brain risk <level>     Set the autonomy ceiling: off | low | medium | high | all
/brain ask <question>   Consult the Brain directly for a decision
```

## How the Brain decides — the tier ladder

Each request stops at its first terminal decision. The runtime order is:

1. **Ledger guard** — denies groups with repeated observed failures.
2. **Cache** (off by default) — replays an identical Jev, Council or LLM
   verdict. Question, context, session, options and policy inputs keep their
   exact meaning; observed failure evicts the verdict.
3. **Rules** — first configured match wins; `defer` continues the chain.
4. **Policy** — deterministic low-risk recommendations and caller fallbacks.
   `deny` is terminal; an optionless `continue` may receive model evaluation.
5. **Risk gate** — the live ceiling controls eligibility for all model tiers.
6. **Jev System One** — optional typed Choice plus decidability check for
   at least two offered options below the Council floor. Failure or weak
   evidence defers; this is separate from the Council Judge.
7. **Council** — a panel at or above its risk floor, using quorum, veto,
   weighted majority and, when needed, a Judge.
8. **Autonomy** — deterministic heuristics, then a bounded LLM pool if needed.
   Invalid or low-quality responses try another model within the total budget.
9. **Escalation** — a structured human form in `interactive` mode, or the
   terminal policy in `headless` mode.

`/brain stats` counts the **final resolving tier**, not provider attempts or
cost. A terminal decision may follow unsuccessful model calls; inspect the
trace for attempts and reported token usage.

## The autonomy ceiling (`/brain risk`)

| Level | Behaviour |
|-------|-----------|
| `off` | Model tiers disabled; unresolved questions use human or terminal escalation |
| `low` | LLM auto-decides only low-risk questions |
| `medium` | Model tiers may auto-decide low + medium |
| `high` | LLM auto-decides low + medium + high |
| `all` | Model tiers may auto-decide through critical; critical Council failure still escalates |

The ceiling is read on **every** decision, so changes take effect
immediately for subsequent decisions. Product defaults are `headless`, a
120-second human timeout, and an adaptive ceiling: `all` with an effective
Council, `high` without one. Explicit risk settings take precedence; saving an
unrelated setting does not persist the inferred ceiling as an explicit grant.
Set the human timeout to `0` to wait indefinitely; resetting it restores the
product default.

## Self-activation (BrainMonitor)

The Brain doesn't just wait to be asked. `BrainMonitor` watches the live
EventBus for distress signals and engages the Brain proactively:

- **Tool-failure streak** — the same tool failing 3× consecutively
  (streak resets on success).
- **Error storm** — 4+ `error` events within a 60-second window.
- **Agent stall** — an active run without progress for five minutes, with no
  tool still running. A long-running tool is legitimate activity.
- **File churn** — 20 successful edits to the same file within 10 minutes.
  Edit count alone does not prove an edit/revert loop; the Brain is asked
  to let the agent continue unless independent evidence warrants steering.
  `brain.monitor.fileChurnThreshold` and `fileChurnWindowMs` override these
  defaults; existing explicit settings are preserved.

When the Brain decides to intervene, a high-priority `steer` mail is sent
from `brain@<sessionTag>` to this session's leader
(`leader@<sessionTag>`); the mailbox loop injects it into the agent's
next model evaluation before its next step, then removes the raw mail block.
Every engagement — intervening or not —
emits a `brain.intervention` event and is rate-limited by a 120-second
per-signal cooldown.

The default monitor request offers `steer` and `continue` without a recommended
option. An unavailable model does not implicitly authorize steering: unresolved
requests escalate, and the conservative headless policy denies. `observe`
never steers; `steer` is an explicit deterministic policy.

Monitor settings apply live. Stopping, disabling or retuning invalidates pending
consultations. A delayed verdict cannot steer after the run ended, a failed tool
recovered, stalled work resumed, or the captured error/churn window expired.

## Making the Brain cheaper and more predictable

Every knob below is live-editable and persists to the active profile config.

```
/brain stats                          # where are decisions actually resolved?
/brain rules                          # the deterministic table + compile errors
/brain heuristics                     # the 5 built-in patterns
/brain heuristics deadlock off        # turn one off when its guess is wrong for you
/brain llm                            # quality gate + circuit state
/brain llm uncertain on               # "I don't know" is not an answer
/brain llm confidence 0.6             # reject low-confidence verdicts
/brain llm breaker 3 60000            # skip a dead pool after 3 failures
/brain cache on                       # replay identical Jev/council/LLM verdicts
/brain escalation deny-all            # headless escalations never auto-approve
/brain monitor policy observe         # record signals, never steer (no model call)
```

## Steering the council

### The Judge is still part of Council

For option questions, quorum is checked first, then veto and weighted majority.
The Judge is called when votes tie **or** the winning weight does not strictly
exceed `approval × cast weight`. It sees the panel's rationales and selects an
offered option or refuses all options. A decisive majority, veto and missing quorum
do not call it. Generic free-text Council calls can also use it to synthesize
different stances.

`brain.council.judge` explicitly selects its model. Auto selection prefers a
pool model outside the voter seats; when none exists it can reuse a voter.
Status reports the effective Judge and `judgeIsVoter`; auto does not guarantee
an independent model. Jev's TypeSafe judge is a separate lower-risk tier.

A critical Council abstention or failure, including an unusable Judge response,
goes to human/terminal escalation without a single-model fallback. For high-risk
abstentions the existing LLM fallback remains. Council answers and denials are
terminal.

The council is the most expensive tier — one provider call *per seat* — so
every knob is reachable from the command line, the TUI `/brain` panel and the
WebUI settings section alike.

```
/brain council                        # is one convened, with which seats and judge?
/brain council personas               # the six built-in decision lenses
/brain council voters a/x:security:veto b/y:maintainer c/z:auditor
/brain council judge anthropic/claude-opus-5
/brain council distinctness provider  # report a panel that is not actually diverse
/brain council quorum 0.75            # how many seats must return a valid vote
/brain council approval 0.6           # winner must exceed this share, else the judge decides
/brain council timeout 20000          # per-seat budget
/brain council concurrency 6          # seats polled at once, 1..8
/brain council judgetokens 700        # output budget for the tie-breaker
/brain council rounds 1               # turn deliberation off (default 2)
```

### Deliberation rounds

By default a panel votes **twice**. Round 1 is independent — no seat sees any
other. In round 2 every seat is shown the other seats' ballots, including its
own, and votes again. A usable prior round can be retained if a later one fails;
the resolved event contains the selected round's votes. A seat that missed a
consequence another lens caught can revise on it.

The call budget grows with rounds: two rounds allow two calls per seat plus one
Judge call if needed. Early veto, cancellation or timeout can stop sooner.
`/brain council rounds 1` restores the single-round panel.

The trade is independence for information, and it is not free — models converge
on a stated majority whether or not the majority brought an argument. Three
things push back on that:

- The voter instruction says so explicitly: change your vote only on substance
  you had not accounted for, *agreement is not evidence*, and holding your
  position is a full answer.
- Other seats' ballots arrive as delimited **untrusted quoted data**, so an
  instruction smuggled into a rationale carries no more authority than one
  smuggled into the question.
- `deliberationChanges` on the resolution reports how many seats actually
  moved. Watch it: `0` every time means the second round is buying cost and
  nothing else, and a figure near the seat count means the panel is conforming
  rather than reasoning. The orchestrator warns when a majority of the panel
  moves in one round, and separately when a **veto seat** folds — a veto that
  can be talked out of its veto is not a safety property.

Two things worth setting deliberately:

- **`distinctness`** — default `none`, which means a panel whose seats all
  resolve to the same model produces a perfectly normal-looking unanimous
  verdict while adding cost without adding independence. `provider` reports it.
- **`judge`** — left on `auto` the judge is derived from the pool, and when the
  pool has no model left over after seating it becomes one of the voters. Both
  the TUI panel and the WebUI flag that case (`⚠ also a voter`), but pinning the
  judge avoids it.

Council votes now surface live: the TUI shows seat progress while the panel
votes and attaches the full ballot to the decision card, and the WebUI posts the
panel summary with any distinctness warning.

The highest-leverage change is usually a `brain.rules` entry, not a model
swap: a rule resolves the question before any tier that costs tokens. See
[configuration.md](../configuration.md#brain--decision-layer-autonomy-rules-council-trace).

## Replay trace

```
/brain trace on                       # record how each decision was made
/brain trace content redacted         # keep the shape, drop the free text
```

One JSONL row per decision in `<project>/.wrongstack/brain-trace.jsonl`:
every tier the ladder ran, every pool target called (**including the
failures the fallback loop otherwise swallows**), every council seat's
vote, timings and token totals. Rows convert to replayable fixtures via
`brainTraceToEvaluationCase()` and run offline through
`runBrainEvaluation()`, which never dispatches the decisions it replays.

Disabled by default — enabling it is the opt-in that permits production
decision content on disk. `content: none` still records models, timings,
tokens and vote ids.

## Examples

```
/brain
/brain risk high
/brain ask should we keep retrying the flaky integration test or skip it?
```

## Events

| Event | When |
|-------|------|
| `brain.decision_answered` | Brain answered (carries `tier`) |
| `brain.decision_ask_human` | Brain escalated to the human |
| `brain.decision_denied` | Brain denied the request |
| `brain.intervention` | BrainMonitor engaged (with `intervened: true/false`) |
| `brain.outcome` | An earlier decision's real-world result became observable |
| `brain.tier_transition` | One step of the ladder: tier, outcome, whether it was terminal |
| `brain.llm_call` | One attempt against one pool target — model, timing, tokens, failures |
| `brain.council_vote` | One council seat's observable vote |
| `brain.council_resolved` | Quorum/veto/majority resolution + judge usage |

`brain.decision_*` carries a `tier` field (`rule`, `policy`, `heuristic`,
`cache`, `ledger-guard`, `system-one`, `council`, `llm`, `terminal`, `human`)
identifying the resolving tier. Earlier attempts remain visible in trace
events; this field alone does not measure cost.

`/brain status` shows the last 20 decisions for the session.

## WebUI

`/brain` works in the WebUI chat too (same subcommands), implemented over
WebSocket messages (`brain.status` / `brain.risk` / `brain.ask`). The
standalone WebUI server assembles the same shared runtime chain, including Jev,
Council and its Judge when configured. Mode, timeout, terminal policy, monitor,
ledger and trace settings apply live. Interactive escalations use the existing
user-input form protocol; TUI avoids a duplicate Brain modal. Responses are
correlated to the request and session, and unoffered option ids are rejected.
Timeout or disposal closes the form. HQ observes the same events.

## Related

- `/autonomy` — the eternal engine consults the Brain instead of
  auto-stopping on brainstorm-DONE / failure-budget thresholds.
- `/mailbox` — where Brain steer messages land.
- `docs/slash/goal.md` — phase orchestrator Brain consultations.
