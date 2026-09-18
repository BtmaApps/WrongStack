# Typography

Type carries hierarchy. When color carries it instead, the design dies in
greyscale, in dark mode, and for low-vision users — and it reads as generated,
because picking a color is easier than setting a ramp.

## 1. The pairing

Three roles, not three fonts necessarily:

- **Display** — headings, hero, numbers that matter
- **Text** — body, UI labels, long-form
- **Mono** — code, IDs, tabular data

Valid pairings:

| Strategy | When | Example shape |
|---|---|---|
| One superfamily, many weights | Tools, dashboards — maximum coherence | Text 400/500, display 600, same family |
| Neutral text + characterful display | Products needing a voice | Geometric or serif display over a neutral text face |
| Serif text + sans UI | Editorial, docs, long reading | Serif body, sans labels and chrome |

Rules:

- Start with few families and clear roles; add another only for a content or
  brand need. One well-used family can provide all the hierarchy a tool needs.
- When pairing, choose a purposeful relationship and check actual glyphs and
  weights rather than choosing famous font names from memory.
- The system owns the faces. The kit's `font` knob changes both sans and display;
  use `set` with `font-sans` and `font-display` for a deliberate pairing.

## 2. The scale

- Use the kit's ramp (`text-xs` … `text-3xl`). Do not invent sizes.
- Make hierarchy visible at the actual viewport. Expressive display type may
  need a large jump; compact tools can use weight, position and spacing instead.
- Most screens need 4–5 sizes, not 9. If you're using every step, the hierarchy
  is not decided.

## 3. Measure and leading

- Start long-form prose around 60–75 characters and test the actual language
  and font. This is not a width rule for labels, tables or numeric cells.
- Display measure 20–35 characters — headlines wrap on purpose.
- Leading is inverse to size: display tight (1.05–1.2), body relaxed
  (1.5–1.65), UI labels between.
- Leading is also inverse to measure: wider measure needs more leading.

## 4. Weight, tracking, case

- Emphasis = size + weight + color, together. `font-bold` alone is the reflex.
- Tracking: display tighter (−1% to −3%), body normal, small caps and
  all-caps labels opened up (+5% to +10%). Caps at default tracking are a tell.
- Avoid 700+ for body text; avoid 300 and below for anything small.
- Never fake italics or bold — if the family lacks the cut, choose another.

## 5. Numerals and tables

- Tabular figures in any column of numbers (`font-variant-numeric: tabular-nums`).
- Align numbers right, labels left, and keep the unit out of the number cell
  when it is constant.
- Use the mono face for IDs, hashes, versions — proportional digits in an ID
  are a readability bug.

## 6. Optical corrections

The details that separate typeset from placed:

- Optical alignment: quotes and bullets hang into the margin.
- Trim the first/last line box so headings sit on the grid (`text-box-trim`
  where available — check `web-platform-baseline`).
- `text-wrap: balance` on headings, `pretty` on paragraphs.
- Hyphenation off for UI, on for narrow-measure justified text (and prefer not
  to justify at all in UI).
- Avoid single-word last lines in headings; balance handles most of this.

## 7. Localization and real data

- Test with the longest real string, not "Dashboard".
- German compounds, Turkish dotted/dotless i casing, Arabic/Hebrew RTL mirroring
  if the product needs it.
- Never `text-transform: uppercase` a user-supplied name; casing rules are
  locale-specific.
- Truncation: decide per field (ellipsis, wrap, or two-line clamp) — silent
  overflow is a bug.

## 8. Loading the faces

- Subset and preload the display face; body face must have a real fallback
  stack that matches metrics (`size-adjust`) so there is no layout shift.
- Never block first paint on a webfont. `font-display: swap` unless the brand
  demands otherwise.

## Checks

- Greyscale: is hierarchy intact with all color removed?
- Is the measure between 60–75ch for body?
- Is there a visible jump between display and body?
- Are all-caps labels tracked out?
- Do numbers in tables align and use tabular figures?
- Longest real string tested at 320px?
