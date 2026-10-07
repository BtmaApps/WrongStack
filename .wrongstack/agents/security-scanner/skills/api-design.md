## VULN-006 provider credential endpoint

- Do not mark a provider credential path clean until all four enforcement surfaces are checked:
  - `packages/core/src/tools/fallback-provider-manage-tool.ts`: set `envVars: []` on add with baseUrl and on `endpointChanged` update.
  - `packages/providers/src/index.ts`: use `Array.isArray(cfg.envVars) ? cfg.envVars : preset`.
  - `packages/providers/src/catalog-provider-routing.ts`: fail closed with a throw.
  - host primary-key inheritance in `packages/cli/src/wiring/provider-runtime.ts` and `packages/webui-server/src/server/backend-services.ts`.
- Missing any one reopens `WS-2026-09-26-01`.
- Never inline re-implementations of `endpointCredentialsSuppressed`; use `packages/providers/src/endpoint-credentials.ts`.

## HQ ring and WS supersede

- Before flagging `seed()` ordering in `packages/core/src/hq/commands.ts`, verify `HqCommandAuditLog` is ascending: `record()` appends at tail; `recent()` = `slice(-limit)` oldest→newest; `unshift(...seeded)` preserves that. Do not suggest “reverse before `unshift`”.
- Validate core ordering with `pnpm exec tsc --noEmit -p packages/core`.
- In `packages/cli/src/hq-server/ws.ts`, reject eviction claims unless `sameCredential` matches; only then may `clients.delete` + `close(4001)` or undelivered-command inheritance occur.
- Treat `readyState === OPEN` gate on `4003` refusal as deliberate rotated-token-reconnect design documented at the comment above it.
- Treat `ws.on('close')` cleanup, not the TTL sweep, as primary dead-holder removal.

- When introducing an allow-everything mode that must not outrank user refusals, fail closed on rules that could not be evaluated — in `packages/core/src/security/permission-policy.ts` the `denyUnevaluated` refusal before the YOLO+ auto-allow is the pattern that keeps a broad switch from silently outranking a rule the user wrote. (anchors: `packages/core/src/security/permission-policy.ts`, `denyUnevaluated`) [applied 4×, 4 ok]

---
*Distilled 2026-10-07T07:45:44.194Z · 1 new directive*
