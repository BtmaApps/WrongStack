---
name: design-craft
description: |
  Use this skill BEFORE writing any user-facing UI, alongside `design-system`, to make the result look designed rather than generated — it forces the composition, typography, color and copy decisions that token adherence alone never settles.
  Triggers: user says "design", "UI", "landing page", "make it look better", "looks generic", "looks AI-generated", "AI slop", "too templated", "hero section", "layout", "typography", "font pairing", "spacing rhythm", "visual hierarchy", "redesign", "restyle", "marketing page", "dashboard layout".
version: 1.0.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: [design, skill]
optional-capabilities: [web.research]
---

# Design Craft — WrongStack

## Why this exists

`design-system` guarantees the UI is **consistent**: one kit, real tokens, no
literals, `design` `{action:"verify"}` clean. That is necessary and not
sufficient. A screen can score 100% on-palette and still be instantly
recognizable as machine-generated, because the tells live in decisions tokens
never encode:

- every section a centered stack, three equal cards, same padding everywhere
- one type size doing all the work, no measure control, no optical alignment
- a gradient standing in for hierarchy
- emoji standing in for icons
- copy that could belong to any product ("Unlock the power of…")

Tokens are the grammar. This skill is the writing. Run both.

## The contract

1. **No pixels before the brief.** `.design/brief.md` exists and answers the
   seven decisions below before the first component is written.
2. **Every decision is written down and justified in one line.** A decision you
   cannot justify is a default in disguise.
3. **One signature move per product.** Exactly one — not zero (forgettable),
   not five (noisy).
4. **Sections differ.** No two adjacent sections share the same skeleton.
5. **Copy is real.** No filler, no placeholder marketing voice, ever — not even
   in a draft.
6. **The floor is mechanical.** `design` `{action:"verify"}` now reports a
   `composition` axis. Zero composition findings is the floor, not the goal.

---

## Step 0 — Write the brief

Write `.design/brief.md` (create `.design/` if absent). It is short, and every
line is a commitment:

```markdown
# Design brief — <product>

Archetype:    <operator tool | editorial | commerce | consumer app | docs | marketing>
Audience:     <who, and what they are doing when they arrive>
Register:     <clinical | editorial | playful | brutalist | corporate-trust | warm>
Kit:          <kit-id> (stack: <web|react-native|flutter|swiftui|compose>)
References:   <3 named real products/artifacts, and the ONE thing taken from each>
Signature:    <the single move this UI is remembered by>
Anti-goals:   <3 looks this must NOT resemble>
Density:      <compact | cozy | comfortable> — and why
Type pairing: <display face> / <text face> / <mono>, contrast ratio <ratio>
Color roles:  dominant <token> ~60% · secondary <token> ~30% · accent <token> ~10%
Layout spine: <grid: columns, gutter, max measure, asymmetry budget>
```

Rules for the brief:

- **References must be named and specific.** "Modern and clean" is not a
  reference. "Linear's command palette density, Stripe's doc typography,
  Things' empty states" is.
- **Anti-goals do real work.** They are what you check the result against when
  it starts drifting back to the mean.
- If the user gave no signal, propose the brief in ≤8 lines, say which choices
  are reversible, and continue — do not stall, and do not silently default.
- The brief outranks your taste later in the build. If it needs to change,
  change the file, don't quietly deviate.

---

## The seven forced decisions

Every one of these has a wrong default the model reaches for automatically.
Decide deliberately, write it in the brief.

| # | Decision | The default to refuse | What to do instead |
|---|---|---|---|
| 1 | **Layout spine** | Centered 1-column stack, `max-w-7xl`, everything symmetric | Pick a real grid (12-col, 2-col asymmetric, sidebar+canvas, editorial 8-col). Give one element permission to break it. |
| 2 | **Rhythm** | Same section padding top-to-bottom | Vary vertical rhythm: a tight section after a generous one. Dense ≠ cramped. |
| 3 | **Type** | One family, 2 sizes, `font-bold` for emphasis | Real ramp with a jump (≥1.4× between display and body). Control measure (60–75ch). Emphasis by weight+size+color, not bold alone. |
| 4 | **Color** | Accent on everything | 60/30/10. The accent appears 2–3 times per screen, at the moments that matter. Neutrals carry the rest. |
| 5 | **Surface** | Card everywhere, shadow on everything | Decide what a card *means* here. Prefer one elevation strategy: borders OR shadow, not both stacked. |
| 6 | **Signature** | None | One memorable move: a distinctive empty state, a real data-dense table, an editorial pull quote, a custom focus treatment, an unexpected grid break. |
| 7 | **Copy** | "Seamlessly integrate…", lorem ipsum, emoji bullets | Concrete nouns and verbs from the actual domain. If you don't know the domain, ask — don't fill. |

