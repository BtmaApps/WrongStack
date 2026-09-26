## Proven import and dependency checks [applied 2×, 2 ok]

- Before accepting removal of `import * as X` or named imports, run `grep 'X\.|removedName' <file>` across the whole file. Only treat cleanup as safe if zero residual uses remain; otherwise flag likely `TS2304` or runtime breakage. For `packages/cli/src/hq-server.ts`, verify no refs remain to `isTokenExpired` or `HqServerAuth` after removing `import * as HqServerAuth`.
- For new helper modules such as `createHqSocketCredentialEnforcer` or `MailboxSnapshotMemory`, read the module and its callsites; verify every passed state field and callback signature. Also confirm newly depended-on identifiers such as `OPEN_STATE` are already imported in the consuming file.
- If a diff imports or re-exports a module missing from the changed-file list, such as `required-skill-gate.js` consumed by `packages/core/src/execution/tool-executor.ts` and `packages/core/src/skills/index.ts`, confirm the module exists on disk before reporting a missing-file break; review bundles may truncate sibling changes.

## Runtime contracts

- Verify newly called WebUI store methods (`useXStore.getState().<method>`) against the store definition, not only the handler. In `packages/webui/src/stores/techstack-store.ts`, confirm `setDeepDivePartial` exists and `jobStarted` has a matching 3-arg shape; mismatches throw runtime `TypeError` even when handler typechecking passes.
- Zero `codebase-search` hits do not prove a zustand action is missing from `create((set) => ({...}))`; use `grep` against the store file before reporting a missing method.
- Do not flag `optionalFn?.(arg).catch(cb)` as a `TypeError: undefined.catch` risk by default. Optional chaining short-circuits the entire trailing chain, so `.catch` is not evaluated when the callee is absent. In `packages/tui/src/use-app-controller.tsx`, verify the callee’s declared return type in `AppProps`-style contracts before claiming an async-failure gap.
