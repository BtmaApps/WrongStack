---
name: cloudflare-workers
version: 1.0.2
description: "Build and maintain Cloudflare Workers with typed bindings, explicit compatibility and isolated validation. Use when implementing Workers handlers, integrating KV/R2/D1/Durable Objects/Queues or configuring Wrangler; deployment remains governed by the user task and target environment."
trigger: "implementing Workers handlers, integrating KV/R2/D1/Durable Objects/Queues or configuring Wrangler; deployment remains governed by the user task and target environment."
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run, web.research]
metadata:
  routing-group: operations
paths: ["wrangler.{toml,json,jsonc}"]
---

# Cloudflare Workers

## Selection card
- Task: Implement Cloudflare Workers bindings and deployment.
- Start: Identify the authorized target, current health and rollback boundary.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Latest checked 2026-10-23: Wrangler 4.152.0 and workers-types 5.20261023.1.
Refresh before installation. Wrangler-generated types and compatibility dates
should match the project's actual bindings and runtime, not a guessed Node API set.

## Rules

1. Inspect wrangler.jsonc/toml, compatibility_date/flags, environments and bindings.
   Identify which resources local, preview and production configurations target.
2. Use bindings and secret configuration; avoid embedding credentials or manually
   constructing access to a bound service when the binding already supplies it.
3. Keep request state request-local. Isolate reuse does not guarantee durable
   global storage; choose the persistence product by consistency/coordination needs.
4. Consume or cancel response bodies, bound upstream I/O and stream large output
   where appropriate. Use waitUntil for supported deferred work, not unhandled promises.
5. Check platform limits and runtime compatibility for packages. nodejs_compat
   is a compatibility surface, not a promise that every Node package works.
6. Test with the configured Worker runtime. Node-only unit tests do not establish
   binding or production-runtime behavior.

## Workflow

1. Define the request/queue/scheduled contract, binding types and failure behavior.
2. Run Wrangler type generation and local checks with project commands.
3. Test success, upstream failure, cancellation and binding interactions using
   isolated resources. Validate idempotency for retried jobs.
4. Inspect the deploy bundle/config before any authorized deployment.
5. For an authorized release, verify the exact environment, deployed version,
   health and rollback. Report local and live evidence separately.

## Core Patterns & Pitfalls

- **Storage Selection Matrix**: Match Cloudflare primitives to consistency needs—KV for read-heavy eventually consistent configuration/edge lookups, D1 for relational SQL queries, R2 for large unstructured blobs/streams, Queues for buffered background processing, and Durable Objects (SQLite-backed) for strongly consistent per-entity coordination, rate limiting, and WebSockets (`ctx.acceptWebSocket`).
- **Stream & Subrequest Discipline**: Always consume or `await resp.body?.cancel()` unused upstream subrequest bodies so concurrent connection slots are freed, and wrap fire-and-forget telemetry/cache writes in `ctx.waitUntil(promise)`.
- **Anti-pattern — Assuming Isolate Memory is Durable or Private**: Module-level variables may be evicted at any instant or reused across different users' requests on the same edge isolate; never store per-request auth context or uncommitted durable state in global variables.

## Sources

[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Acceptance checks

- [ ] `wrangler.jsonc` / `wrangler.toml` `compatibility_date`, flags, and generated `Env` binding types verified
- [ ] Per-request state isolated from global isolate memory and background promises registered with `ctx.waitUntil()`
- [ ] Upstream subrequest bodies consumed or cancelled and large payloads streamed without isolate memory spikes
- [ ] Local workerd runtime tests (`wrangler dev` / Vitest pool workers) separated from live deployment verification

## Skills in scope

- api-design — Edge HTTP caching headers, request validation, and streaming response contracts.
- database-migrations — D1 SQLite schema migrations, batch queries, and backward-compatible rollouts.
- observability — Workers Tail logs, Analytics Engine metrics, and OpenTelemetry trace export.
- ci-cd — Wrangler version uploads, gradual deployments, and preview environment gates.
