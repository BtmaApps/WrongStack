# chimera — project addendum

`[N×]` = completed applications, all successful; proven checks lead.

## Evidence before findings

- Never file a finding sourced from a diff hunk alone — read the live file range even when the hunk looks current; hunks can omit on-disk lines (a hunk for `architecture/core-public-api-snapshot.json` missed `packages/core/src/sandbox/index.ts:5`'s `createPolicySandboxApprover` export). [13×]
- Validate new spec-doc claims (config paths, symbol names) against sibling files from the same session: `tools.sandbox.image` must match the denial table in `packages/core/src/storage/config-loader/in-project-policy.ts` and the consuming backend's error string. [13×]

## Real-bug patterns to check

- Hardening `Record`-typed board state (`lease.reviews` in `packages/kanban/src/manager/management.ts`): require `Object.hasOwn` reads paired with `Object.defineProperty` writes — a JSON-restored plain object makes `??= Object.create(null)` a no-op, and `obj['__proto__'] = x` corrupts instead of creating an own property. [12×]
- Rollbacks (`previous` restore) around a stateful send must capture a fresh array reference before any rebuild — in-place mutation makes the rollback a no-op (pattern: `subscribe()` in `packages/client/src/client.ts`). [13×]
- A new positional parameter inserted before an optional trailing callback (`wrapMCPTool`'s `sandboxTrust` before `observer`): check every caller's argument order via `codebase-incoming-calls` — a truthy non-boolean mis-slotted into `trusted` identity-wraps through `createSandboxMcpGate({ trusted })`, a silent security-gate bypass. [6×]

## Known non-bugs — verify before flagging

- win32 quoting in `buildContainerRoute` (`packages/core/src/sandbox/backends/container.ts`): cmd.exe expands `%VAR%` inside double quotes but leaves `\"` to CommandLineToArgvW; `-v D:\path:/w0` works on Docker Desktop; `kind: 'argv'` keeps quote glyphs literal — check how `wrap.ts` executes `{argv}` (shell-join vs direct spawn) before alleging a bug. [4×]
- Hardcoded `aria-expanded="true"` on a combobox in a Radix Dialog is accurate — `DialogContent` renders nothing while closed — but verify `aria-activedescendant` targets the exact array and ordering the renderer used to stamp option IDs. [1×]
- In `packages/plugins/src/runtime/host-state.ts`, verify `remove()` deletes the `hosts` entry **before** `state.abort.abort()` — only that ordering keeps the `reset()` guard (`hosts.get(api)`) correct; `T extends HostState` makes `if (reentrant)` narrowing safe. [1×]
- `withFileLock` from `@wrongstack/core/utils` must resolve via the `packages/core/src/utils/atomic-write.ts` re-export (`packages/core/package.json` `exports["./utils"]`); atomicWrite-inside-lock matches `packages/core/src/goal/phase-store.ts` and `packages/core/src/typesafe/settings.ts`, and `packages/core/tests/utils/atomic-write.test.ts` covers it — don't flag Windows-rename or lock-residue without new evidence. [1×]
- For early-fire callbacks added to boot/init, map existing `finally` cleanup before flagging double-invocation: `startupOutput.stop()` in `packages/cli/src/cli-entry-main.ts` is already idempotent; ask instead which launch paths bypass the menu guard.
