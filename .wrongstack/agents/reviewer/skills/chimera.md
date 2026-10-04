## Chronicle preview assertions

- Before crediting `String(attributes.<previewField>).length < N` in a chronicle test, read `capPreview` in `packages/core/src/chronicle/tool-adapter.ts`. The truncated branch returns `{preview, truncated, totalBytes}`, so `String()` collapses to `"[object Object]"` and the bound holds unconditionally. Accept only an object-shape assertion or `attributes.<previewField>.preview.length`.
- Require the same test to assert a pre-truncation-derived field such as `fileStats` from `file-tool-stats.ts` — it is the only proof stats were computed from the full output before `capPreview`.

## Barrel exports and import subpaths

- Resolve every new import subpath on disk before crediting it; a failed probe is inconclusive. `parseNativeCloudSettings` from `@wrongstack/core/cloud-provider` may live in flat `packages/core/src/cloud-provider.ts`, not a directory — `grep` with a directory `path` errors, so retry as a file glob.
- A `glob` of 0 files via brace expansion (`packages/webui-protocol/src/{automation,code-assist}.ts`) proves nothing; re-probe one explicit path per call before reporting a broken re-export.
- For each new `export *` in a barrel (`packages/webui-protocol/src/index.ts`, `@wrongstack/core`), confirm the target module exists **and** no two `export *` sources export the same symbol name — a collision is a package-wide compile break no single-file review catches.

## Shell allowlist moves

- When a diff swaps a `shell:` allowlist entry between paths (e.g. `verification-context.ts` → `verification-process.ts`), verify both sides. Grep `child_process` in the removed path: absent means `IMPORTS_CHILD_PROCESS` in `packages/tools/tests/architecture/shell-true-parity.test.ts` drops its `shell:` lines before the allowlist check, so removal is safe rather than un-vetting a live site.
- The added path must exist and contain a non-inert `shell:` value — entries match by `endsWith`, so a dead entry masks nothing and a missing one turns the gate red.
