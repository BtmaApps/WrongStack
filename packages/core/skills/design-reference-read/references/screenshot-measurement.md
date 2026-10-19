# Measuring from a screenshot

Use when there is no browser, the network is locked, the reference is an image
(mockup, Dribbble shot, PDF page), or a login wall blocks extraction. The goal
is the same record as `dna.md`, with every value marked `measured-from-image`.

## 0. Establish the scale

- Record the image size in pixels and what it shows (full page, first screen, a
  component). Device-pixel-ratio is unknown: find a known dimension first.
- Anchor candidates, best first: a stated viewport width (e.g. the image is a
  1440px frame), visible browser or device chrome of known size, then a standard
  control height (most buttons are 36–48 CSS px — the weakest anchor).
- Write: `scale: 1 CSS px = <n> image px (anchor: <what>)`. If no anchor is
  defensible, report proportions only (ratios, column counts) and say so.

## 1. Color

- Sample, do not guess: if an image tool or code execution is available, load
  the image and count pixel colors (quantize to 32 levels per channel, ignore
  anti-aliasing by dropping colors under 0.2% of pixels). Report the top colors
  with their area share — the same shape as the extractor's Visible area line.
- Without pixel access, name only the colors you can see in large flat areas and
  label them `approximate`; do not produce hex values you could not read.
- Roles: background = largest flat area; fg = body text; primary = filled
  primary button; accent = other saturated color with a different hue.

## 2. Type

- Measure cap height or the height of a capital letter in pixels; font size ≈
  cap height ÷ 0.7 (typical sans) — state the assumption.
- Measure 3–5 distinct sizes (body, small label, subheading, heading, display),
  sort them, and compute the ratio as the geometric mean of successive steps.
- Identify families only by visible traits (serif/sans/mono, geometric/humanist,
  x-height). Name a specific font only when it is certain; otherwise "geometric
  sans similar to <x>".

## 3. Space, shape, layout

- Measure the gaps between repeated items and section paddings; find the largest
  unit (8, 6, 5, 4) that most values divide by.
- Radius: measure the corner arc on cards and buttons; note pill buttons.
- Elevation: blurred soft shadow, hard offset shadow, border-only, or flat.
- Layout: container width as a share of the image width, column count of each
  row, media side per section, and the order of sections top to bottom.

## 4. What an image cannot tell you

Motion, hover/focus states, responsive behavior at other widths, loaded fonts,
declared tokens, real contrast of text over images and interaction. List these
under "Limits" exactly as the extractor does; do not fill them from memory.
