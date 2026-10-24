---
name: graphql-development
description: "Build and evolve GraphQL schemas/resolvers with typed contracts, authorization and bounded query work. Use when implementing GraphQL APIs or client operations; use api-design for HTTP transport and preserve the chosen server/client framework."
trigger: "Build and evolve GraphQL schemas/resolvers with typed contracts, authorization and bounded query work. Use when implementing GraphQL APIs or client operations; use api-design for HTTP transport and preserve the chosen server/client framework."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["*.{graphql,gql}"]
---

# Graphql Development

## Selection card
- Task: Implement GraphQL schema and resolver contracts.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

GraphQL APIs expose a typed graph where clients select arbitrary nested fields and batch multiple operations. Reliable GraphQL engineering requires per-request `DataLoader` scoping to eliminate N+1 queries without cross-user cache leaks, field- and object-level authorization inside resolvers/domain services, query depth/complexity/pagination limits, and additive schema evolution.

Checked GraphQL.js stable target: 17.0.2 on 2026-10-23. Verify current published specification and server/plugin compatibility before upgrading; a draft specification is not automatically the deployed contract.

## Rules

1. Model schema nullability and domain errors intentionally: make fields non-null (`!`) only when resolver failure should null out the parent selection, and use typed union/payload result types for expected domain validation errors.
2. Authorize every object and sensitive field at the resolver/service boundary; an authenticated HTTP request or top-level query check does not authorize nested edges or arbitrary node IDs.
3. Bound query depth, complexity/cost, alias/batch counts, and list pagination (`first`/`after` or `limit` caps) against denial-of-service amplification.
4. Instantiate `DataLoader` instances per request inside the GraphQL context factory (keyed by authenticated viewer/tenant where visibility differs) and preserve exact input-key ordering and length in batch functions.
5. Make mutations atomic/idempotent with dedicated `*Input` and `*Payload` types, and re-verify authentication/authorization on long-lived GraphQL subscriptions.
6. Evolve schemas additively (`@deprecated(reason: "...")`) and verify persisted queries or generated client operations before removing fields or enum values.

## Core Patterns & Pitfalls

- **`DataLoader` Batch Invariant**: A `DataLoader<K, V>` batch function must return an array of the exact same length and order as its `keys` argument (`keys.map(k => map.get(k) ?? null)`), and must never be stored in a module-level singleton shared across users.
- **Masking Internal Exceptions**: Format unexpected resolver exceptions into safe `GraphQLError` extensions (`code`) at the server boundary rather than leaking raw SQL or stack traces in `errors[].message`.
- **Anti-pattern — Trusting Graph Traversal Without Node Auth**: Even if a user cannot query `user(id: "other")` directly, they may reach the same node via `organization.members` or `node(id: ...)` unless authorization lives on the underlying data/loader layer.

## Workflow

1. Inspect schema, resolvers, server version and registered client operations.
2. Resolve latest stable supported targets and define the contract change.
3. Implement validation/auth/data loading and public error semantics.
4. Test null/error paths, two-user isolation, query limits and representative operations.
5. Verify generated clients and actual transport/subscription behavior where applicable.

## Before returning

- [ ] Schema changes backward-compatible (`@deprecated` used before removal) and nullability blast radius reviewed
- [ ] Object- and field-level authorization enforced across root, nested, and `node` resolvers
- [ ] `DataLoader` instances scoped per request and batch functions preserve input key order/length
- [ ] Query depth, complexity, pagination caps, and error masking verified
- [ ] Generated client types/operations and two-user isolation tests pass

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[GraphQL specifications](https://spec.graphql.org/), [GraphQL.js](https://www.graphql-js.org/docs/).

## Skills in scope

- api-design — HTTP transport status codes, batching/persisted query policy, and rate limiting.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- realtime-systems — implement WebSocket, SSE or established realtime transports with explicit authentication, ordering and reconnect behavior.
