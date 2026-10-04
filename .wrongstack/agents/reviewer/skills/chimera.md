## High-confidence checks

- For `packages/webui` changes to `outline-none`, inspect `:focus-visible` in `packages/webui/src/index.css` (`outline: 2px solid hsl(var(--ring)/0.85)`). Treat removal as restoring accessibility; flag additions without a replacement `focus:` indicator.
- Read final files before citing defects: `toolKey(event)!` in `packages/bench/src/transcript-mine.ts` may already have an explicit guard. For `[agentId, id]` joins, verify symmetric `agentId` emission across joined event types in `packages/core/src/types/session-events.ts`; asymmetry silently drops rows.
- Compare capture-enable and capture-accept predicates in `packages/cli/src/cli-entry-main.ts` and `packages/cli/src/boot/tui-startup-output.ts`. Check parser defaults rather than inferring them from `=== true`; mismatched `!flags['x']` and `flags['x'] === true` can silently disable default launches.

## Instructions and catalog

- Validate `ws:if`/`ws:else`/`ws:end` nesting in `packages/core/instructions/**` against `packages/core/src/core/instruction-template.ts`. Check that `parse()` binds else to the innermost frame with `frame.branches.length === 1`; subsequent else markers disappear. Account for `evaluate()` ANDing multiple `tool=` attributes and fail-open behavior retaining text while dropping markers.
- Verify counts using `FLEET_ROSTER` in `packages/core/tests/coordination/agent-catalog.test.ts` and `glob packages/core/skills/*/SKILL.md`, not role memory.

## Tests and module boundaries

- Check `capPreview` in `packages/core/src/chronicle/tool-adapter.ts` before accepting `String(attributes.<previewField>).length < N`: truncated values are `{preview, truncated, totalBytes}`, so stringification yields `"[object Object]"`. Require object-shape or `.preview.length` assertions plus pre-truncation-derived `fileStats` from `file-tool-stats.ts`.
- Resolve `parseNativeCloudSettings` from `@wrongstack/core/cloud-provider` against flat `packages/core/src/cloud-provider.ts`; retry directory-probe failures as file globs. Re-probe `packages/webui-protocol/src/{automation,code-assist}.ts` as explicit paths when brace expansion returns nothing.
- For `export *` in `packages/webui-protocol/src/index.ts` or `@wrongstack/core`, verify target existence and conflicting exported names.

## Shell allowlists

- For `shell:` moves from `verification-context.ts` to `verification-process.ts`, inspect both paths. Check removed-path `child_process` imports: `IMPORTS_CHILD_PROCESS` in `packages/tools/tests/architecture/shell-true-parity.test.ts` filters paths without them before allowlist checks. Require the added path to exist with a non-inert `shell:` value; matching uses `endsWith`.
