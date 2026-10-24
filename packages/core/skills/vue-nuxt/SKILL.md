---
name: vue-nuxt
description: "Build and upgrade Vue or Nuxt applications with reactive state, server rendering and typed data boundaries. Use when implementing Vue components, composables or Nuxt routes; distinguish client-only Vue from Nuxt server/runtime features."
trigger: "Build and upgrade Vue or Nuxt applications with reactive state, server rendering and typed data boundaries. Use when implementing Vue components, composables or Nuxt routes; distinguish client-only Vue from Nuxt server/runtime features."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: frontend
  domain: "web"
paths: ["*.vue", "nuxt.config.*"]
---

# Vue Nuxt

## Selection card
- Task: Vue components and Nuxt server routes.
- Start: Locate the affected route/component and its runtime/lockfile.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Vue 3.5+ and Nuxt 4 combine Composition API reactivity (`ref`, `computed`, reactive props destructuring, `onWatcherCleanup`) with Nitro server routes (`server/api/*`) and SSR-aware data fetching (`useFetch`, `useAsyncData`). Reliable Vue/Nuxt engineering keeps reactivity links intact across composable boundaries and prevents cross-request state leakage during server rendering.

Checked 2026-10-23: Vue 3.5.44 and Nuxt 4.6.2. Refresh current stable versions, peer/runtime requirements and official migration notes before adding or upgrading.

## Rules

1. Identify Vue-only versus Nuxt, installed composition/options conventions and rendering mode (`ssr`, `routeRules`).
2. Preserve reactivity when destructuring reactive objects (`toRefs`, `defineProps` reactive destructure); prefer `computed()` derivation instead of mirrored mutable state.
3. Scope watchers/subscriptions and cancel stale async work via `onWatcherCleanup()` when inputs or component ownership change.
4. Keep request-private state isolated during SSR (`useState`, Pinia per-request stores); module singletons can leak across users.
5. Use supported Nuxt data/loading APIs (`useFetch` / `useAsyncData`) at setup top level and keep private secrets in `runtimeConfig` (never `runtimeConfig.public`).
6. Validate/authorize Nitro server operations (`readBody`, `getRouterParam`) independently of client route middleware and UI controls.

## Core Patterns & Pitfalls

- **Nuxt SSR Data Fetching**: Call `await useFetch()` or `await useAsyncData()` synchronously in `<script setup>` (not inside event handlers) to avoid double-fetching on hydration; use `$fetch` for client-triggered mutations.
- **Watcher Cleanup**: Use `onWatcherCleanup(() => controller.abort())` inside `watch` / `watchEffect` so rapid filter or route changes never apply out-of-order responses.
- **Anti-pattern — Module-Scope `ref()` in Nuxt**: Declaring `const currentUser = ref(null)` outside a composable or function shares state across concurrent SSR requests. Use `useState('user', () => null)` instead.

## Workflow

1. Inspect app config, composables, routing/data layer and workspace lockfile.
2. Resolve latest compatible targets and implement within existing conventions.
3. Exercise direct route load, navigation, error/empty states and mutation refresh.
4. Check hydration, account/locale isolation and repeated component cleanup.
5. Run configured type/lint/tests and production build/startup.

## Before returning

- [ ] Vue-only vs Nuxt architecture, directory layout, and rendering mode identified
- [ ] Reactivity preserved (`computed` over mirrored `ref` writes; `onWatcherCleanup` for async watchers)
- [ ] SSR state isolated via `useState` / Pinia without module-global mutable refs
- [ ] Nitro server routes validated and `runtimeConfig.public` verified free of secrets
- [ ] Hydration mismatches, navigation, typecheck, and production build verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Vue guide](https://vuejs.org/guide/introduction.html), [Nuxt docs](https://nuxt.com/docs/4.x/getting-started/introduction).

## Skills in scope

- typescript-strict — type `defineProps`, `defineEmits`, composables, and Nitro H3 event handlers strictly.
- design-system — create and maintain coherent visual tokens, themes and shared component states using the existing project system or WrongStack Design Studio.
- api-design — design Nitro `server/api` endpoints, validation schemas, and error payloads.
- testing — verify Vue components, composables, and Nuxt SSR hydration behavior in automated tests.
