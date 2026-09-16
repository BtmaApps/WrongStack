# Critique rubric

Six axes, 0–5 each. **The overall score is the lowest axis**, not the average —
one broken axis is what people see.

Every score cites at least one concrete observation (file:line, or a named
screen region). A score without a citation is a feeling.

---

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
| 1 | Every section a centered stack; uniform padding; hero + three cards |
| 3 | A real grid, consistently applied; sections still similar to each other |
| 5 | Archetype clearly chosen; rhythm varies with intent; 1–2 deliberate breaks that recur in a role |

**Tests:** squint test (one focal point?); do any two adjacent sections share a skeleton?

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

**Question:** 60/30/10, or accent-everywhere? Is dark mode re-tuned or inverted?

Look for: accent count per screen (≤3); neutrals carrying the page; dark mode
lightness/chroma re-tuned; contrast floors met; no color-only meaning.

| Score | Evidence |
|---|---|
| 1 | Accent on everything; dark mode is an inversion; contrast failures |
| 3 | Token-clean, contrast passes, allocation roughly right |
| 5 | Allocation deliberate; derived variants (`color-mix`) keep the family coherent; both themes independently tuned |

**Test:** count accent uses on the busiest screen.

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
