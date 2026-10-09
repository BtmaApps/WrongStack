## Fail-closed precedence — proven [applied 4×, 4 ok]

- When a broad allow-switch meets user-written rules, evaluate refusals first and fail closed on anything unevaluatable. Keep `denyUnevaluated` before the YOLO+ auto-allow in `packages/core/src/security/permission-policy.ts`, and keep the fail-closed throw in `packages/providers/src/catalog-provider-routing.ts`; replicate this ordering in any new allow-everything mode.

## Provider credential surfaces

- Mark a provider credential path clean only when these hold: `envVars: []` on add-with-baseUrl and `endpointChanged` in `packages/core/src/tools/fallback-provider-manage-tool.ts`; the default in `packages/providers/src/index.ts` (`Array.isArray(cfg.envVars) ? cfg.envVars : preset`); host primary-key inheritance in `packages/cli/src/wiring/provider-runtime.ts` and `packages/webui-server/src/server/backend-services.ts`.
- Import `endpointCredentialsSuppressed` from `packages/providers/src/endpoint-credentials.ts`; never re-implement it inline. Any missing surface reopens `WS-2026-09-26-01`.

## HQ audit ring — `seed()` ordering

- Do not flag `seed()` ordering in `packages/core/src/hq/commands.ts`: `HqCommandAuditLog` is ascending by design — `record()` appends at tail, `recent()` returns `slice(-limit)` oldest→newest, `unshift(...seeded)` preserves it. Do not suggest "reverse before `unshift`". Gate core ordering changes on `pnpm exec tsc --noEmit -p packages/core`.

## WS eviction — `packages/cli/src/hq-server/ws.ts`

- Reject eviction claims unless `sameCredential` matches; only then apply `clients.delete` + `close(4001)` or undelivered-command inheritance.
- Do not flag the `readyState === OPEN` gate on the `4003` refusal — deliberate rotated-token-reconnect design.
- Treat `ws.on('close')` as primary dead-holder removal, not the TTL sweep.

- When introducing an allow-everything mode that must not outrank user refusals, fail closed on rules that could not be evaluated — in `packages/core/src/security/permission-policy.ts` the `denyUnevaluated` refusal before the YOLO+ auto-allow is the pattern that keeps a broad switch from silently outranking a rule the user wrote. (anchors: `packages/core/src/security/permission-policy.ts`, `denyUnevaluated`) [applied 4×, 4 ok]

---
*Distilled 2026-10-09T04:28:54.533Z · 1 new directive*
