# Skill suggestion (TypeSafe)

**Off by default.** Turning it on sends the latest user message to a third-party
API before each new turn. Read [What leaves the machine](#what-leaves-the-machine)
before enabling it.

## The problem

In progressive mode the agent picks a skill from a manifest that gives it one
line each — a name and a trigger. That is enough to tell `git-flow` from
`docker-deploy`, and not enough to tell `design-craft` from `design-critique`,
or `code-review` from `auto-review`: names that are genuinely close, whose
one-liners are closer still. The manifest also carries a standing instruction to
load a skill when one is relevant, which invites a guess on turns where nothing
is.

Two failure modes follow: the agent loads the **wrong** skill on turns a skill
covers, and loads **some** skill on turns nothing covers.

## The approach

Two cheap judgments go in front of the decision, following TypeSafe's published
[skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion).
TypeSafe's System One models answer typed questions — `Choice` picks one option
from a set you define, `Noul` returns the probability a yes/no condition holds —
so the answers are numbers this code branches on, not text to parse.

**Pass 1 — read the whole roster cheaply.** One `Choice` over every visible skill
name, using the same trigger line the agent sees as each option's rubric; its
probabilities are the ranking. Alongside it, three `Noul` questions ask three
ways whether this turn wants a documented procedure at all. Their mean is the
gate, and under `gateThreshold` nothing is suggested. All four questions are
independent judgments over the same state, so they go out in one request.

The three gate questions deliberately ask about the *shape* of the request, not
its subject. A subject-matter question cannot separate "explain what a monad is"
from a turn that needs a skill — on a coding agent, where the whole roster is
technical, subject matter separates almost nothing.

**Pass 2 — read the top three properly.** A `Choice` over the shortlist, now with
each candidate's full description and the opening of its body as evidence, plus
one `Noul` per candidate asking whether it does the specific thing asked for.
Each of those is answered on its own, so they can all come back low — which is
how the whole shortlist gets rejected when the closest skill is still the wrong
one. The `Choice` settles *which*; the Nouls settle *whether to say anything*.
They are allowed to disagree.

The winner becomes one line after the roster:

```
<skill_relevance>
Relevant to the current request: design-craft. Ignore this if it does not fit
what the user actually asked for.
</skill_relevance>
```

Two details there are load-bearing. It says the suggestion can be ignored,
because pushing harder wins compliance on the wrong suggestions too, and a
confident wrong pointer is worse than none. And a turn with nothing to suggest
still sends a sentence saying so, rather than sending no block — otherwise the
manifest's "load a skill when one is relevant" instruction stands unopposed on
exactly the turns where the gate decided nothing applies.

This negative sentence is emitted only for a completed gate/fit decision.
Transport errors, malformed or incomplete answers, empty rosters and deadline
expiry leave the original system prompt unchanged. Failures are also cached
within the turn so tool iterations do not repeatedly call a failing service.

## Enabling it

```jsonc
// ~/.wrongstack/profiles/<name>/config.json
{
  "skills": {
    "suggest": { "enabled": true }
  }
}
```

The credential, endpoint and model live in the shared top-level `typesafe`
block, not inside this feature — the [dispatch classifier](./fleet-dispatch-classifier.md)
uses the same account. Configuring an account turns nothing on; each feature
keeps its own `enabled`.

```jsonc
{
  "typesafe": {
    "apiKey": "...",            // https://console.typesafe.ai/keys
    "endpoint": "https://api.typesafe.ai/v1/systemone",
    "model": "jev-latest",
    "requestTimeoutMs": 4000
  }
}
```

`apiKey` is **encrypted at rest** like every other credential in the config: the
secret walker matches the field name and the profile's `SecretVault` stores it
as `enc:v1:…`, decrypting transparently on load. It is the normal place to put
the key.

`TYPESAFE_API_KEY` is used when `typesafe.apiKey` is absent, for CI or an
environment with no configured profile key:

```sh
export TYPESAFE_API_KEY=...
```

Or skip the file entirely:

```sh
wstack typesafe login      # stores the key, vault-encrypted
wstack typesafe test       # proves the key, route and model actually work
```

Jev is also reachable through OpenRouter's Decisions endpoint — same request
body, different host and bill. See [the account doc](./typesafe-account.md) for
routes, the revoked-key breaker and what `wstack doctor` reports.

### Settings

`skills.suggest`:

| Field | Default | Description |
|---|---|---|
| `enabled` | `false` | Master switch. |
| `shortlistSize` | `3` | Candidates carried into pass 2. |
| `excerptChars` | `700` | Body characters each shortlisted skill contributes. |
| `gateThreshold` | `0.3` | Mean gate probability below which nothing is suggested. Raise to suggest less often. |
| `fitsThreshold` | `0.3` | Best per-candidate fit below which the shortlist is dropped. |
| `deadlineMs` | `3000` | Hard deadline for both passes combined. |
| `minRequestChars` | `12` | Skip turns whose latest user message is shorter than this. |

`typesafe` (shared):

| Field | Default | Description |
|---|---|---|
| `apiKey` | — | Falls back to `TYPESAFE_API_KEY`. |
| `endpoint` | `https://api.typesafe.ai/v1/systemone` | Evaluation endpoint. |
| `model` | `jev-latest` | Model id. |
| `requestTimeoutMs` | `4000` | Per-HTTP-attempt timeout. |

Both `skills.suggest` and the whole `typesafe` block are **stripped from
in-project config** (`<project>/.wrongstack/config.json`) and honored only from
the user's profile config. `typesafe.endpoint` would otherwise let a cloned
repository redirect every prompt this agent sees to a host it chose, and
`skills.suggest.enabled` alone would let it start that egress.

## Cost and latency

Two requests per **distinct user message**, not per provider call. The request
pipeline runs on every call in a turn — a single user turn is often a dozen, once
tool calls start — and the judgment is about the user's request, which does not
change between them. The answer is computed once and replayed for the rest of
the turn, misses included.

So the added latency lands once, at the start of a turn, bounded by `deadlineMs`.
Past that deadline the turn proceeds with no suggestion.

## What leaves the machine

Per distinct user message:

- the text of that message;
- every visible skill's **name** and **trigger line** (pass 1);
- for the three shortlisted skills, their full description and the first
  `excerptChars` of their body (pass 2).

Conversation history, file contents, tool output and repository paths are not
sent — but a user message often quotes them, and that message is sent verbatim.
Treat enabling this as a decision to send your prompts to TypeSafe.

Skills whose `audience` is `roster` or `external` are excluded: they never reach
the agent's manifest, so pointing at one would name an entry it cannot read.

## Failure behavior

Every failure mode is "no suggestion", never a failed turn: no API key, an
unreachable endpoint, a 401, a timeout, an empty roster, a malformed answer. The
middleware also passes the request through untouched if anything in it throws.

Silently, with one exception. Turning `enabled` on with no usable account warns
**once per process**, naming the switch — otherwise a flipped switch does
nothing and nothing says why. Repeated 401s disable the feature for the process
rather than paying for a rejected request every turn; see
[the account doc](./typesafe-account.md).

A name that comes back is re-validated against the roster before it is printed
into the prompt — the distribution is echoed from criteria we sent, but it
arrives over the network from a third party.

## Seeing what it does

A live session shows nothing: the suggestion is one line of system prompt the
user never sees. Two ways to look at it.

**One request, both passes, all the numbers:**

```sh
wstack skill-suggest "restyle the settings page header"
```

Shape of the output (illustrative — the numbers below are made up, not a
recorded run):

```
  "restyle the settings page header"

  gate [########..] 78% ≥ 30% — continue
      acts_on_user_system                85%
      would_follow_documented_procedure  79%
      prose_suffices                     30% (counts inverted)

  pass 1 — ranked
      61%  design-critique
      32%  design-craft
       4%  design-system
       2%  output-standards
       1%  code-review

  pass 2 — fits
      41%  design-critique
      68%  design-craft ← choice
       3%  design-system

  suggests design-craft
  2 request(s), 340ms
```

This works whether or not `enabled` is on — previewing is how you decide
whether to turn it on. It also tells a transport failure apart from a genuine
"nothing fits", which the live path deliberately collapses into the same
outcome.

**In a running session**, an enabled suggester writes one debug line per new
user message (`skill suggestion: design-craft (gate 0.78, fits 0.68)` or
`skill suggestion: nothing fits this turn`), plus one per request with the token
count it cost. Raise the log level to see them.

## Evaluating the thresholds

The defaults are TypeSafe's published starting points, measured on a 182-skill
roster with a different shape from yours. They are config-exposed because the
right values depend on your roster and on what a wrong load costs you.

A starter set lives at **`.wrongstack/skill-suggest-eval.jsonl`** — 53 cases
drafted against this roster (37 covered, 16 not). Its labels are inferred from
each skill's own frontmatter trigger, not from how anyone actually works, so
correct them before trusting a number: a wrong label counts against the
suggester on every run.

The format is one JSON object per line:

```jsonl
{"text": "cut a release branch for 1.2.0", "gold": "git-flow"}
{"text": "restyle the settings page header", "gold": "design-craft"}
{"text": "explain what a monad is"}
```

`gold` absent or `null` means **nothing in your roster covers this**. Those
cases are the ones that catch a suggester that guesses; a set made only of
covered requests will look excellent and tell you nothing. Write them to punish
guessing: everyday requests, technical questions no skill serves, and requests
for something specific your roster has no skill for.

```sh
wstack skill-suggest --eval .wrongstack/skill-suggest-eval.jsonl --sweep
```

Each run prints what it spent and **which model version answered**. `jev-latest`
is an alias; a sweep table that cannot name its version is a calibration with no
date on it. If two versions answer within one run, the alias moved mid-run and
the table is not trustworthy — re-run it.

### The language the requests are actually in

TypeSafe documents English as its accuracy optimum and other languages as
working with reduced reliability. Every gate question, every Choice rubric and
every roster trigger this feature sends is in English; the request in `state`
often is not.

So there is a second, parallel set at
**`.wrongstack/skill-suggest-eval-tr.jsonl`** — the same 53 cases, same order,
same labels, written in Turkish. Run both and compare:

```sh
wstack skill-suggest --eval .wrongstack/skill-suggest-eval.jsonl --sweep
wstack skill-suggest --eval .wrongstack/skill-suggest-eval-tr.jsonl --sweep
```

Kept 1:1, the **delta** between the two runs is the language effect and nothing
else — which is why they are two files rather than one blended set, and why
`skill-suggest-eval-fixtures.test.ts` fails if they drift apart. A label
corrected in one file has to be corrected in the other.

If the Turkish run misses materially more at the same thresholds, the honest
responses are: lower `gateThreshold` for this deployment, translate the three
gate questions, or accept the loss and write it down. Averaging the two runs
produces a threshold that is wrong for both.

Measured on this repo's 46-skill roster, 2026-09-17, `jev-1.13.0`:

```
  covered (37 cases)
      correct            81%
      wrong suggestion    8%
      suggested nothing  11%
  uncovered (16 cases)
      needless           13%

  threshold sweep
      gate  fits  correct   wrong  missed  needless
      0.1   0.3      89%      8%      3%       13%
      0.1   0.4      89%      8%      3%       13%
      0.2   0.3      86%      8%      5%       13%
      0.3   0.3      81%      8%     11%       13%   <- shipped defaults
      0.4   0.3      76%      8%     16%       13%
      0.5   0.3      70%      8%     22%       13%
```

### What this roster's numbers actually said

Reproduced across three runs: **`gateThreshold` costs correct answers here and
buys nothing.** Moving it 0.3 → 0.1 gained 8 points of `correct` while
`needless` did not move at all. The `fits` threshold is doing all of the work
on needless suggestions — dropping it to 0.1 sends `needless` to 63%.

That is specific to a coding agent. The three gate questions ask whether the
turn wants an action taken against a documented procedure; on a roster where
essentially every request is "act on code", they separate almost nothing above
the very bottom of the range. They do still earn their place at the bottom:
*"explain what a monad is"* scores 0.07 and is rejected at any setting.

So for a roster shaped like this one:

```jsonc
{ "skills": { "suggest": { "gateThreshold": 0.1, "fitsThreshold": 0.4 } } }
```

The shipped defaults stay at TypeSafe's published 0.3/0.3, because one
53-case set on one roster is not grounds for changing what everyone gets.
Measure your own before adopting either.

**Caveats on the numbers above**, all of which inflate uncertainty rather than
resolve it: the labels are drafted, not authoritative; `correct` moved 81–84%
and `needless` 13–19% between identical runs, so treat single-point
differences under ~5 points as noise; and two of the persistent `wrong` cases
are the mailbox trio (`wrongstack-mailbox` / `wrongstack-mailbox-mcp` /
`mailbox-bridge`), which has the same "no single right answer" problem as the
design trio below.

### What these numbers are, and are not

They score **the suggester against your labels**: did it name the skill you
said covers the request? TypeSafe's cookbook reports a different pair — whether
the **agent** then loaded the right skill — which needs a full agent turn per
case per arm and a pinned model to be comparable. Do not report these as the
cookbook's numbers.

The two are related but not interchangeable. The agent ignores some suggestions
(the block tells it to), and a confident wrong suggestion breaks some turns it
had right on its own — TypeSafe's own evaluation fixed 37 and broke 7 out of
315. A perfect suggester score is an upper bound on the improvement, not the
improvement.

What they are good for is exactly this: choosing thresholds, because moving a
threshold moves these numbers directly and moves the agent's only through them.

### A case this cannot score: skills meant to be used together

`design-craft`'s own trigger says to use it "alongside `design-system`", and
`design-system`, `design-craft` and `design-critique` list overlapping trigger
words — "restyle", "redesign", "looks generic", "make it look better". On a
request like *"restyle the settings page header, it looks generic"* all three
legitimately apply; a live run scored `design-system` 96% and `design-craft`
96% on fit and broke the tie toward `design-system`.

There is no single right answer there, so no threshold moves it and labeling it
only adds noise. Those cases are left out of the starter set deliberately.

The suggester emits at most one name by design — a second name is a second
thing for the agent to weigh, and the whole point is to narrow. If a pair is
genuinely meant to load together, that is a question about the roster (merge
them, or let one skill's body point at the other), not about the suggester.

### Reading the sweep

`wrongSuggestion` and `missed` are reported separately because they are not
equally bad. Silence leaves the agent where it started — that is the behavior
without this feature at all. A wrong name actively pushes it somewhere.

Raising `gateThreshold` cuts needless suggestions and adds misses; they move in
opposite directions and no single number decides for you. Decide which costs
you more on your roster before reading the table.

The sweep is free: `--sweep` collects both passes for every case once (which is
why it ignores the gate while collecting) and then re-decides those same
answers at each threshold pair offline. Without `--sweep`, cases that fail the
gate never pay for pass 2.

Related reading: [Confidence](https://docs.typesafe.ai/confidence) on picking
thresholds, and [Intent routing](https://docs.typesafe.ai/patterns/intent-routing)
for the same shape applied to handlers rather than skills.

## Code

| File | Role |
|---|---|
| `packages/core/src/typesafe/client.ts` | Shared `fetch` client for the native and OpenRouter evaluation endpoints; no SDK dependency. |
| `packages/core/src/skills/suggest/skill-suggester.ts` | The two passes, the questions, and the thresholds. |
| `packages/core/src/skills/suggest/middleware.ts` | Request middleware: per-user-message caching and the volatile system block. |
| `packages/core/src/skills/suggest/setup.ts` | Shared host wiring; CLI and WebUI server both call it. |
| `packages/core/src/skills/suggest/evaluate.ts` | Scoring, the threshold sweep, and eval-file parsing. |
| `packages/cli/src/subcommands/handlers/skill-suggest.ts` | `wstack skill-suggest` — preview and eval. |
