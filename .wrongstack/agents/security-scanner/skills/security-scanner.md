## Scrubber checks

- For pattern changes in `packages/core/src/security/secret-scrubber.ts`, exclude capturing-group patterns from `SIMPLE_PATTERNS`: `COMBINED_REGEX` wrapper-group indices select `COMBINED_REPLACEMENTS`. Do not request manual synchronization of `COMBINED_REPLACEMENTS` or `PATTERN_ANCHORS`/`ALL_ANCHORS`; these derive through `.map()`/`flatMap`. Require each `anchor` to be a mandatory match substring. Verify dedicated passes such as `url_credentials` remain reachable through `scrub()` from both `scrubObject` and `scrubObjectShared`.
- Run covering tests with `pnpm exec vitest run <test-file>` from `packages/core`; avoid the `test` tool, which fails with "vitest not found".
- Compare old/new scrubbers on aliased nodes and cyclic graphs. Reject `WeakSet` revisit handling that returns original, unscrubbed nodes; inspect strings by walking with a `Set`, not `JSON.stringify`. In `scrubObjectShared`, require the return path to consume the cycle flag unconditionally, discard partial output, and rerun the full cycle-aware copier.
- Preserve `Object.defineProperty(out, k, { value, enumerable: true, writable: true, configurable: true })` in both walkers. Avoid `out[k] = value`: an own `__proto__` key from `JSON.parse` mutates the prototype and loses its value.

## Launcher parity

- Before changing numeric launcher operands, grep `(?:\d+(?:\.\d*)?|\.\d+)[smhd]?` across `packages/core/src/security/yolo-risk.ts`, `packages/tools/src/_danger-detect.ts` (`TIMEOUT_DURATION`), and `packages/plugins/src/dep-guard/index.ts`. Add matching fractional-duration coverage in `packages/core/tests/security/yolo-risk.test.ts`; the launcher `it.each` covers integers only. Do not rely on `packages/tools/tests/danger-detect.test.ts` for regex parity: it pins only `HALT_LAUNCHER_VALUE_FLAGS`.

## Authentication and cache boundaries

- In `packages/persistence/src/ipc-endpoint-secret.ts`, check every reader `return` against `if (secret !== undefined) cached = ...`. Separately test ENOENT, corrupt content, and invalid-format failures: `null` remains memoised even when `undefined` is excluded, potentially pinning the fail-open fallback.
- Verify HQ capability enforcement in `packages/cli/src/hq-server/routes/command-handlers.ts`, `routes/mailbox-handlers.ts`, and `mailbox-gateway-manager.ts`; never treat `packages/webui-hq/src/domain/` UX gating as enforcement. Check `git status` for untracked imported enforcement modules; `git diff HEAD` omits them.

## Shell classification

- Require `classifyShellSurfaceInput` in `packages/core/src/security/permission-helpers.ts`, not `shellCommandLineFromInput`, for destructive classification. Check `{program, args}`, `criteria[].command`, and `checks[]`; grep command-reading gates for consumers requiring migration or justification.
