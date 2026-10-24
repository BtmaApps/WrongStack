## Fail-closed allow-switch precedence — proven [applied 4×, 4 ok]

- When a broad allow-everything mode meets user-written rules, evaluate refusals first and fail closed on anything unevaluatable: keep `denyUnevaluated` before the YOLO+ auto-allow in `packages/core/src/security/permission-policy.ts` and the fail-closed throw in `packages/providers/src/catalog-provider-routing.ts`; replicate this ordering in any new allow-everything mode so it can never silently outrank a user refusal.

## Provider credential surfaces

- Import `endpointCredentialsSuppressed` from `packages/providers/src/endpoint-credentials.ts`; never re-implement it inline. Any missing surface reopens `WS-2026-09-26-01`.

## HQ audit ring — `seed()` ordering

## WS eviction — `packages/cli/src/hq-server/ws.ts`

- Reject eviction claims unless `sameCredential` matches; only then apply `clients.delete` + `close(4001)` or undelivered-command inheritance.
- Do not flag the `readyState === OPEN` gate on the `4003` refusal — deliberate rotated-token-reconnect design.
- Treat `ws.on('close')` as primary dead-holder removal, not the TTL sweep.
