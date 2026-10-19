---
name: design-reference-read
description: |
  Read a reference website or screenshot the way a designer does — by measuring it. Produces a dated "design DNA" record (color roles, type scale and ratio, spacing unit, radii, elevation, motion, section rhythm per viewport, component geometry, declared tokens) with measured and inferred values kept apart, names the patterns it uses by design-patterns ids, and turns the lessons into a brief or Design Studio tokens without copying the brand.
  Triggers: "make it look like <site>", "use this site as reference", "inspired by", "analyze this site's design", "what makes this design good", "extract the design system from", "match this screenshot", "steal like an artist", "reverse-engineer the styling of", "design tokens from this URL", "how does <site> do its layout".
version: 1.0.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [browser.interact, web.research, verification.run]
trigger: "Measure a reference website or screenshot into a design DNA record (color roles, type scale, spacing unit, radii, motion, section rhythm, components), name its patterns, and carry the lessons into a brief or tokens without copying the brand."
metadata:
  routing-group: design
---

# Design Reference Read — WrongStack

Looking at a screenshot and describing it ("clean, modern, lots of whitespace") is
where models differ most and where they invent most. Measuring it is not. This
skill replaces the description with numbers taken from the rendered page, so a
small model and a frontier model leave with the same facts, and the fidelity of
the result can later be scored against the same numbers.

## Selection card
- Task: Turn a supplied reference (URL or screenshot) into measured design decisions.
- Start: The reference, what the user wants from it (match, borrow, or analyze), and the target surface.
- Finish: `.design/references/<slug>/dna.md` read and cited, patterns named by id, lessons recorded in the brief, no brand assets copied.

## 1. Decide what the reference is for

Ask only if the request does not say which of these it is:

| Intent | What you take | What you leave |
|---|---|---|
| **Match** ("make it look exactly like this", a client's own site, a design handoff) | Measured values literally, per viewport | Nothing that the user owns or licensed |
| **Borrow** ("inspired by", "feel like") | Decisions: ratio, unit, density, rhythm, elevation strategy, motion timing, pattern ids | Exact palette, logo, imagery, copy, signature illustration, licensed fonts |
| **Analyze** ("why does this work") | The record plus the principles it shows | Implementation |

Borrowing a whole palette and font from a third-party brand is copying, not
borrowing. Change at least the primary hue and the display face unless the user
owns the reference.

## 2. Measure

With browser capability:

```
design_reference {action:"extract", url:"https://example.com", viewports:[1440, 768, 390]}
```

- It opens one isolated browser session per viewport under the same network
  policy as browser_open, scrolls the page, samples the visible color area,
  measures computed type/spacing/radius/shadow/motion, finds the section
  rhythm, takes a first-screen screenshot per width, and writes
  `.design/references/<slug>/{dna.md, dna.json, raw.json, <width>.png}`
  (`.design/` is self-ignored by git).
- Add a third width (`768`) when tablet behavior matters. Measure each page
  type separately (home, pricing, docs, app screen); one URL is one page.
- A localhost or private address needs `/browser allow <origin>` first.
- The tool is hidden wherever outbound network is denied (restricted mode, a
  subagent without network capability): use the screenshot path below.

Without a browser, or for a supplied image: follow
`references/screenshot-measurement.md` and write the same record by hand,
marking every value `measured-from-image` and its pixel scale.

## 3. Read the record, then the screenshots

Open `dna.md`, then look at every `<width>.png`. The numbers cannot see imagery,
illustration style, copy voice or what the product shows, and the screenshots
cannot give you exact values. You need both.

Read in this order and write one line per item into your notes:

1. **Theme and roles** — bg, surface, fg, muted, primary, accent, border.
   `chromatic` share tells you how much color the page really uses; most strong
   references spend color on one action role and leave the rest neutral.
2. **Type** — families and which are loaded, body size/weight/line-height, the
   sizes in use, the inferred ratio, heading weight, display tracking. A ratio
   ≥ 1.33 with tight negative tracking reads editorial or bold; ≤ 1.25 with
   13–15px body reads dense product UI.
3. **Space** — the unit and how well it fits (`fits ≥ 80%` = a disciplined
   scale), section vertical padding, and the common values.
4. **Shape** — dominant radius, pill share, elevation style (`soft`, `hard`
   offset, `ring`, `none`), border width.
5. **Motion** — dominant duration and easing. Custom cubic-beziers are a
   deliberate decision worth borrowing; `ease` defaults are not.
6. **Layout per viewport** — container width, section count and the rhythm
   line (`height×columns[media side]`), the widest grid and whether it reflows,
   nav height and position.
7. **Declared tokens** — the site's own custom properties. When present they are
   the strongest evidence of intent; prefer them over inferred roles.
8. **Limits** — every note under "Limits of this measurement" is a caveat you
   must carry into the brief rather than smooth over.

Inferred values are labelled. Do not upgrade an inference into a fact in your
report ("the brand color is…") without saying it was inferred from buttons.

## 4. Name the patterns

Map the record's **Signals** line to pattern ids with
`references/signal-map.md`, then confirm each candidate against its
**Seen as** signals in the design-patterns catalog
(`skill({ name: "design-patterns", resource: "references/<file>.md" })`).
Name an id only when at least two of its signals are observed in the record or
the screenshots; otherwise write "resembles `<id>`" with the missing signal.
Never name a pattern from memory of the brand.

## 5. Extract the lessons

Write 3–7 lessons, each in this form, into `.design/brief.md` under References:

> `<slug>`: <decision> — evidence: <measured value> — apply as: <what changes in our surface>

Examples of the shape (values are illustrative, not from a real site):

- `acme-com`: one chromatic role only — evidence: chromatic 1% of area, primary
  on filled buttons — apply as: neutral surfaces, accent reserved for the primary action.
- `acme-com`: tight 4px rhythm — evidence: unit 4px fits 88%, section padding 96px —
  apply as: tune density to cozy, section spacing token 96px.

A lesson that has no measured evidence is a taste claim; keep it out or mark it
as an opinion.

## 6. Carry it into the build

- **Borrow:** pin the closest kit (`design {action:"list"}` → match its Best-for
  line to the lessons), then `tune` radius/density/motion toward the measured
  values. Leave the primary hue and display face your own.
- **Match:** pin the closest kit, then apply the `design {action:"set", …}` line
  the extract output printed. It scopes colors to the reference's theme and maps
  fonts, base size, radius ramp, duration and easing to Design Studio names.
  Run `design {action:"materialize"}`. Check font licensing before shipping a
  measured family; the overrides carry a generic fallback.
- Continue with the `design-craft` build loop. When matching, finish with the
  fidelity loop in `design-to-code` (`design_reference {action:"compare"}`).

## Acceptance checks

- `dna.md` exists for every page you cite, and its date and viewports are stated in the brief.
- Every cited value is from the record or labelled as an image measurement.
- Patterns are named by catalog id with at least two observed signals each.
- Lessons follow the decision/evidence/apply form; none relies on adjectives alone.
- For Borrow, the primary hue, display face, logo, imagery and copy are your own.
- Limits from the record are repeated where they affect a decision.

## Failure modes

| Failure | Correction |
|---|---|
| Describing the screenshot instead of measuring | Run extract, or measure the image per the reference file |
| Treating the first screen as the page | The record samples up to 8 screens; read the rhythm line |
| One viewport only | Measure 390px too; reflow is half of a layout |
| Copying the palette for "inspired by" | Borrow ratios and strategy, not hues |
| Trusting a declared font that never loaded | Check `loaded`; the notes say when it is uncertain |
| Naming bento/glass/brutalism from one cue | Two observed signals or "resembles" |
