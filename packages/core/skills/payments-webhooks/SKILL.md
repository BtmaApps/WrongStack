---
name: payments-webhooks
description: "Implement payment-provider integration and reliable authenticated webhook processing for an owned application. Use when building checkout, subscriptions or billing reconciliation; separate payment events, entitlement state and provider verification."
trigger: "Implement payment-provider integration and reliable authenticated webhook processing for an owned application. Use when building checkout, subscriptions or billing reconciliation; separate payment events, entitlement state and provider verification."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "product"
---

# Payments Webhooks

## Selection card
- Task: Implement signed, idempotent payment callbacks.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Payment integrations and billing webhooks require integer minor-unit money handling, cryptographic webhook signature verification against the unparsed raw request body, atomic event deduplication, monotonic subscription/entitlement state machines, and deterministic idempotency keys on outbound provider mutations.

Checked Stripe Node SDK target: 23.0.1 on 2026-10-23. Provider API version is a separate contract; inspect account/API compatibility and official migration notes before upgrades.

## Rules

1. Represent monetary amounts as integer minor units (e.g., cents) paired with an explicit ISO-4217 currency code, and calculate prices/discounts on the server—never trust client-submitted totals or price IDs without server allowlist validation.
2. Verify webhook signatures (`stripe.webhooks.constructEvent`) against the exact raw HTTP request bytes (`Buffer` / `req.text()`) and timestamp tolerance before parsing or acting on the payload.
3. Deduplicate inbound webhook `event.id` values atomically in persistent storage (`INSERT ... ON CONFLICT DO NOTHING`) and design state transitions to tolerate out-of-order delivery (e.g., `customer.subscription.deleted` arriving before `updated`).
4. Pass deterministic `idempotencyKey` values (scoped to business operation + parameter hash) on outbound charge/refund/subscription mutations and reconcile ambiguous timeout-after-commit outcomes before generating a new key.
5. Treat browser checkout return URLs (`?success=true&session_id=...`) as UX status hints only; provision entitlements from verified server-side payment/subscription state or signed webhooks.
6. Use sandbox keys and local signed webhook fixtures for automated verification; never execute live charges, refunds, or pricing changes without explicit authorization.

## Core Patterns & Pitfalls

- **Atomic Webhook Ledger & Monotonic State**: Record `(provider, event_id, status, received_at)` in a unique table inside the same database transaction as the entitlement update (or mark the event `processing` with a stale-lock timeout before enqueueing) and compare provider resource timestamps/status transitions so older events never overwrite newer subscription states.
- **Raw Body Preservation**: Ensure body-parsing middleware does not consume or re-serialize the webhook route's payload before signature verification runs.
- **Anti-pattern — Provisioning Only on Redirect Return**: Users frequently close the browser tab before redirecting back from checkout or asynchronous payment methods; relying solely on the return page loses paid entitlements, while trusting an unverified return query string allows unpaid access.

## Workflow

1. Inspect current billing models, provider SDK/API version and event handling.
2. Specify state transitions and reconciliation rules.
3. Implement verified inbound events and atomic application mutations.
4. Test invalid signatures, replay, ordering, partial failure and ambiguous retries using local/sandbox inputs.
5. Verify checkout/entitlement experience and report sandbox versus live evidence separately.

## Before returning

- [ ] Provider SDK version and pinned provider API version verified for compatibility
- [ ] Webhook signature verified against raw request bytes with replay/timestamp checks
- [ ] Event deduplication (`event.id`) and out-of-order subscription/payment transitions handled atomically
- [ ] Outbound provider mutations carry deterministic idempotency keys and server-validated amounts/currencies
- [ ] Invalid signatures, duplicate deliveries, and out-of-order events covered by sandbox/fixture tests

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Stripe webhooks](https://docs.stripe.com/webhooks), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

## Skills in scope

- api-design — raw-body webhook route configuration, `2xx` ack vs `5xx` retry status codes, and idempotency headers.
- database-migrations — design and verify schema migrations, bounded backfills and deployment compatibility for databases.
- queues-jobs — implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
