---
name: design-critique
description: |
  Use this skill to audit an interface that already exists and say precisely why it looks generated, templated, or unfinished — a scored rubric across composition, typography, color, states, accessibility and copy, ending in a ranked fix list.
  Triggers: user says "review the design", "critique this UI", "why does this look bad", "looks generic", "looks AI-generated", "design review", "audit the UI", "make this look professional", "what's wrong with this page", "design feedback".
version: 1.0.0
required-capabilities: [filesystem.read]
required-tools: [design, skill, read, grep]
optional-capabilities: [browser.interact, verification.run]
---

# Design Critique — WrongStack

## Overview

A design critique that says "it looks a bit generic, maybe add more spacing" is
worthless. This skill produces a **scored, evidenced, ranked** audit: each
finding names the file and line, the rule it breaks, and the concrete
replacement — the same standard a code review is held to.

Two independent failure classes, always reported separately:

- **Adherence** — does the code use the kit's tokens? Machine-checkable.
- **Craft** — does the result look designed? Needs judgment, guided by a rubric.

A UI at 100% adherence with a failing craft score is the common case, and
saying so plainly is the whole value of this skill.

## Workflow

```
1. Establish ground truth   → active kit + brief
2. Machine pass             → design {action:"verify"}
3. Craft pass               → rubric, six axes, evidence per finding
4. Score + rank             → what to fix first, what to ignore
5. Report                   → findings, not adjectives
```

### 1 — Ground truth

```
design {action:"list"}        # what is pinned
```

Read `.design/brief.md` with `read` if it exists — a critique that contradicts a decision
the team already made is noise, unless the decision itself is the problem (say
so explicitly, once). Read `.design/rules.md` for project overrides, and
`grep` the UI source for kit-token usage to ground the adherence findings. If no kit
is pinned, that is finding #1: the UI has no source of truth.

### 2 — Machine pass

```
design {action:"verify"}
```

Run `design` with `{action:"verify"}` and report the breakdown by axis. Treat `composition` findings as craft evidence,
not token drift — they are patterns that are token-clean and still generic.

### 3 — Craft pass

Score each axis 0–5 against
`skill` ({ name: "design-critique", resource: "references/rubric.md" }).
Never score from feel — each score cites at least one concrete observation.

| Axis | The question it answers |
|---|---|
| **Structure** | Is there a grid and a focal point, or an even mat of equal blocks? |
| **Typography** | Does hierarchy survive in greyscale? Is the measure controlled? |
| **Color** | 60/30/10 or accent-everywhere? Does dark mode look re-tuned or inverted? |
| **Surface & depth** | One coherent elevation strategy, or borders+shadows stacked at random? |
| **States & edges** | Empty, loading, error, overflow, long strings — present or happy-path only? |
| **Copy & voice** | Domain-specific, or interchangeable marketing filler? |

Run the three cheap tests and report the result of each:

- **Greyscale** — remove color. Hierarchy intact?
- **Squint** — blur it. Is there one focal point per screenful?
- **Swap** — replace the product name throughout. Does the copy still make
  sense for a different product? If yes, the copy is filler.

### 4 — Score and rank

Overall = the *lowest* axis, not the average. One broken axis is what people
see. Rank fixes by **visible impact per unit of work**; structure fixes almost
always outrank color fixes.

Mark each finding:

- **Blocking** — ships as broken (a11y failure, unreadable contrast, missing
  error state, horizontal scroll at 320px)
- **Craft** — the taste gap; why it reads as generated
- **Nit** — genuinely optional

### 5 — Report

```
## Design critique — <surface>

Kit: <id> · Adherence: <pct>% (color N, radius N, composition N)
Craft: structure 2/5 · type 3/5 · color 4/5 · surface 3/5 · states 1/5 · copy 2/5
Verdict: <one sentence naming the single biggest reason it reads as generated>

### Blocking
1. `src/app/page.tsx:41` — no focus ring on the primary action …
### Craft
2. `src/app/page.tsx:12` — gradient-filled headline; hierarchy outsourced to a filter.
   Replace with: display size 2.75rem / weight 600, body dropped to muted.
### Nits
…
```

## Rules

1. **Evidence or silence.** Every finding names file:line or a named screen
   region. No "the spacing feels off".
2. **Each finding ships its replacement.** Naming the flaw is half the work.
3. **Separate adherence from craft.** Never let a clean `verify` imply the
   design is good, and never report a craft opinion as a token violation.
4. **Verdict first, in one sentence.** The single biggest reason. If you cannot
   name one, you have not finished looking.
5. **Do not rewrite while auditing.** Report, then fix on request — mixing them
   hides what was wrong.
6. **Respect the brief.** Decisions already made are not findings unless they
   are the problem; say that once, don't re-litigate.
7. **No praise padding.** One line of what genuinely works, then the findings.
8. **Cap the list.** Top 10 by impact; state the count of the remainder.

## Anti-patterns in critiques

| Don't | Do |
|---|---|
| "Feels a bit generic" | "Three identical centered sections; no spine — evidence: lines 20, 48, 76" |
| "Add more whitespace" | "Section padding is uniform `p-6`; the kit's density scale gives 12/8/6 by role" |
| "Improve the colors" | "Accent used 11× on this screen; 60/30/10 wants ≤3 — list of uses attached" |
| Scoring every axis 3/5 | Scores that differ, each with a citation |
| Rewriting the file mid-audit | Report, rank, then fix on request |

## Skills in scope

- `design-craft` — the rules this rubric audits against; use it to do the fixing
- `design-system` — kit, tokens, and the machine adherence pass
- `web-platform-baseline` — before claiming a capability is unavailable
- `code-review` — when the findings are structural code problems, not design
- `output-standards` — `<nextsteps>` shape when handing the fix list back
