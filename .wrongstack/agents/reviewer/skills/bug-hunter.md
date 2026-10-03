## Kanban completion fail-closed throws

- Treat every `STALE_WRITE_PREFIX` throw from `packages/kanban/src/verification/` as a retry signal, not a bug. `verificationStateFingerprint` in `packages/kanban/src/verification/task-inputs.ts` hashes the full descendant/dependency task tree plus board policy, excluding only `updatedAt`, `notes`, `links`, `labels`, `order`, `dueDate`, and assignment `heartbeatAt`/`leaseExpiresAt`, so a concurrent write during gate→verify→finalize intentionally fails closed with "Re-run the completion gate".
- Do not report `assertAcceptedContractUnchanged` in `packages/kanban/src/manager/lifecycle/accepted-contract.ts` unless that trigger is wrong: it fires only for managed boards with `currentStage === 'done'`, compares input fingerprints (statuses excluded) plus `[check.id, check.status]` outcomes, and fresh reports with `verdict === 'passed'` escape.
- When such a throw is the sole anomaly, return `{ "findings": [] }`.

## Default assertions in tests

- Judge flipped assertions under `packages/core/tests/**` by the default the resolver's current operator computes in `packages/core/src/plugins/*-config.ts`, never by config types or historical comments. For `cfg.x ?? DEFAULT`, check the explicit `'off'` case and the omitted-key case separately before reporting a flip such as `cascadeOn` `off`→`high` or a default-on `enabled` as a regression; read `enabled: cfg.enabled !== false` exactly as written.
