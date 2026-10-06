## Live diff, contracts, and state
- Treat diff hunks as possibly incomplete. Before filing, read live range: `architecture/core-public-api-snapshot.json` may omit `"export { createPolicySandboxApprover } from './approver.js';"`, matching `packages/core/src/sandbox/index.ts:5`; verify `packages/core/src/sandbox/index.ts`, file `json { "findings": [] }` if clean.
- Check producer→consumer contracts: `packages/core/src/coordination/dep-watcher.ts` `File:` must satisfy `packages/core/src/coordination/techstack-mailbox-consumer.ts` `acceptManifestCandidate` path form; a validator rejecting production input makes parsing inert. Validate regex against generator output: `manifest-deps.ts` `parseRequirementsTxt`/`pep508Entry` ranges contain spaces; `\S+` drops them and `length > 0` may over-scope. For in-session baseline/delta, name first event; baseline only in change handler is empty for first edit.
- Inspect `pendingTasks.splice(0, host.opts.maxConcurrentTasks)` in `packages/core/src/goal/phase-task-execution.ts` against loop termination; `?? N` can hide `0`, causing microtask starvation. `satisfies PhaseTaskExecutionHost` is not proof; match members of `this as unknown as PhaseTaskExecutionHost`.

## Guards, imports, and cached board state
- A `/i` regex behind `String.includes()`/`indexOf()` may be lowercase-only. In `packages/core/src/utils/next-steps.ts`, `<next_?steps\b[^>]*>` matches `<nextsteps-complete/>` because `\b` is between `s` and `-`; read actual stripper regex before crediting "every surface strips this token".
- When `import type { X }` becomes `import { type X, VALUE }` on `@wrongstack/core/*`, add value to `export {}`, not `export type {}`; verify a real consumer imports it.
- Clear cached `protocolVersionRefusal` on `ServerSlot` (`packages/mcp/src/registry-slots.ts`) at start of `attemptConnectSlot` (`packages/mcp/src/registry-connect-loop.ts`); stale errors leak through `ensureConnected` (`packages/mcp/src/registry-server-lifecycle.ts`).
- Pair `Object.hasOwn` with `Object.defineProperty` for `Record` state like `lease.reviews` (`packages/kanban/src/manager/management.ts`); `??= Object.create(null)` may miss JSON-restored objects, and `obj['__proto__'] = x` corrupts.

## Wrapping, wiring, UI, and win32
- For `wrapMCPTool` adding `sandboxTrust` before `observer`, check all callers via `codebase-incoming-calls`; truthy object in `trusted` bypasses `createSandboxMcpGate({ trusted })`.
- Resolve teardown counts from push sites like `packages/cli/src/wiring/dep-watcher.ts`, not comments; migrated JSON-RPC→tool-result substrings must come from unchanged message producer.
- A hardcoded `aria-expanded="true"` can be accurate inside `DialogContent` if closed renders nothing; ensure `aria-activedescendant` uses the exact renderer array/order; if verified, file `json { "findings": [] }`.
- Do not flag `buildContainerRoute` (`packages/core/src/sandbox/backends/container.ts`) without context: cmd.exe expands `%VAR%` inside double quotes, leaves `\"` for target, and `-v D:\path:/w0` is accepted; for `kind: 'argv'`, check `wrap.ts` execution of `{argv}` because glyphs may stay literal.
