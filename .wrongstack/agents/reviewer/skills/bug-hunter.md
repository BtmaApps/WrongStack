## Kanban completion fail-closed throws

- Treat every `STALE_WRITE_PREFIX` throw from `packages/kanban/src/verification/` as a retry signal, not a bug. `verificationStateFingerprint` in `packages/kanban/src/verification/task-inputs.ts` hashes the full descendant/dependency task tree plus board policy, excluding only `updatedAt`, `notes`, `links`, `labels`, `order`, `dueDate`, and assignment `heartbeatAt`/`leaseExpiresAt` — so any concurrent write during gate→verify→finalize intentionally fails closed with "Re-run the completion gate".
- Do not flag `assertAcceptedContractUnchanged` in `packages/kanban/src/manager/lifecycle/accepted-contract.ts` as a regression: it fires only for managed boards with `currentStage === 'done'`, compares input fingerprints (statuses excluded) plus `[check.id, check.status]` outcomes, and fresh reports with `verdict === 'passed'` escape via the passed-verdict branch.
- When such a throw is the sole anomaly in the diff, return `{ "findings": [] }`. Only report it if the trigger conditions above are violated or the throw surfaces outside the verification lifecycle.

## Default assertions in tests

- Judge flipped assertions under `packages/core/tests/**` by the default the resolver's current operator computes in `packages/core/src/plugins/*-config.ts` — not by config types, JSDoc, or historical comments. For `cfg.x ?? DEFAULT`, evaluate the explicit `'off'` case and the omitted-key case independently before classifying a flip such as `cascadeOn` `off`→`high` or a default-on `enabled` as a regression.
- Read operators like `enabled: cfg.enabled !== false` exactly as written; do not infer intent from surrounding test names.
- When a flip matches a documented default in the resolver, treat it as expected behavior and exclude it from findings.
