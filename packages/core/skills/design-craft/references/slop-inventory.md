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
| L1 | Hero + exactly three equal feature cards | The shape of every template in the training set | 2, 4, or 5 items; unequal spans; or a different section type (comparison, walkthrough, real screenshot) |
| L2 | Every section a centered stack **[verify]** | Centering is the safe choice at every step | A grid spine; alternate alignment; anchor content to columns |
| L3 | Identical card repeated N× **[verify]** | Content shaped to fit the component | One component mapped over data, with size/span/emphasis varying by importance |
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
| C3 | Accent color on every element | No 60/30/10 decision | Accent ≤3 uses per screen; neutrals do the rest |
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

## How to use this file

- **Before building**: skim the section for what you're about to write.
- **When stuck on why something looks off**: read row by row against the screen
  — the tell is almost always in here.
- **In a critique**: cite the row id (L2, C1) so the finding is unambiguous.
