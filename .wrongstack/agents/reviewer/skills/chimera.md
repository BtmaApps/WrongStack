## Chronicle preview assertions

- [applied 11×, 11 ok] Before crediting `String(attributes.<previewField>).length < N` in a chronicle test, read `capPreview` in `packages/core/src/chronicle/tool-adapter.ts`: the truncated branch returns `{preview, truncated, totalBytes}`, so `String()` collapses it to `"[object Object]"` and the bound holds unconditionally. Accept only an object-shape assertion or `attributes.<previewField>.preview.length`, and require the same test to also assert a pre-truncation field such as `fileStats` from `file-tool-stats.ts` — the only proof stats were computed from the full output before `capPreview`.

## Barrel exports and import subpaths

- [applied 10×, 10 ok] Resolve every new import subpath on disk before crediting it; a failed probe is inconclusive, never final. A symbol like `parseNativeCloudSettings` from `@wrongstack/core/cloud-provider` may live in the flat `packages/core/src/cloud-provider.ts`, not a directory — `grep` with a directory `path` errors, so retry as a file glob. A `glob` returning 0 files through brace expansion (`packages/webui-protocol/src/{automation,code-assist}.ts`; many backends skip braces) proves nothing: re-probe one explicit path per call before reporting a broken re-export in `packages/webui-protocol/src/index.ts`.
- [applied 10×, 10 ok] For each new `export *` in a barrel (`@wrongstack/core`, `packages/webui-protocol/src/index.ts`), verify the target module exists and that no two `export *` sources export the same symbol name — a collision is a package-wide compile break.

## Shell allowlist moves

- [applied 1×, 1 ok] When a diff swaps a `shell:` allowlist entry between paths (e.g. `verification-context.ts` → `verification-process.ts`), verify both sides before approving: grep `child_process` in the removed path — once absent, `IMPORTS_CHILD_PROCESS` in `packages/tools/tests/architecture/shell-true-parity.test.ts` drops its `shell:` lines before the allowlist check, so removal is safe. The added path must exist and hold a non-inert `shell:` value — entries match by `endsWith`, so a dead entry masks nothing and a missing one turns the gate red.

## Output

- Emit `json { "findings": [] }` only after every applicable check above passes.
