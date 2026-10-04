## Working-tree adjudication

- Check claims that paired config changes are absent with `git status --short` on the named path. Adjudicate workflow-ratchet “red on HEAD” findings against the working tree: unstaged `.github/workflows/*.yml` edits can be missed by committed-state `git diff` and truncated sibling-file lists. If cited coordinates disagree, re-read the live YAML before patching.
- Run the flagged suite from the repo root with `pnpm exec vitest run <file>`; if the `test` wrapper cannot resolve `vitest`, use `pnpm exec vitest run <path>`. For workflow hardening, run `pnpm exec vitest run packages/core/tests/architecture/workflow-hardening.test.ts`; for `packages/core/src/chronicle/tool-adapter.ts`, run `pnpm exec vitest run packages/core/tests/chronicle`. Treat a green run as falsifying an allegedly deterministic red finding in the current tree; record the command and `exitCode` under `verification_evidence`.

## Proxy receiver identity

- Re-read `packages/vector-memory/src/sage-port-wrapper.ts` immediately before patching; parallel workers may already have fixed it. Preserve `delegateWithOverrides`’s `result === target ? delegated : result` contract: methods returning the target must return the proxy, keeping `: this` methods such as `withTraceId()` in `packages/sage/src/memory-port.ts` wrapped.
- Reproduce with `ClassInstancePort` in `packages/vector-memory/tests/sage-port-wrapper.test.ts`, especially “preserves prototype methods of a class-instance port.” Avoid object-literal-only regressions: own-property methods pass through unbound and conceal escapes; prototype methods exercise binding/re-mapping. Run `pnpm exec vitest run packages/vector-memory/tests/sage-port-wrapper.test.ts`.

## Verification scope

- Typecheck core test findings with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.test.json`; use `packages/vector-memory/tsconfig.json` for vector-memory source findings. Lint touched files with `pnpm exec biome check <file>`.
- Avoid root Vitest for `packages/webui/**`, which is excluded. Use `pnpm --filter @wrongstack/webui exec vitest run tests/components/<file>` (e.g. `tests/components/sage-tabs.test.tsx`).

## Fixture and schema checks

- Before claiming an event field is missing, search `packages/core/src/kernel/events/*.ts`, not `kernel/events.ts`, then typecheck.
- Before accepting an unsatisfiable-assertion finding, evaluate fixture transformations: `replaceAll('SECRET','[REDACTED]')` can invalidate `rawPath.startsWith(scrubbedPrefix)`; assert against the scrubbed form.
