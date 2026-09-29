## Ownership and disputed reverts

- Before reapplying a fix to `packages/webui-server/src/server/http-server/vector-memory-handlers.ts`, check fleet pulses and inbound mail for an ownership steer. Treat a revert accompanied by deliberate fail-closed pinning tests as a docs defect, not a regression.
- On an explicit steer such as “do not edit these files,” stop editing immediately, leave the owner’s tree untouched, and communicate read-only findings through permitted channels.

## Test adjudication

- Run the flagged test before inspecting its cited production branch: `pnpm exec vitest run <file>`, e.g. `pnpm exec vitest run packages/core/tests/core/agent-malformed-retry.test.ts`. A green run falsifies claims about that test’s contract; preserve its assertions and record the command and `exitCode` as `verification_evidence`.
- In `packages/core/src/core/agent-loop.ts`, use `foldBlockIntoConversation` for all runtime-injected context (`btw`/session/mailbox/steer/pulse/coach). Treat calibration corruption claims as false positives unless a failing test shows the required `clearEvaluatedMailboxBlocks` recalibration is absent.

## SQLite migration fixtures

- Build the N-1 fixture with raw `loadRuntimeDatabaseSync()` DDL at a `mkdtempSync` path, then set its version row to the old `SCHEMA_VERSION`; a fresh database bypasses the upgrade branch.
- Reopen through the real store constructor and assert both writer success and advancement to the current `SCHEMA_VERSION`. Read the current value from `packages/techstack/src/store/schema.ts`; never hard-code it.
- Keep cases in `packages/techstack/tests/store/` beside `store-roundtrip.test.ts`, and remove each temporary directory.

## Verification scopes

- Verify store changes with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/techstack/tsconfig.json`, touched-file lint via `pnpm exec biome check packages/techstack/src/store/schema.ts packages/techstack/tests/store/store-roundtrip.test.ts`, and `pnpm exec vitest run packages/techstack/tests/store`.
- Never run WebUI tests through root Vitest: `packages/webui/**` is excluded, so `pnpm exec vitest run packages/webui/...` fails with “No test files found.” Use `pnpm --filter @wrongstack/webui exec vitest run tests/components/<file>`.
- For SageTabs changes, verify with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`, `pnpm exec biome check packages/webui/src/components/MemoryManager/SageTabs.tsx`, and `pnpm --filter @wrongstack/webui exec vitest run tests/components/sage-tabs.test.tsx tests/components/memory-manager.test.tsx`.
