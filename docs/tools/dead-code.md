# Dead-code scan, preview and cleanup

`dead-code-scan` builds its own TypeScript module/reachability analysis; it
does not infer dead code from the Codebase Index's name-based symbol graph.
Findings include a category, confidence, reason, location and stable finding
id, plus either a supported fix or a manual-review reason.

## Scan and assess

```json
{"paths":["packages/example/src"],"minConfidence":"high","limit":30}
```

Replace the example path with a project-relative prefix. `paths` filters
reported findings while analysis remains project-wide. `categories` and
`minConfidence` filter the returned list; the full scan can be saved at
`reportPath`, while `limit` bounds the inline view. Scan does not edit source,
although it can persist its report artifact.

Categories distinguish unreachable/test-only files, dead/unused/test-only
exports, unused reexports/locals/dependencies and unused public exports.
`includePublicApi` includes published API with no in-repository consumer;
external consumers can still exist. `entries` supplies entry files/globs that
are loaded outside the visible import graph. Read warnings before accepting
a reachability claim about dynamic loaders or framework entrypoints.

## Preview and apply

Use returned finding ids with `dead-code-scan`:

```json
{"previewIds":["<finding-id>"]}
```

This returns the planned diff without editing source, including associated
orphaned imports/helpers. Select the intended ids, then call `dead-code-fix`:

```json
{"action":"apply","ids":["<finding-id>"],"verify":"typecheck"}
```

Apply goes through the normal mutating-tool confirmation path, re-scans before
editing and skips findings that no longer hold. Default verification typechecks
affected packages. Verification failure rolls back; errors attributed to
particular findings can exclude them before retrying the remaining plan.
Inspect changed/deleted/excluded/skipped entries and per-package verification.
`verify: "none"` skips that check and must not be reported as tested cleanup.

## Restore

```json
{"action":"backups"}
```

```json
{"action":"undo","backupId":"<backup-id>"}
```

Use the backup id returned by apply. Undo reports conflicts with files changed
after cleanup; `force: true` permits overwriting those changes and is a separate
operator choice. Listing or restoring a backup does not validate current tests.

Sources: [`tools.ts`](../../packages/tools/src/dead-code/tools.ts),
[`analysis types`](../../packages/tools/src/dead-code/types.ts),
[`fix.ts`](../../packages/tools/src/dead-code/fix.ts).
See [permission inspection](../slash/permissions.md).
