# Slop inventory

The annotated list of patterns that mark a UI as generated-by-default. Each row:
the tell, why it happens, and the replacement. Patterns marked **[verify]** are
checked mechanically by `design {action:"verify"}` (axis `composition`); the
rest need judgment — that is what `design-critique` is for.

A pattern is not banned because it is ugly. It is banned because it is the
*unconsidered default* — the thing produced when no decision was made. Any of
these is legitimate when the brief chose it on purpose and says why.

## Layout & composition

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| L1 | Hero + feature cards chosen before the content | A familiar template substitutes for information architecture | Choose the structure from the content; changing three cards to four does not solve it |
| L2 | Every section a centered stack **[verify]** | Centering is the safe choice at every step | A grid spine; alternate alignment; anchor content to columns |
| L3 | Identical card repeated N× **[verify]** | May hide content priorities | Keep equal rows/cards for comparable items; vary emphasis only when their roles differ |
| L4 | Uniform section padding top to bottom | No density decision was made | Vary rhythm: tight after generous; group related sections by proximity |
| L5 | Everything inside `max-w-7xl mx-auto` | The default container | Let some elements break the container (full-bleed media, edge-to-edge tables) |
| L6 | Centered 3-stat band ("10k+ users") | Filler where evidence belongs | Real numbers with a source, or delete the band |
| L7 | Perfect symmetry everywhere | Symmetry is the average of all choices | One deliberate asymmetry; an off-center focal point |
| L8 | Equal visual weight for every element | Nothing was prioritized | One focal point per screenful; everything else recedes |
| L9 | Decorative blurred blobs behind content | Decoration substituting for structure | Only when the kit sanctions it (`aurora-gradient`, `holographic`); otherwise structure carries the page |
| L10 | Icon + bold title + two grey lines, ×6 | The "feature grid" reflex | Let the content dictate: some items need an image, some a stat, some one line |

## Typography

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| T1 | One family for everything, hierarchy by `font-bold` | Safe, and invisible | A ramp with a real jump (≥1.4× display:body); weight + size + color together |
| T2 | Hardcoded font family **[verify]** | Bypasses the kit | `font-sans` / `font-display` / `font-mono` tokens |
| T3 | Uncontrolled line length | Never considered | 60–75ch for body; 20–35ch for display |
| T4 | Ragged headlines | Default wrapping | `text-wrap: balance` on headings, `pretty` on body |
| T5 | Same tracking at every size | Tracking treated as fixed | Tighten display (−1 to −3%), normal at body, open small caps/labels |
| T6 | ALL-CAPS labels without extra tracking | Caps copied without the optical fix | Add letter-spacing; caps are unreadable at default tracking |
| T7 | Numbers in a proportional face inside tables | Default numerals | Tabular figures (`font-variant-numeric: tabular-nums`) |
| T8 | Body text at the same color as headings | No de-emphasis pass | Muted token for secondary text; hierarchy in greyscale |

## Color & surface

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| C1 | Gradient-filled headline **[verify]** | Hierarchy outsourced to a filter | Size/weight/measure contrast |
| C2 | Purple→blue gradient anything | The single most-generated palette move | The kit's accent, used sparingly and flatly |
| C3 | Decorative accents competing with the primary task | No semantic color roles | Protect action salience; keep necessary link, status and data colors consistent without an arbitrary count limit |
| C4 | Stock `shadow-lg` everywhere **[verify]** | Tailwind's default ramp, not the kit's | `shadow-1…shadow-4`, mostly `shadow-1` |
| C5 | Border **and** heavy shadow stacked | Two elevation strategies at once | Pick one; if both, the shadow must be near-invisible |
| C6 | Dark mode = inverted light mode | One token set flipped, not re-tuned | Re-tune lightness and chroma; dark surfaces lift, dark text softens |
| C7 | Unprompted glassmorphism | Decoration by default | Only under kits that sanction it |
| C8 | Semantic color as the only signal | Color-only meaning | Pair with icon, text, or shape (WCAG) |
| C9 | Pure black / pure white surfaces | Untuned defaults | The kit's `bg`/`surface` tokens; near-black and paper-white read better |

