# Composition

How to give a screen a spine, a focal point, and rhythm — the three things the
default centered stack has none of.

## 1. Pick an archetype, not a page

Most generated layouts are the same archetype (centered marketing stack)
applied to problems that aren't marketing. Choose deliberately:

| Archetype | Spine | Focal point | Use when |
|---|---|---|---|
| **Operator console** | Sidebar + dense canvas | The data, always | Dashboards, admin, monitoring |
| **Editorial** | 8-col text measure, full-bleed media | The opening paragraph | Docs, articles, changelogs |
| **Canvas tool** | Chrome at the edges, work in the middle | The artifact being edited | Editors, builders |
| **Catalogue** | Grid with a filter rail | The items | Commerce, galleries, directories |
| **Focused task** | Single column, narrow, generous | The one input | Onboarding, checkout, auth |
| **Marketing** | Varied sections on a shared grid | The claim + proof | Landing pages |

Then the sections vary *within* the archetype — a marketing page is not six
copies of "centered heading + subtitle + cards".

## 2. Establish the grid before anything else

- Choose columns (12 is conventional; 8 is better for editorial; 6 for dense
  tools) and a gutter from the kit's spacing scale.
- Define the text measure (60–75ch) independently of the container width.
- Break the grid only when content priority or a chosen visual idea earns it.
  Symmetry is useful for comparable content; a grid break is not mandatory.
- Full-bleed is a deliberate act. Pick what earns it (a screenshot, a table, a
  quote) and let everything else respect the container.

## 3. Rhythm

Vertical rhythm is the strongest signal that a human made decisions:

- Group by proximity: related blocks tighter, unrelated blocks further apart.
  Equal gaps everywhere means no grouping information at all.
- Alternate density: a dense section reads as dense only if it follows a
  generous one.
- Use the kit's spacing scale steps, and use *different* steps. A page that
  only ever uses `p-6` made one decision, once.
- Section transitions: not every section needs a divider, a background change,
  or a heading. Vary the mechanism.

## 4. Focal point

Per screenful, one element should win. Rank by: size → contrast → position →
color → motion. The squint test settles it: blur the screen; whatever you still
see is the focal point. If nothing stands out, everything was given equal
weight — the classic even mat.

## 5. Breaking the grid (carefully)

The one deliberate break is often the signature move:

- An image or table extending past the container on one side only
- A heading hanging into the left gutter
- A card spanning two rows in an otherwise uniform grid, because it matters more
- An off-center hero with the supporting content in the shorter column

Rule: a break must be *repeatable* (it looks intentional because it recurs in
the same role) and *justified* (the content in it is genuinely more important).

## 6. Density

Density is a decision, not a side-effect:

- **Compact** — operator tools, tables, anything where scanning many rows is
  the job. Tighter leading, smaller controls, hairline dividers.
- **Cozy** — product UI, forms, settings.
- **Comfortable** — marketing, mobile, reading.

Set it once via the kit's `density` knob rather than by hand-picking padding
per component; hand-picked padding is where uniformity creeps back in.

## 7. Sections that aren't cards

When the reflex says "three cards", the alternatives:

- A comparison table (before/after, us/them, plan tiers)
- A numbered walkthrough with one real screenshot per step
- A single large screenshot with annotated callouts
- A quote with attribution and a real logo
- A live demo / interactive element
- A dense specification list (developer audiences prefer this to cards)
- A timeline or changelog excerpt
- One statistic, large, with its source

## 8. Mobile is not a narrower desktop

- Adapt ordering, disclosure and layout without removing essential tasks or information.
- The order changes: on mobile, the primary action usually rises.
- Touch targets ≥44px, and spacing between them grows, not shrinks.
- Test 320px with the longest real string in the product.

## Checks

- Can you name the archetype and the grid in one sentence each?
- Does the squint test find one focal point per screenful?
- Does repetition help comparison, or hide differences in content priority?
- Are any grid breaks justified by the content and stable on small screens?
- Do the gaps encode grouping, or are they all equal?
