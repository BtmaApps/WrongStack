# Critique rubric

Six axes, 0–5 each. **The overall score is the lowest axis**, not the average —
one broken axis is what people see.

Every score cites an observed artifact, viewport and state. Source-only evidence
can establish implementation facts but cannot support a visual score. Use
`unverified` for missing evidence and `n/a` only for an inapplicable axis. Do not
compute an overall score while an applicable axis is unverified.

---

## Before scoring: surface type

The axes below are written for a **page**. On an **app screen** two of them are
scored differently, because the rules they encode are page rules:

| Axis | On an app screen |
|---|---|
| **Structure** | Ignore "centered monotony" and "hero + three cards". Ask instead: does one element earn the focal point, or is every tile the same weight? Is there a lane/tile rhythm, or one uniform grid? |
| **Typography** | The 60–75ch measure applies to prose blocks only. Tables, labels and numeric cells are exempt; judge tabular figures, label tracking, and whether the value/label size jump survives greyscale. |

On a **component in isolation**, Structure and Copy are usually `n/a`.

On a **kiosk / public terminal** every axis applies unchanged, but the six craft
scores are not the verdict on their own. A kiosk is judged first on physical
fitness — distance legibility, 64px+ targets with mis-tap spacing, a visible way
back from every committing step, no session remnants, and nothing essential at
the bottom of a tall panel. Report those as a pass/fail list beside the scores; a
kiosk that scores well on craft and fails one of them is a failing screen, because
the person cannot refresh, log in again, or ask for help.

Mark an inapplicable axis `n/a (<surface>)`. Never invent a middling score for
it: the overall score is the lowest axis, so a fabricated 3/5 silently sets the
floor.

## Scoring bands (apply to every axis)

| Score | Meaning |
|---|---|
| 0 | Absent — no decision was made at all |
| 1 | Default — the framework/template decided it |
| 2 | Decided but inconsistent — the intent shows in places, breaks in others |
| 3 | Consistent and safe — correct, unmemorable |
| 4 | Considered — deliberate choices visible, holds up under edge cases |
| 5 | Crafted — a decision here is part of why the product is recognizable |

Most real UI lands at 2–3. A 5 requires evidence, not enthusiasm.

---

## Axis 1 — Structure

**Question:** is there a grid and a focal point, or an even mat of equal blocks?

Look for: a nameable grid; sections that differ from each other; one focal point
per screenful; justified grid breaks; grouping encoded in spacing.

| Score | Evidence |
|---|---|
| 1 | Template hierarchy obscures the primary task or makes different priorities look equal |
| 3 | Coherent grid and reading order; task and grouping are clear |
| 5 | Structure uses the product's actual content and workflow with effective density and adaptation |

**Tests:** can the primary task be identified? Does repetition support comparison
and scanning, or flatten content with different priorities? Symmetry and repeated
sections are valid when their roles are equal; novelty is not a scoring criterion.

---

## Axis 2 — Typography

**Question:** does hierarchy survive in greyscale, and is the measure controlled?

Look for: a ramp with a real jump; body measure 60–75ch; tracking adjusted by
size; tabular figures in tables; kit font tokens rather than literals.

| Score | Evidence |
|---|---|
| 1 | One size + `font-bold`; unbounded line length; hardcoded family |
| 3 | Kit ramp used correctly; measure controlled; no optical work |
| 5 | Pairing with genuine contrast; optical alignment; balanced headings; numerals handled |

**Test:** greyscale — remove all color, is hierarchy intact?

---

## Axis 3 — Color

**Question:** do color roles make the task clearer? Are supported themes readable?

Look for: primary action salience, consistent links and status colors, dark mode
lightness/chroma re-tuned, measured contrast, and no color-only meaning. Accent
counts and 60/30/10 are not pass/fail rules, especially for charts and dense tools.

| Score | Evidence |
|---|---|
| 1 | Accent on everything; dark mode is an inversion; contrast failures |
| 3 | Token-clean, contrast passes, allocation roughly right |
| 5 | Allocation deliberate; derived variants (`color-mix`) keep the family coherent; both themes independently tuned |

**Test:** inspect the busiest state: can action, status and data roles be distinguished?

---

## Axis 4 — Surface & depth

**Question:** one coherent elevation strategy, or borders and shadows stacked at random?

Look for: border-first or shadow-first, held consistently; kit elevation ramp
rather than stock `shadow-lg`; overlays genuinely floating; radius consistent
with the kit scale.

| Score | Evidence |
|---|---|
| 1 | Stock Tailwind shadows on everything, plus borders |
| 3 | Kit ramp used; strategy mostly consistent |
| 5 | Elevation carries real meaning (what floats, what is inset, what is flat) |

---

## Axis 5 — States & edges

**Question:** empty, loading, error, overflow — present, or happy path only?

Look for: all five data states; `:focus-visible` on every control; hover not
required for affordance; 320px and long-string behavior; reduced-motion honored.

| Score | Evidence |
|---|---|
| 0–1 | Happy path only; no focus styling; breaks at 320px |
| 3 | States present but generic ("No data", spinners) |
| 5 | Empty states carry product voice; skeletons match real layout; errors say what to do next |

**Test:** longest real string at 320px; keyboard-only pass.

---

## Axis 6 — Copy & voice

**Question:** domain-specific, or interchangeable filler?

Look for: the swap test; button labels naming the action; errors with a
recovery path; no banned register.

| Score | Evidence |
|---|---|
| 1 | Marketing filler, lorem ipsum, "Submit" buttons, exception strings surfaced |
| 3 | Clear and correct, unremarkable |
| 5 | Copy that only fits this product; empty/error states that teach |

**Test:** swap the product name — does it still make sense?

---

## Reporting

```
Kit: <id> · Adherence: <pct>% (color N, radius N, spacing N, composition N)
Craft: structure N/5 · type N/5 · color N/5 · surface N/5 · states N/5 · copy N/5
Overall: <lowest axis> — <one sentence naming the single biggest reason>
```

Then findings, ranked by visible impact per unit of work, each with file:line,
the rule broken (cite a `design-craft` slop-inventory row id where one applies),
and the concrete replacement. Structure findings almost always outrank color
findings.