## Iconography & imagery

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| I1 | Emoji as UI icons **[verify]** | Cheapest way to fill an icon slot | A real icon set with consistent stroke width and size. Typographic symbols (`→ ✗ ⚠ ★ ⌘`) are not emoji and are legitimate in dense UI; a pictograph marked `aria-hidden` is decorative and fine |
| I2 | Icons at mixed stroke widths/sets | Icons picked one at a time | One family, one weight, one optical size |
| I3 | Generic stock illustration of people pointing at charts | Placeholder that shipped | Real product UI, real data, or nothing |
| I4 | Avatars that are all the same generated face | Placeholder data | Real or clearly-placeholder-labelled data |

## States & edges

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| S1 | Happy path only | The prompt only described the happy path | Empty · loading · error · populated · overflow for every data surface |
| S2 | Spinner for a known shape | Easiest loading state | Skeleton matching the real layout |
| S3 | Empty state that says "No data" | Nothing was decided | Say what belongs here, why it's empty, and the one action that fixes it |
| S4 | No `:focus-visible` treatment | Invisible until keyboard testing | Explicit, on-brand focus ring on every interactive element |
| S5 | Hover-only affordances | Desktop-only thinking | Affordance visible without hover; hover is enhancement |
| S6 | Text that breaks at 320px or with a 60-char name | Only tested with short ideal strings | Test long strings, long names, zero items, 10k items |

## Copy

| # | Tell | Why it happens | Replace with |
|---|---|---|---|
| P1 | "Unlock the power of…", "Take X to the next level" **[verify]** | Marketing register with no product knowledge | One concrete sentence about what it does |
| P2 | Lorem ipsum **[verify]** | Placeholder that shipped | Real copy, or ask |
| P3 | Triads: "Fast. Simple. Powerful." | Rhythm substituting for content | A claim specific enough to be falsifiable |
| P4 | Copy that survives a product-name swap | Written about software in general | Domain nouns and verbs |
| P5 | Error text that names the exception | Developer-facing string in a user surface | What happened, why, and what to do next |
| P6 | Button labels "Submit" / "Click here" | Generic control naming | The verb of the action: "Create workspace" |

## What the engine checks, and what it deliberately does not

`design {action:"verify"}` mechanizes the rows marked **[verify]**. The rest are
judgment calls for `design-critique`. That split is not arbitrary — each
candidate below was measured against a real 404-file UI before being accepted or
rejected, and the rejections are as informative as the rules:

| Candidate | Measured | Verdict |
|---|---|---|
| Raw interactive element with no focus styling (S4) | 162 files | **Rejected.** The project sets `:focus-visible` globally in one stylesheet; a file-scoped rule cannot see it, so every hit was false. Focus coverage is an a11y audit, not a regex. |
| Mixed icon stroke widths (I2) | 4 files | **Rejected.** Two were canvas/graph views where varying stroke width carries meaning. Signal too thin, intent too easy to misread. |
| Table without tabular figures (T7) | 4 files | **Deferred.** Half the hits were a table primitive and a generic markdown renderer, neither of which should hardcode numerals. |
| Generic empty-state label (S3) | 1 file | **Accepted.** Zero noise, and it matches only when the generic phrase is the entire label. |
| Decorative gradient background (C7/L9) | — | **Rejected by design.** Kits like `aurora-gradient` and `soft-glass` sanction exactly this. A kit-independent rule cannot judge it. |
| Two adjacent sections sharing a skeleton | — | **Judgment only.** The repeated-block rule needs 4 copies before it fires, tuned that way to avoid flagging legitimate label classes. Two near-identical cards back to back is the most common real case and lands below the threshold — which is precisely what a critique is for. |

The lesson for anyone adding a rule: **measure it against a real corpus first.**
Three of this file's rules were wrong on their first draft, and the corpus said
so before any user did.

## How to use this file

- **Before building**: skim the section for what you're about to write.
- **When stuck on why something looks off**: read row by row against the screen
  — the tell is almost always in here.
- **In a critique**: cite the row id (L2, C1) so the finding is unambiguous.
