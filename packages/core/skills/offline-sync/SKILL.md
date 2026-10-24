---
name: offline-sync
description: "Implement offline-capable applications with local persistence, queued changes and explicit synchronization conflicts. Use when users must work without a stable connection or resume drafts across interruptions; define data ownership and conflict semantics before retrying writes."
trigger: "Implement offline-capable applications with local persistence, queued changes and explicit synchronization conflicts. Use when users must work without a stable connection or resume drafts across interruptions; define data ownership and conflict semantics before retrying writes."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: data
  domain: "product"
---

# Offline Sync

## Selection card
- Task: Reconcile offline edits, outboxes and conflicts.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Offline-capable and local-first applications (IndexedDB/OPFS on web, SQLite on mobile/desktop) let users read and mutate data across intermittent networks by separating committed server state, a persisted local mutation outbox, and optimistic UI projections. Reliable sync engineering requires client-generated UUIDs/idempotency keys, explicit conflict detection (`baseVersion` / ETags / field merges), and strict account-scoped local storage cleanup on logout.

Verify current persistence/sync libraries against the chosen browser/mobile runtime. Latest SDK versions do not define application conflict policy.

## Rules

1. Separate four states in storage and UI: last-known server truth, local pending outbox mutations, optimistic derived view, and failed/conflicted mutations requiring attention.
2. Assign every queued mutation a stable client-generated UUID (`mutationId` / idempotency key), target entity ID, `baseVersion` (or causal timestamp), and schema version so replays after network drop-after-commit are idempotent on the server.
3. Define conflict resolution per domain operation: field-level LWW/merge for independent properties, server-authoritative rejection (`409 Conflict` with current server record) for inventory/financial invariants, or explicit user merge prompts for collaborative drafts.
4. Partition local databases/caches by authenticated `userId` + `tenantId`, and purge or lock private local stores and pending outboxes on logout, session revocation, or account switch.
5. Do not equate `navigator.onLine` with server reachability; use bounded exponential backoff + jitter, pause replay on `401`/`403` until re-authenticated, and surface unsynced/conflict badges clearly in the UI.
6. Migrate persisted local schema and queued outbox entries safely across app version upgrades without silently dropping unsent user work.

## Core Patterns & Pitfalls

- **Ordered Outbox Replay & Compaction**: Replay dependent mutations for the same entity in causal order (or compact intermediate edits where domain rules permit) while keeping each mutation's `baseVersion` check intact.
- **Disconnect-After-Server-Commit**: When a client sends a mutation and the connection drops before receiving the `200 OK`, the subsequent outbox retry must hit the server's idempotency record and return the original committed result rather than duplicating the write or failing with a false conflict.
- **Anti-pattern — Cross-Account Local Cache Leakage**: Leaving IndexedDB or SQLite tables unpartitioned or uncleared when User A signs out and User B signs in on the same device leaks private records and replays User A's outbox under User B's session.

## Workflow

1. Map online/offline/interrupted states and which tasks must remain available.
2. Implement persistence and mutation queue using existing data boundaries.
3. Test disconnect before/after server commit, duplicate delivery and app restart.
4. Force two-client conflicts and verify the stated resolution behavior.
5. Exercise logout/account switch and migration of existing local state.

## Before returning

- [ ] Committed server state, persisted outbox queue, and optimistic UI state separated cleanly
- [ ] Outbox mutations carry deterministic `mutationId` idempotency keys and `baseVersion` preconditions
- [ ] Conflict resolution policy (`409` handling, merge, or user prompt) implemented and verified with two-client edits
- [ ] Local storage partitioned by account/tenant and cleared/fenced on logout or session expiry
- [ ] App restart mid-queue, disconnect-after-commit replay, and local schema migration verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## Skills in scope

- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- api-design — `Idempotency-Key` headers, `If-Match` / `baseVersion` precondition checks, `409 Conflict` payloads, and delta sync cursors.
- react-native-expo — build and upgrade React Native or Expo applications with navigation, native modules and verified platform integration.
- flutter-mobile — build and upgrade Flutter applications with typed state, navigation, platform plugins and device verification.
- testing — simulated offline/reconnect transitions, duplicate replay after commit, and two-client conflict tests.
