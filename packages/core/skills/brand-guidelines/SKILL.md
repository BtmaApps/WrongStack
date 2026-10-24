---
name: brand-guidelines
description: "Apply WrongStack's official brand identity, typography tokens, color palette, and design standards across UI components, presentations, and documentation. Use when styling brand collateral, developer marketing surfaces, or verifying visual alignment with WrongStack design specifications."
version: 1.1.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
trigger: "styling brand collateral, developer marketing surfaces, or verifying visual alignment with WrongStack design specifications."
metadata:
  routing-group: design
---

# Brand Guidelines — WrongStack

## Selection card
- Task: Apply WrongStack brand identity, colors, and typography.
- Start: Identify target medium (web, slides, README, social card) and apply official brand tokens.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

The WrongStack brand reflects high-velocity engineering, technical rigor, and aesthetic anti-slop.
Visuals emphasize precision, functional density, terminal aesthetics, and disciplined negative space.
Never use clichéd purple/indigo gradients or generic corporate clip-art.

## Brand Tokens

### Color Palette

| Token | Hex | Role | Usage |
|---|---|---|---|
| `--ws-obsidian` | `#090D12` | Deep Canvas | Primary dark mode background |
| `--ws-surface` | `#111822` | Container Surface | Cards, sidebars, terminal windows |
| `--ws-surface-elevated` | `#182230` | Elevated Surface | Menus, popovers, active selection |
| `--ws-border-subtle` | `#1F2937` | Structural Border | 1px hairline component boundaries |
| `--ws-text-primary` | `#F3F4F6` | High-Contrast Text | Headlines, titles, essential data |
| `--ws-text-secondary` | `#9CA3AF` | Supporting Text | Body copy, descriptions, captions |
| `--ws-text-muted` | `#6B7280` | Technical Meta | Timestamps, metadata, commit hashes |
| `--ws-accent-phosphor` | `#10B981` | Primary Accent | Terminal phosphor green; success states |
| `--ws-accent-amber` | `#F59E0B` | Secondary Accent | Warning, attention, highlights |
| `--ws-accent-crimson` | `#EF4444` | Critical Accent | Breaking changes, errors, alerts |

### Typography

- **Display & Headlines**: *Cabinet Grotesk* or *Geist* (Bold / Heavy, tracking: -0.02em).
- **Body & Prose**: *Geist* or *Plus Jakarta Sans* (Regular / Medium, 15px/24px line height).
- **Code & Metadata**: *Geist Mono* or *JetBrains Mono* (Regular, uppercase tags tracking: 0.05em).

## Voice, Visual Personality & Anti-Patterns

1. **Precision & Grounding**: Concrete technical specs, verifiable metrics, and observable code over corporate buzzwords or vague superlatives.
2. **Hairline Frames & Badges**: 1px crisp borders (`--ws-border-subtle`), pill-shaped version badges (checked 2026-10-23: Tailwind CSS 4.3.3 `@theme` token alignment), and monochrome metadata stamps with `tabular-nums` for metrics and latency tables.
3. **Contrast & Accent Discipline**: Maintain WCAG AAA contrast (`>= 7:1`) for body copy on obsidian surfaces (`#F3F4F6` on `#090D12` is `17.4:1`). Reserve `--ws-accent-phosphor` (`#10B981`) for primary actions, live status dots, and key metric deltas (< 10% of surface area); never flood entire card backgrounds with saturated green, amber, or crimson.
4. **Anti-Patterns**: Never combine glassmorphic blur soup with neon purple/cyan drop shadows, never center-align multi-line technical prose, and never substitute arbitrary gray hex literals where `--ws-surface` or `--ws-border-subtle` tokens apply.

## Skills in scope

- `design-system` — semantic design tokens, component variants, and CSS-first variables
- `theme-factory` — multi-theme chromatic palettes and font pairings
- `design-critique` — anti-slop visual audit and accessibility contrast checks

## Acceptance checks

- [ ] Color applications adhere strictly to the `--ws-obsidian`, `--ws-surface`, and `--ws-accent-phosphor` brand palette.
- [ ] Typography specifies official font pairings (*Cabinet Grotesk* / *Geist* / *Geist Mono*) with explicit tracking, weight, and `tabular-nums` tokens.
- [ ] Composition avoids generic AI aesthetic tropes (no purple/indigo mesh gradients or floating glass blob cards).
- [ ] Text-to-surface contrast meets WCAG AA/AAA thresholds and deliverables apply WrongStack hairline frames and metadata badges consistently.
