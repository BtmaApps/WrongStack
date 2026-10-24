## Fleet memory-companion timers
- Pin every timeout claim in `packages/cli/src/fleet/host-memory-companion.ts` to one of three budgets before judging it: `withinIoBudget` = `ioTimeoutMs ?? 30_000`; `spawnBounded` startup = `Math.min(config.timeoutMs ?? 60_000, 60_000)`; probe watchdog/task = constrained `workerConfig.timeoutMs` — a doc's "deadline" wording can mean any of the three. [applied 1×, 1 ok]
- Treat `constrainMemoryCompanion` (`packages/cli/src/fleet/memory-companion-policy.ts`) as idempotent (per-key positive-finite honor, fixed defaults): nesting it around an already-constrained `workerConfig` at spawn is safe, not a double-clamp bug.

## Kanban fail-closed throws
- Treat `STALE_WRITE_PREFIX` throws from `packages/kanban/src/verification/` as intentional retry signals, not bugs: `verificationStateFingerprint` (`packages/kanban/src/verification/task-inputs.ts`) hashes the full descendant/dependency tree plus board policy, excluding only `updatedAt`, `notes`, `links`, `labels`, `order`, `dueDate`, and `heartbeatAt`/`leaseExpiresAt`.
- Don't flag `assertAcceptedContractUnchanged` (`packages/kanban/src/manager/lifecycle/accepted-contract.ts`) as a regression: it fires only on managed boards at `currentStage === 'done'`, compares input fingerprints (statuses excluded) plus `[check.id, check.status]` outcomes, and fresh `verdict === 'passed'` reports escape via the passed-verdict branch.

## Resolver-default assertion flips
- Judge flipped assertions in `packages/core/tests/**` by the operator the resolver computes in `packages/core/src/plugins/*-config.ts`, never by config types, JSDoc, test names, or historical comments.
- For `cfg.x ?? DEFAULT`, classify the explicit `'off'` case and the omitted-key case independently before calling a flip a bug (e.g. `cascadeOn` `off`→`high`, default-on `enabled`); read operators like `enabled: cfg.enabled !== false` exactly as written.

## Finding discipline
- When the sole diff anomaly is one of the verified-expected behaviors above, file a finding only if a stated condition fails: a `STALE_WRITE_PREFIX` throw escapes verification retry; the contract check fires off a managed board's `'done'` stage or blocks a fresh passed verdict; a flip contradicts the operator's actual computation. Otherwise record it as verified-expected and move on.
