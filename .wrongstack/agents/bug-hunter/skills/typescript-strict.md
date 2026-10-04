## Live-tree Adjudication

- Before patching a Chimera scoping/`ReferenceError` claim, run `git status --short` and inspect all identifier matches in the live scope. Use declaration/reference counts to locate a half-landed move, not to prove scope correctness. If the replacement binding already exists, remove the dead original `useSandboxStatus()` in `packages/webui/src/components/SessionsDashboard.tsx` rather than duplicating it. [applied 2×, 2 ok]
- Check self-retracting findings’ replacement claims against literal source, including JSON saying “Re-verified: the flow is correct.” In `packages/core/src/sandbox/wrap.ts`, `{ ...input, command }` preserves `args`; strict mode does not make parameters readonly. Verify that `input = applyRoute(...)` reaches `rawExecute.call(tool, input, ...)`. [applied 1×, 1 ok]
- Run the affected package typecheck before patching “breaks compilation.” For a `TS1005` cascade ending in `Unterminated template literal`, inspect the first coordinate (`terminal-dashboard.ts:369`) before later diagnostics; fix the confirmed parse root and rerun before treating downstream locations as defects. [applied 1×, 1 ok]

## Verification

- For webui changes, run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`, `pnpm exec biome check <file>`, and `pnpm --filter @wrongstack/webui exec vitest run tests/components/<file>.test.ts`. Glob both `.test.ts` and `.test.tsx`; include lowercase-dashed suites `tests/components/sessions-dashboard.test.ts` and `tests/components/sessions-dashboard-errors.test.ts`. Record commands and `exitCode` under `verification_evidence.{typecheck,lint,tests}`.
- After parse fixes in `packages/webui-server`, run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json` and `pnpm exec biome check --write <file>` only on the touched file. Rerun failing co-modified `M` specs twice; changing counts or locations in `tests/terminal-dashboard.test.ts` indicate concurrent edits, not proof the failure is harmless.

## Boundaries and Concurrent Edits

- Keep `packages/simpleui/src/settings-panel.tsx` `pollIntervalOptions` guards within the hand-edit domain: `Number.isInteger(x) && x > 0` rejects zero, negative, and fractional values without extra `NaN`/`Infinity` handling. [applied 1×, 1 ok]
- On an `edit` `VALIDATION_ERROR` reporting external changes, reread, diff, and re-anchor; never retry stale text, including formatter-collapsed conditions. [applied 1×, 1 ok]
