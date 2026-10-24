## Fleet memory-companion timers
- Before judging timeout or deadline claims in `packages/cli/src/fleet/host-memory-companion.ts`, bind each timer to its exact budget: `withinIoBudget` uses `ioTimeoutMs ?? 30_000`; `spawnBounded` startup uses `Math.min(config.timeoutMs ?? 60_000, 60_000)`; the probe watchdog/task uses constrained `workerConfig.timeoutMs`. Do not assume the doc’s “deadline” wording identifies one budget.
- Treat `constrainMemoryCompanion` in `packages/cli/src/fleet/memory-companion-policy.ts` as idempotent: per-key positive-finite values are honored, with fixed defaults otherwise. Re-wrapping an already-constrained `workerConfig` at spawn is safe, not a double-clamp bug.

## Kanban fail-closed paths
- Treat `STALE_WRITE_PREFIX` throws from `packages/kanban/src/verification/` as intentional retry signals. `verificationStateFingerprint` (`packages/kanban/src/verification/task-inputs.ts`) hashes the full descendant/dependency tree plus board policy, excluding only `updatedAt`, `notes`, `links`, `labels`, `order`, `dueDate`, `heartbeatAt`, and `leaseExpiresAt`; flag only if the throw escapes verification retry.
- Do not flag `assertAcceptedContractUnchanged` (`packages/kanban/src/manager/lifecycle/accepted-contract.ts`) unless it fires outside managed boards at `currentStage === 'done'`, blocks a fresh `verdict === 'passed'`, or contradicts its comparison of input fingerprints, excluding statuses, plus `[check.id, check.status]` outcomes.

## Resolver-default assertions
- Judge flipped assertions in `packages/core/tests/**` using the exact resolver operator in `packages/core/src/plugins/*-config.ts`, not config types, JSDoc, test names, or historical comments.
- Distinguish explicit `'off'` from omitted-key cases for operators such as `cfg.x ?? DEFAULT`; include cases like `cascadeOn` `'off'`→`'high'` and default-on `enabled`. Read expressions such as `enabled: cfg.enabled !== false` literally, and flag a flip only when it contradicts the computed operator.
