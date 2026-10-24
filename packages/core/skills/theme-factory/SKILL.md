---
name: theme-factory
description: "Apply curated, professional font pairings, chromatic palettes, and design themes to slide decks, web artifacts, landing pages, and documentation. Use when establishing a distinct visual identity, selecting cohesive color palettes, or applying thematic styling across user-facing artifacts."
version: 1.1.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
trigger: "establishing a distinct visual identity, selecting cohesive color palettes, or applying thematic styling across user-facing artifacts."
metadata:
  routing-group: design
---

# Theme Factory — WrongStack

## Selection card
- Task: Select, generate, and apply cohesive visual themes across artifacts.
- Start: Identify the target audience, artifact medium (web, slides, doc), and desired mood.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Theme Factory delivers production-ready visual themes composed of exact hex palettes,
type pairings, elevation scales, and semantic tokens. It eliminates bland default styling
and ensures cohesive branding across web components, presentations, and documents (checked 2026-10-23: Tailwind CSS 4.3.3 `@theme` variables and WCAG 2.2 contrast standards).

## Curated Theme Library

1. **Swiss Modernist (Clarity & Rigor)**
   - Headings: *Neue Haas Grotesk* or *Inter Tight* (Bold, tight tracking: -0.02em)
   - Body: *Inter* or *Helvetica Now* (Regular, line-height: 1.6)
   - Palette: Canvas `#F4F4F0`, Surface `#FFFFFF`, Text `#111111`, Accent `#E63946`, Muted `#71717A`
2. **Editorial Literary (Depth & Prestige)**
   - Headings: *Playfair Display* or *Fraunces* (Semi-bold, optical size tuned)
   - Body: *Source Serif 4* or *Newsreader* (Regular, line-height: 1.7)
   - Palette: Canvas `#FAF7F2`, Surface `#FFFFFF`, Text `#1A1A1A`, Accent `#8C2D19`, Muted `#736B5E`
3. **Cyber Minimalist (Engineering & Precision)**
   - Headings: *Geist Mono* or *JetBrains Mono* (Medium, uppercase, tracking: 0.05em)
   - Body: *Geist* or *Plus Jakarta Sans* (Regular)
   - Palette: Canvas `#0A0D12`, Surface `#121721`, Text `#E6EDF3`, Accent `#00FF66`, Border `#1F2937`
4. **Neo-Brutalist (Bold & Irreverent)**
   - Headings: *Cabinet Grotesk* or *Space Grotesk* (Extrabold, hard shadows)
   - Body: *Space Mono* or *Public Sans*
   - Palette: Canvas `#FFFDF5`, Surface `#FFFFFF`, Text `#000000`, Accent `#FFE600`, Border `#000000` (2-3px solid)
5. **Warm Craft Organic (Human & Mindful)**
   - Headings: *Recurso Sans* or *Outfit* (Medium)
   - Body: *DM Sans* or *Mulish*
   - Palette: Canvas `#F9F6F0`, Surface `#FFFFFF`, Text `#2C2723`, Accent `#D97706`, Sage `#059669`

## Theme Token Schema (CSS Variables / Tailwind)

```css
:root {
  --theme-bg-canvas: #0A0D12;
  --theme-bg-surface: #121721;
  --theme-border: #1F2937;
  --theme-text-primary: #E6EDF3;
  --theme-text-secondary: #8B949E;
  --theme-accent: #00FF66;
  --theme-accent-fg: #000000;
  --font-heading: 'Geist Mono', monospace;
  --font-body: 'Geist', sans-serif;
}
```

## Workflow & Guardrails

1. **Diagnose Context**: Assess tone (investor deck, developer tool, luxury publication, enterprise dashboard) and target lighting environment (dark-first vs. daylight-first).
2. **Select or Synthesize Theme**: Choose from the curated library or generate a harmonious custom theme with verified WCAG 2.2 AA/AAA contrast ratios (`>= 4.5:1` normal text, `>= 3:1` large headings and UI boundaries).
3. **Export & Bind**: Inject tokens as CSS custom properties (`@theme` in Tailwind CSS 4.3.3), semantic surface/text/border variables, or PPTX master layouts. Never scatter raw hex codes across leaf components.

## Skills in scope

- `design-system` — scalable token architecture, component variants, and Tailwind CSS 4 integration
- `brand-guidelines` — official WrongStack obsidian/phosphor brand identity
- `accessibility` — WCAG 2.2 AA/AAA contrast verification and forced-colors resilience

## Acceptance checks

- [ ] Contrast ratios for text-to-background and interactive boundaries satisfy WCAG 2.2 AA (`>= 4.5:1` body, `>= 3:1` headings/UI).
- [ ] Typography pairings specify distinct heading, body, and monospace typefaces with concrete weights, line-heights, and tracking.
- [ ] Theme tokens are fully mapped to semantic roles (`canvas`, `surface`, `border`, `text-primary`, `text-secondary`, `accent`, `accent-fg`).
- [ ] Artifact reflects the selected theme consistently across all components and states without raw hex overrides.
