# Color

The kit owns the palette. This file is about *using* it — the part that stays
wrong even when every value is a token.

## 1. The 60/30/10 allocation

- **60%** dominant — the ground: `bg`, `surface`. Near-neutral.
- **30%** secondary — structure: borders, muted text, subtle fills.
- **10%** accent — the kit's `primary`, and it must stay scarce.

Practical rule: **count accent uses per screen. Three or fewer.** Primary
action, active nav state, one emphasis. An accent applied to every heading,
icon, badge and link is no longer an accent; it is a background.

## 2. Neutrals do the work

A convincing interface is mostly neutrals with a tuned temperature. The kit's
neutral ramp is not grey-by-accident — it usually carries a small chroma
(warm or cool) that ties it to the accent. Never substitute a pure `#808080`
family into a tuned neutral ramp; it reads dead next to chromatic neutrals.

## 3. OKLCH discipline

Kits express color in OKLCH because lightness is perceptually even there:

- **Lightness** is hierarchy. Two colors at the same L read as the same level
  regardless of hue.
- **Chroma** is emphasis. Saturated = loud. Muted text is lower L *and* lower C.
- **Hue** is identity. Keep hue stable across a ramp; vary L and C.

When you need a variant of a token (hover, pressed, subtle fill), derive it
rather than picking a new color: `color-mix(in oklch, var(--color-primary) 88%, black)`.
Deriving keeps the family coherent and survives a kit swap. Check availability
in `web-platform-baseline` before relying on it.

## 4. Dark mode is a re-tune, not an inversion

The single most common dark-mode failure is flipping the light palette:

| Light behavior | Dark equivalent |
|---|---|
| Surfaces sit *below* the page (shadow) | Surfaces sit *above* it (lighter, less shadow) |
| Pure white text | Softened — full-white on dark glares and blooms |
| Saturated accent reads well | Same accent often needs lower chroma, higher lightness |
| Shadows convey elevation | Elevation comes from surface lightness steps |
| Hairline borders at 8% black | Hairlines usually need more contrast, not less |

Both themes come from one token set — the kit already ships both. Never
hand-write a `dark:` variant with a literal.

## 5. Contrast as a floor, not a target

- Body text ≥4.5:1, large text and meaningful UI edges ≥3:1 (WCAG 2.2 AA).
- Check the accent against *both* themes' backgrounds — an accent that passes on
  paper-white often fails on a dark surface.
- Disabled states still need to be perceivable; "low contrast" is not
  "invisible".
- Focus indicators have their own contrast requirement against adjacent colors.

## 6. Semantic color

- Success/warning/danger come from the kit's semantic tokens, not from
  `green-500`.
- **Never carry meaning by color alone** — pair with an icon, a label, or a
  shape. This is an accessibility requirement and also makes the UI readable in
  greyscale.
- Danger is the one place to break accent scarcity: destructive actions may be
  loud.

## 7. Gradients

Gradients are legitimate when the kit is built on them (`aurora-gradient`,
`holographic`, `liquid-metal`) and a liability otherwise. Even then:

- Background, not text. Gradient-filled headlines are the single most
  recognizable generated-UI tell.
- Two stops from the same hue family, or adjacent hues. Purple→blue across the
  wheel is the generated default.
- Interpolate in OKLCH to avoid the grey dead-zone mid-gradient.

## 8. Elevation

Pick one strategy and hold it:

- **Border-first** (flat, precise, tool-like): hairline borders, shadow only for
  true overlays (menus, dialogs).
- **Shadow-first** (soft, physical): the kit's `shadow-1…4` ramp, tuned per
  theme, borders rare.

Stacking a strong border *and* a strong shadow is the tell that neither was
chosen. In practice most surfaces need `shadow-1` or nothing; reserve `shadow-3+`
for things that genuinely float above the page.

## Checks

- Count accent uses on the busiest screen — ≤3?
- Remove all color: does hierarchy survive?
- Dark mode: re-tuned, or inverted?
- Any color-only meaning left?
- One elevation strategy, or two stacked?
- Any gradient on text?
