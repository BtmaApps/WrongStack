---
name: astro-modern
description: "Build and upgrade Astro content sites and applications with deliberate islands, content contracts and rendering modes. Use when implementing Astro pages, content collections or on-demand routes; avoid hydrating the entire page for small interactions."
trigger: "Build and upgrade Astro content sites and applications with deliberate islands, content contracts and rendering modes. Use when implementing Astro pages, content collections or on-demand routes; avoid hydrating the entire page for small interactions."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: frontend
  domain: "web"
paths: ["*.astro", "astro.config.*"]
---

# Astro Modern

## Selection card
- Task: Astro content sites and islands.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Astro defaults to zero-JavaScript server-rendered HTML with opt-in client islands (`client:load`, `client:visible`, `client:idle`, `client:only`), typed Content Layer collections, and route-level prerendering or on-demand server rendering. Keeping bundles lean requires pushing layout, data loading, and static markup into `.astro` components while isolating interactive widgets to explicit islands.

Checked 2026-10-23: Astro 7.4.2. Verify the current runtime/adapter and UI integration versions before install or migration.

## Rules

1. Decide static versus on-demand rendering (`prerender = false`) from real data freshness and authentication needs.
2. Hydrate only interactive islands with the correct client directive and supported UI integration.
3. Keep content schemas (`src/content.config.ts`) and routes explicit; labels/demo claims must reflect actual supplied content.
4. Validate/authorize Astro Actions and server endpoints, and isolate request-private data.
5. Verify asset paths, base-path configuration, image/font handling, links and metadata in the emitted deployment shape.
6. Do not treat local development routing as proof that a static host or adapter supports the same behavior.

## Core Patterns & Pitfalls

- **Island Granularity**: Pass serializable props into narrow UI framework islands (`client:visible` for below-the-fold widgets, `client:load` for immediate controls) rather than wrapping entire page layouts in a hydrated React/Vue/Svelte tree.
- **Content Layer & Actions**: Define Zod schemas in `src/content.config.ts` and validate user mutations through `defineAction()` in `src/actions/index.ts` with explicit input schemas and server auth checks.
- **Anti-pattern — Unscoped Script/Style Leakage**: Inline `<script>` tags in `.astro` components execute in the browser and may need `astro:page-load` listener cleanup when View Transitions / ClientRouter is enabled.

## Workflow

1. Inspect config, content model, islands and deployment adapter.
2. Resolve current compatible targets and implement the requested route/content flow.
3. Check generated/direct routes, navigation and interactive island states.
4. Validate content schemas, asset URLs, metadata and supported server behavior.
5. Build and exercise the actual preview/production adapter.

## Before returning

- [ ] Static vs on-demand (`prerender`) rendering mode matches route freshness and auth requirements
- [ ] Client directives (`client:*`) applied only to interactive islands with serializable props
- [ ] Content collection schemas and Astro Actions/endpoints validated at the boundary
- [ ] Production build and adapter preview verified for asset paths, headers, and dynamic routes

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Astro docs](https://docs.astro.build/), [On-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/).

## Skills in scope

- design-craft — establish visual direction, typography, composition, and responsive rhythm for Astro pages and landing sections.
- web-performance — measure and improve web loading, responsiveness and visual stability with browser traces and representative workloads.
- accessibility — implement and review accessible user interfaces with semantic controls, keyboard and focus behavior, readable content and assistive-technology checks.
- ci-cd — build and repair reproducible CI and deployment workflows with explicit artifacts, permissions and release gates.
