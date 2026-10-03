## Chronicle preview assertions

- [applied 11×, 11 ok] Before crediting `String(attributes.<previewField>).length < N`, read `capPreview` in `packages/core/src/chronicle/tool-adapter.ts`: the truncated branch returns `{preview, truncated, totalBytes}`, so `String()` collapses it to `"[object Object]"` and the bound holds unconditionally. Accept only the object-shape assertion or `attributes.<previewField>.preview.length`, and require the same test to also assert a pre-truncation-derived field such as `fileStats` from `file-tool-stats.ts` — the only proof stats were computed from the full output before `capPreview`.

## Barrels and import subpaths

- [applied 10×, 10 ok] Resolve every new import subpath on disk before crediting it, and treat a failed probe as inconclusive, never final: a subpath like `@wrongstack/core/cloud-provider` can resolve to the flat file `packages/core/src/cloud-provider.ts` rather than a directory, so `grep` with a directory `path` errors — retry as a file glob. A `glob` returning 0 files proves nothing when the pattern used brace expansion (e.g. `packages/webui-protocol/src/{automation,code-assist}.ts`; many backends skip braces) — re-probe one explicit path per call before reporting a broken re-export in `packages/webui-protocol/src/index.ts`.
- [applied 10×, 10 ok] For each new `export *` in a package barrel (`@wrongstack/core`, `packages/webui-protocol/src/index.ts`), verify the target module exists and that no two `export *` sources export the same symbol name — a collision is a package-wide compile break no single-file review would catch.

## Shell allowlist moves

- [applied 1×, 1 ok] When a diff swaps a `shell:` allowlist entry between paths (e.g. a helper extraction moving a spawn from `verification-context.ts` to `verification-process.ts`), verify both sides before approving: grep `child_process` in the removed path — once it no longer imports it, `IMPORTS_CHILD_PROCESS` in `packages/tools/tests/architecture/shell-true-parity.test.ts` drops that file's `shell:` lines before the allowlist check, so removal is safe. Confirm the added path exists and holds a non-inert `shell:` value — the list matches by `endsWith`, so a dead entry masks nothing while a missing one turns the gate red.

## Output

- Emit `json { "findings": [] }` only after every applicable check above passes.
