---
name: web-artifacts
description: "Build self-contained, interactive single-file or micro-bundled web artifacts, tools, calculators, dashboards, and prototypes with React, Tailwind CSS, and Lucide. Use when producing standalone interactive web applications or embeds that run frictionlessly in browsers without backend dependencies."
version: 1.1.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, browser.interact, web.research]
trigger: "producing standalone interactive web applications or embeds that run frictionlessly in browsers without backend dependencies."
metadata:
  routing-group: frontend
---

# Web Artifacts — WrongStack

## Selection card
- Task: Build standalone, self-contained interactive web applications and micro-tools.
- Start: Define the application state model, interactive mechanics, and single-file layout constraints.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Web artifacts are rich, client-side, self-contained interactive mini-apps (calculators, simulators,
data visualizers, generative audio/visual tools, administrative playgrounds) designed to run
completely within a single HTML file or sandboxed iframe without backend requirements.

## Anti-AI Slop Mandate

AI-generated interfaces frequently collapse into monotonous clichés. Strictly avoid:
- Centered, floating card layouts with uniform 12px or 16px radius on every border.
- Clichéd purple-to-blue or pink-to-indigo mesh gradients on dark slate backgrounds.
- Unmotivated default Inter font applied universally without typographic contrast.
- Superficial animated border glow effects that obscure functional controls.

Instead, execute intentional product aesthetics:
- Choose a deliberate personality: Industrial Terminal, Editorial Monocle, Scandinavian Utility, or High-Density Data Dashboard.
- Use asymmetric layouts, distinct split-panes, sticky control panels, or full-bleed responsive work surfaces.
- Employ expressive typography pairings (e.g., IBM Plex Mono with Fraunces or Geist with Cabinet Grotesk).

## Tech Stack & Architecture

- **Format**: Single-file HTML embedding React 19.3.1 (via ESM import map or bundled build) or modern vanilla web components (checked 2026-10-23).
- **Styling**: Tailwind CSS 4.3.3 (`@tailwindcss/browser` CDN or pre-compiled scoped styles).
- **Icons**: Lucide Icons (checked 2026-10-23: lucide-react 1.61.0 or standalone SVG embeds).
- **State Architecture**: Keep all state in memory or synced to `localStorage`/`URLSearchParams` so user input survives reloads.
- **Zero External Backend**: All computations, charting (SVG/Canvas), and exports (CSV, JSON, PNG) must run entirely client-side.

## Template Blueprint

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Web Artifact</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col font-mono">
  <header class="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
    <h1 class="text-sm font-semibold uppercase tracking-wider text-zinc-400">System Tool v1.0</h1>
    <div id="status" class="text-xs text-emerald-400 font-mono">● READY</div>
  </header>
  <main class="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
    <section class="lg:col-span-1 border border-zinc-800 rounded p-5 bg-zinc-900/50">
      <!-- Input Controls -->
    </section>
    <section class="lg:col-span-2 border border-zinc-800 rounded p-5 bg-zinc-900/50">
      <!-- Interactive Output Surface / Canvas / Visualization -->
    </section>
  </main>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>
```

## Skills in scope

- `react-modern` — React 19 state derivation, actions, and effect hygiene
- `design-system` — semantic CSS tokens and anti-slop component styling
- `webapp-testing` — headless Playwright verification of interactive user flows

## Acceptance checks

- [ ] Complete application runs standalone from a single HTML file or micro-bundle without backend or CORS failures.
- [ ] Zero AI-slop visual tropes; layout, surface hierarchy, and typography adhere to a deliberate design personality.
- [ ] All interactive controls (sliders, forms, keyboard shortcuts, buttons) trigger immediate, deterministic state updates.
- [ ] Client-side persistence (`localStorage` / URL state) and data export mechanisms function offline.
