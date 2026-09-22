# `wstack version` / `wstack help`

Small informational subcommands registered by the top-level CLI dispatcher.

## `wstack version`

Prints the WrongStack CLI version, API version, active Node.js version, and
platform.

```text
WrongStack <version> (apiVersion <apiVersion>, node <version>, <platform>)
```

## `wstack help`

Prints the top-level usage guide (also `wstack --help`), grouped by intent:
Start, Sessions, Setup, Project & diagnostics, Session flags, Tools &
permissions, Scripting, Interfaces, Startup & tuning. It lists only what the
CLI actually reads; per-command detail lives in `wstack <command> --help`.
Keep rows under ~100 columns — long flag spellings wrap their description onto
the next line automatically.

## Code Reference

- `packages/cli/src/subcommands/handlers/version-help.ts`
- `packages/cli/src/version.ts`
