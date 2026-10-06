# `wstack permissions` — Policy inspection

Build the current project's policy for a fresh session, list its rules, or
explain a tool call without executing it or modifying trust.

```bash
wstack permissions rules --json
wstack permissions explain read --input '{"path":"README.md"}' --json
```

`rules` lists rules in their evaluation order. `explain` includes the decision
trace and matching rule, including the executor's final gate. Text output also
reports effective YOLO and its source. `--input` supplies JSON; omitted input
defaults to `{}`. `--json` selects structured output.

The fresh context has the current working directory/provider but no prior
reads, temporary answers or session overrides. To explain the live session's
actual temporary rules, use [/permissions](../slash/permissions.md).
`--yolo` overrides the config choice for this diagnostic policy view.

Unknown tools, malformed JSON, unavailable tool registry or policy construction
failures return an error. A diagnostic approval does not execute the tool or
authorize a future call in a different context.

Source: [`permissions.ts`](../../packages/cli/src/subcommands/handlers/permissions.ts).
See [permission behavior](../yolo-mode.md) and [read-only mode](../readonly-mode.md).
