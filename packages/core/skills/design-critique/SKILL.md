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
`grep` the UI source for token usage to ground the adherence findings.

**Adherence means different things in three cases. Establish which one you are in
before reporting any percentage.**

| Case | What adherence means here |
|---|---|
| A kit is pinned | Run the machine pass and report its score as-is. |
| No kit, but the project **has its own design system** — a theme file, semantic CSS variables, a token layer | Measure against **the project's own tokens**, not a kit. Find the token source (`@theme` block, `:root` variables, theme constants), then look for literals that bypass it. A percentage produced by pinning an arbitrary kit is meaningless — do not report one. |
| No kit and no token layer | That is finding #1: the UI has no source of truth, and every color is a decision nobody can revisit. |

The middle case is the common one in a mature codebase, and mis-reporting it as
the third is how a critique loses the room: the team already built a system, and
being told they have none is simply wrong. Say instead which axis of *their*
system is missing — a kit carries radius, spacing, type, motion and elevation,
and a hand-rolled system is usually missing one of them.

### 2 — Machine pass

```
design {action:"verify"}
```

**Check what the machine pass could actually see.** It reads utility classes and
CSS; a native-stack screen (react-native, flutter, swiftui, compose) has neither,
so it returns a clean result on a file it never checked. If verify reports files
with no class/utility signal, say so in the report — `Tokens: not machine-checkable
(native stack)` — and carry the entire adherence judgement by reading the theme
constants and spacing scale yourself. Never let a vacuous clean pass stand in as
evidence.

Run `design` with `{action:"verify"}` and report the breakdown by axis. Treat `composition` findings as craft evidence,
not token drift — they are patterns that are token-clean and still generic.

### 3 — Craft pass

**Classify the surface first.** Two axes are scored differently depending on it,
and some are not scorable at all:

| Surface | Examples | What changes |
|---|---|---|
| **Page** | landing, marketing, docs, article, onboarding | Nothing — every axis applies as written |
| **App screen** | dashboard, console, table view, settings, editor chrome | *Structure*: "centered monotony" and "hero + three cards" do not apply; judge tile/lane rhythm and whether one element earns the focal point. *Typography*: the 60–75ch measure rule applies to prose blocks only, never to tables, labels or numeric cells |
| **Kiosk / public terminal** | ticket machine, self-checkout, wayfinding panel, check-in screen | Every axis applies, **plus** the physical checks below — which no other surface needs and which outrank taste when they conflict |
| **Component in isolation** | one primitive, one card | *Structure* and *Copy* are usually not scorable |

**Kiosk is not a small page.** Its constraints are physical, and a rubric that
only asks design questions will hand a kiosk a flattering score for the wrong
reasons. Ask these as well, and treat a failure as blocking rather than craft:

- **Readable at distance.** Can the primary state and the total/answer be read
  from two metres, in glare? If the answer depends on leaning in, it fails.
- **One cold finger.** Targets well above the 44px floor (64px+), spaced so a
  mis-tap cannot select the neighbour. No hover, no drag, no long-press, no
  dropdown.
- **Recoverable.** Every destructive or committing step has a visible way back.
  A stranded user cannot refresh, log in again, or email support.
- **No session.** Nothing personal persists on screen, and the screen returns to
  its start state on its own after inactivity.
- **Standing, not sitting.** Content sits in the upper-middle band; nothing
  essential lives at the very bottom of a tall panel.

Score the six craft axes as usual, then report the physical checks as a separate
pass/fail list. A kiosk that scores 4/5 on craft and fails "readable at distance"
is a failing screen.

Never score an axis that does not apply to the surface. Write `n/a (app screen)`
and move on — a fabricated 3/5 drags the overall score, which is the lowest
axis, and makes the whole report meaningless.

Score each remaining axis 0–5 against the rubric, loaded with the `skill` tool:

```
skill({ name: "design-critique", resource: "references/rubric.md" })
```

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

Surface: <page | app screen | component>
Tokens: <kit id · adherence pct> | <project's own system — no kit pinned> | <none>
Craft: structure 2/5 · type n/a (app screen) · color 4/5 · surface 3/5 · states 1/5 · copy 2/5
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
9. **Classify the surface and the token situation before scoring.** Scoring a
   dense table view against page rules, or reporting an adherence percentage
   against a kit the project never adopted, produces confident nonsense.
10. **File each finding against the file that owns it.** A screen with no focus
    ring may be importing a primitive that lacks one — the finding belongs to
    the primitive. Check before you blame the surface you happen to be reading.

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
