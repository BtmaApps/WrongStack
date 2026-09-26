## Interface and store contracts

- Before flagging an added return field on a store interface as a break — e.g. `removedNonTerminal` on `ReportStore.compact` in `packages/core/src/plugins/review-report-store.ts` — grep `implements <Interface>`: when the store class is the sole implementer and consumers destructure named fields, the change is purely additive; only exact `toEqual` assertions on the returned object can break. [applied 11×, 11 ok]
- Ground every store-method claim in the store definition file, not handler types or search results. Verify `useXStore.getState().<method>` calls against the definition — e.g. `setDeepDivePartial` exists and `jobStarted` takes 3 args in `packages/webui/src/stores/techstack-store.ts`; a typechecking handler can still throw a runtime `TypeError`. Zero `codebase-search` hits do not prove a zustand action is missing from `create((set) => ({...}))`; grep the store file before reporting a missing method.

## Import and dependency checks [applied 2×, 2 ok]

- Before accepting removal of `import * as X` or a named import, grep the whole file for residual uses (`grep 'X\.|removedName' <file>`); any hit means likely `TS2304` or runtime breakage — confirm no `isTokenExpired` or `HqServerAuth` refs remain in `packages/cli/src/hq-server.ts` after removing `import * as HqServerAuth`.
- For new helper modules (`createHqSocketCredentialEnforcer`, `MailboxSnapshotMemory`), read the module and every callsite: verify each passed state field and callback signature, and that newly depended-on identifiers (e.g. `OPEN_STATE`) are already imported in the consuming file.
- Before reporting a missing-file break for a module absent from the changed-file list (e.g. `required-skill-gate.js` consumed by `packages/core/src/execution/tool-executor.ts` and `packages/core/src/skills/index.ts`), confirm it exists on disk; review bundles may truncate sibling changes.

## Pitfalls

- Do not flag `optionalFn?.(arg).catch(cb)` as a `TypeError: undefined.catch` risk: optional chaining short-circuits the entire trailing chain, so `.catch` is not evaluated when the callee is absent. Before claiming an async-failure gap in `packages/tui/src/use-app-controller.tsx`, verify the callee's declared return type in the `AppProps`-style contract.
