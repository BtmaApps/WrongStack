---
name: sveltekit-modern
description: "Build and upgrade Svelte and SvelteKit applications with reactive state, server loads, actions and deployment adapters. Use when implementing Svelte components or SvelteKit routes; follow the current installed runtime and migration contract."
trigger: "Build and upgrade Svelte and SvelteKit applications with reactive state, server loads, actions and deployment adapters. Use when implementing Svelte components or SvelteKit routes; follow the current installed runtime and migration contract."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: frontend
  domain: "web"
paths: ["*.svelte", "svelte.config.*"]
---

# Sveltekit Modern

## Selection card
- Task: Svelte runes and SvelteKit actions.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Svelte 5 and SvelteKit 3 center on explicit rune reactivity (`$state`, `$derived`, `$effect`, `$props`) and strict separation between server-only modules (`+page.server.ts`, `+server.ts`, `$lib/server/*`, `$env/static/private`) and universal/client code. Reliable SvelteKit engineering requires keeping per-request state out of module singletons and pairing form actions with progressive enhancement.

Checked 2026-10-23: Svelte 5.57.2 and SvelteKit 3.1.0. SvelteKit 3.1.0 declares peer typescript ^6.0.0 while latest TypeScript is 7.0.2; verify adapter/runtime and peer requirements before upgrading.

## Rules

1. Distinguish component reactivity from server load/action execution; browser APIs cannot run in server paths.
2. Use current supported reactivity conventions (`$state`, `$derived`, `$props`) for new code; migrate legacy `export let` / `$:` code deliberately instead of mixing incompatible syntax in the same component.
3. Keep per-request private data out of module-global server state; pass user/session context via `event.locals` or Svelte context.
4. Serialize only appropriate load data and separate `$env/*/public` from `$env/*/private` environment variables.
5. Validate/authorize form actions and endpoints at the server boundary and return structured `fail(status, data)` feedback.
6. Scope stores/effects/subscriptions to ownership and guard stale async completion with cleanup callbacks or `AbortController`.

## Core Patterns & Pitfalls

- **Runes Discipline**: Express derived values with `$derived` / `$derived.by` rather than mutating `$state` inside `$effect`. Return a teardown function from `$effect(() => { ...; return () => cleanup(); })` whenever registering timers, listeners, or abortable requests.
- **Load vs Action Boundaries**: Use `+page.server.ts` `load` functions for authenticated data reads and `actions` for mutations; avoid mutating persistent state inside `load`.
- **Anti-pattern — Cross-Request State Leaks**: Never store user tokens, database transactions, or reactive `$state` singletons at module top level in server-rendered code.

## Workflow

1. Inspect routes, hooks, state conventions, adapter and lockfile.
2. Read migration deltas for crossed majors and establish the latest compatible target.
3. Implement loading/actions and visible states with existing components.
4. Test direct loads, navigation, hydration, errors and two-user isolation where private data exists.
5. Run configured checks and adapter production build/startup.

## Before returning

- [ ] Svelte/SvelteKit version, adapter target, and TypeScript peer constraints verified
- [ ] Server (`+page.server.ts`, `$lib/server`) and client/universal boundaries strictly separated
- [ ] No per-request auth or mutable state stored in module-level server singletons
- [ ] Runes (`$state`, `$derived`, `$effect` cleanup) free of circular state writes and leaked listeners
- [ ] Form actions, `fail()` validation states, SSR hydration, and adapter build verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Svelte docs](https://svelte.dev/docs/svelte/overview), [SvelteKit docs](https://svelte.dev/docs/kit/introduction).

## Skills in scope

- api-design — structure SvelteKit `+server.ts` endpoints, form action payloads, and error envelopes.
- typescript-strict — verify generated `./$types` route contracts (`PageServerLoad`, `Actions`, `RequestHandler`) and strict rune typing.
- design-system — create and maintain coherent visual tokens, themes and shared component states using the existing project system or WrongStack Design Studio.
- testing — test Svelte 5 components, server load/action handlers, and multi-user SSR isolation.