---

## The slop inventory (top offenders)

The full annotated list is in
`skill` ({ name: "design-craft", resource: "references/slop-inventory.md" }).
The ones that account for most of the damage:

| Pattern | Why it reads as generated | Replace with |
|---|---|---|
| Gradient-filled headline (`bg-clip-text` + `text-transparent`) | The #1 tell. Hierarchy outsourced to a filter. | Size/weight/measure contrast |
| Hero + exactly three equal feature cards | The template shape | 2 or 4 items, unequal spans, or a different section type entirely |
| Every section centered | No rhythm, no spine | Alternate alignment; anchor to the grid |
| Emoji as icons | Platform-dependent, no accessible name, toy register | A real icon set, consistent stroke width |
| Stock `shadow-lg` on every card | Bypasses the kit's elevation ramp | `shadow-1…shadow-4`, and mostly `shadow-1` |
| Glass panel + blurred blobs, unprompted | Decoration doing the work of structure | Only if the kit sanctions it (`soft-glass`, `holographic`, `aurora-gradient`) |
| Uniform 24px padding everywhere | No density decision was made | The kit's density scale, varied by surface role |
| "Powerful. Simple. Fast." triads | Copy that survives find-and-replace of the product name | One concrete sentence about what it does |
| Icon + bold title + 2 grey lines, ×N | Content shaped by the component, not vice versa | Let content vary the component |
| Centered 3-stat band with big numbers | Filler where evidence belongs | Real numbers, or cut the band |

---

## Building

Order: **brief → kit (`design-system`) → materialize → structure → type → color → states → motion.**
Structure before decoration. If you are choosing a shadow before the grid is
settled, stop.

**Structure.** Block the page out in grey boxes first (mentally or in code with
borders only). If it doesn't work with zero color and one type size, color will
not save it.

**Type.** Set the display/body pairing and measure before any component
styling. Check: does the hierarchy survive in greyscale? If not, it is carried
by color and will die in dark mode and for low-vision users.

**Color.** Apply the 60/30/10 split from the brief. Count your accent uses per
screen — if it is more than 3, it is not an accent.

**States.** Every interactive element: default · hover · `:focus-visible` ·
active · disabled · loading. Every data surface: empty · loading · error ·
populated · *too much data*. The empty state is where a product's voice shows
— it is the cheapest place to earn the signature move.

**Motion.** Motion clarifies causality (where did this come from, what changed).
If you cannot name what a transition explains, delete it.

Depth references, loaded on demand:

- `skill` ({ name: "design-craft", resource: "references/composition.md" }) — layout archetypes beyond hero+cards, asymmetry, rhythm, grid breaks
- `skill` ({ name: "design-craft", resource: "references/typography.md" }) — pairing, scale ratios, measure, optical corrections
- `skill` ({ name: "design-craft", resource: "references/color.md" }) — OKLCH craft, 60/30/10, dark-mode re-tuning, accessible accents
- `skill` ({ name: "design-craft", resource: "references/copy.md" }) — UI voice, empty states, error text, the banned register

---

## Currency

Platform facts rot. Before asserting that a CSS/HTML capability is or isn't
available, load `web-platform-baseline` — it carries dated, refreshable facts
and a staleness rule. Never assert browser support from memory.

---

## Before saying you're done

- `.design/brief.md` exists, and the built UI matches it (including anti-goals).
- `design {action:"verify"}` clean — **including zero `composition` findings**.
- Greyscale test: hierarchy survives with color removed.
- Squint test: the page has a focal point per screenful, not an even mat.
- No two adjacent sections share a skeleton.
- Accent used ≤3 times per screen.
- Every state shipped, empty state has real voice.
- Signature move present, and you can name it in one sentence.
- Real copy everywhere — no filler, no placeholder voice.

## Skills in scope

- `design-system` — kit commitment, tokens, materialize, token-drift verify. Always run it; this skill sits on top.
- `design-critique` — post-build audit and scored rubric when the UI already exists
- `web-platform-baseline` — dated modern CSS/HTML facts and the staleness rule
- `react-modern` — component patterns that consume the tokens
- `research-web` — refreshing a stale platform or ecosystem claim
- `output-standards` — `<nextsteps>` shape when reporting design work
