---
name: web-performance
version: 1.0.2
description: "Measure and improve web loading, responsiveness and visual stability with browser traces and representative workloads. Use when diagnosing Core Web Vitals, slow routes, bundle growth, long tasks or animation jank; preserve functionality and compare matched before/after conditions."
trigger: "diagnosing Core Web Vitals, slow routes, bundle growth, long tasks or animation jank; preserve functionality and compare matched before/after conditions."
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
metadata:
  routing-group: frontend
---

# Web Performance

## Selection card
- Task: Measure and improve browser loading and interaction.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Optimize the measured bottleneck. Current Core Web Vitals are LCP, INP and CLS;
good thresholds are at most 2.5 seconds, 200 milliseconds and 0.1 respectively
at the 75th percentile. Field evidence and local lab runs answer different questions.

## Rules

1. Record route, commit/input state, build mode, device, network, cache and data.
   Development-server measurements are not production performance.
2. Trace the user's critical task before proposing changes. Separate network,
   server, main-thread, layout and rendering delay.
3. Prioritize the LCP resource, input blocking and unexpected layout shifts.
   Do not optimize a Lighthouse score while making the real interaction worse.
4. Compare equivalent conditions with repeated measurements. Report distributions
   and variability rather than a best run or invented percentage.
5. Keep analytics labels bounded and sensitive data out of performance telemetry.
6. Set budgets from product/device needs and an observed baseline. Avoid one
   universal bundle-size or fps mandate.

## Workflow

1. Build/run production and exercise a representative cold/warm user journey.
   Gather browser traces, network waterfall and available field metrics.
2. Identify the largest bottleneck with file/resource/call-stack evidence.
3. Apply a narrow change: resource priority, image sizing, route splitting,
   caching, rendering work or long-task decomposition as indicated.
4. Test the interaction, responsive behavior and accessibility after optimization.
5. Repeat the same measurement and report sample count, conditions, results
   and tradeoffs. Run affected build/tests.

## Core Patterns & Pitfalls

- **LCP (<= 2.5s p75)**: Eliminate waterfall chains on the hero element—ensure the LCP image or text node is discoverable in the initial HTML payload (`fetchpriority="high"`, no `loading="lazy"` on above-the-fold hero images, and preloaded critical fonts with metric-matched fallbacks).
- **INP (<= 200ms p75)**: Decompose long main-thread tasks (> 50ms) into smaller chunks (`scheduler.yield()`), avoid synchronous layout thrashing (interleaved DOM reads and style writes), and keep heavy third-party/analytics scripts off the interaction path.
- **CLS (<= 0.1 p75)**: Reserve explicit intrinsic dimensions (`width`/`height` or CSS `aspect-ratio`) on all media, embeds, and skeleton placeholders, and only animate compositor-friendly properties (`transform`, `opacity`).

## Sources

[Web Vitals](https://web.dev/articles/vitals), reviewed 2026-10-23.
Refresh thresholds and measurement tooling before consequential claims.

## Acceptance checks

- [ ] Production build measured under matched cold/warm network and CPU conditions before and after
- [ ] LCP, INP, or CLS bottleneck traced to a concrete waterfall resource, long task, or layout shift source
- [ ] Above-the-fold LCP element avoids `loading="lazy"` and client-only waterfall delays
- [ ] Multiple samples recorded (median/p75) with interactive behavior and accessibility preserved

## Skills in scope

- observability — Real User Monitoring (RUM) Core Web Vitals collection and attribution telemetry.
- nextjs-modern — SSR/streaming boundaries, image optimization, and server cache headers.
- motion-design — compositor-safe animations and main-thread frame budget discipline.
- threejs-3d — WebGL/WebGPU asset compression, draw-call batching, and canvas initialization latency.
