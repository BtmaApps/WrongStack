---
name: realtime-systems
description: "Implement WebSocket, SSE or established realtime transports with explicit authentication, ordering and reconnect behavior. Use when building live updates, presence or collaborative state; preserve snapshot reconciliation and bound connection resources."
trigger: "Implement WebSocket, SSE or established realtime transports with explicit authentication, ordering and reconnect behavior. Use when building live updates, presence or collaborative state; preserve snapshot reconciliation and bound connection resources."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: data
  domain: "data"
---

# Realtime Systems

## Selection card
- Task: Build ordered live updates and reconnection.
- Start: Identify the data owner, query/schema, consistency and recovery contract.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Realtime systems (WebSockets, Socket.IO, Server-Sent Events / SSE) push low-latency state changes over stateful connections that can drop, reconnect to a different server node, or stall behind reverse proxies. Reliable realtime engineering pairs stream events with monotonic sequence numbers and snapshot reconciliation so clients always converge on durable server truth after any disconnect.

Checked Socket.IO target: 4.8.4 on 2026-10-23. Inspect current transport/server/client/proxy support; SSE and WebSocket have different delivery and lifecycle behavior.

## Rules

1. Authenticate connection establishment AND re-verify user/tenant permissions on every room join, subscription topic, and inbound message; also handle mid-connection token expiry or session revocation.
2. Pair event streams with monotonic sequence/revision IDs (`id:` / `Last-Event-ID` in SSE, sequence numbers in WebSocket payloads) and a full-snapshot fallback whenever a reconnecting client falls outside the server's replay window.
3. Bound per-connection send buffers (`bufferedAmount`), message size, inbound rate limits, and reconnection backoff with random jitter to prevent thundering herds and slow-consumer OOM kills.
4. Keep ephemeral presence/typing/cursor state separate from durable database business records.
5. Fence connection replacements with a connection generation ID so late close/error callbacks from an old socket never clobber the newly active connection's state or listeners.
6. Treat incoming realtime payloads as untrusted data validated against schemas.

## Core Patterns & Pitfalls

- **Snapshot + Delta Reconciliation**: Buffer incoming realtime deltas while fetching an initial or post-reconnect snapshot at `revision = R`, apply the snapshot, and then apply only buffered deltas with `sequence > R`.
- **Connection Generation Fencing**: Assign a monotonic `connGen` token to each socket instance; in `onclose` / `onerror` / async auth callbacks, verify `if (this.currentGen !== connGen) return;` before mutating connection status or scheduling reconnects.
- **Anti-pattern — Proxy Buffering & Missing Heartbeats**: SSE and WebSocket connections silently stall or drop behind reverse proxies unless heartbeats/pings run regularly and SSE responses set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `X-Accel-Buffering: no`.

## Workflow

1. Map server/client/proxy and state reconciliation contract.
2. Implement auth/subscription and bounded event delivery.
3. Test disconnect/reconnect, duplicates, gaps, slow readers and token expiry.
4. Force stale events after a connection replacement and verify isolation.
5. Exercise real transport through the configured proxy and report actual delivery gaps.

## Before returning

- [ ] Connection, channel/room subscription, and mid-session revocation auth enforced per user/tenant
- [ ] Sequence numbers, replay window, and full-snapshot gap recovery implemented and tested
- [ ] Reconnection uses exponential backoff + jitter and fences stale socket close/message callbacks
- [ ] Slow-client backpressure, payload size limits, and listener/timer cleanup verified
- [ ] Proxy headers/upgrade/buffering (`X-Accel-Buffering: no`, WebSocket upgrade) verified where applicable

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Socket.IO docs](https://socket.io/docs/v4/), [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

## Skills in scope

- api-design — initial snapshot REST/RPC endpoints, event schema versioning, and rate-limit contracts.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
- reverse-proxy-tls — configure and troubleshoot reverse proxies, HTTPS, domains and upstream routing for an authorized application.
- testing — deterministic disconnect/reconnect, sequence-gap recovery, and stale-socket fencing tests.
