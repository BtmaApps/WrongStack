# Language detection, planning and execution

The three language tools share predefined ecosystem profiles and workspace
selection. Inspect capabilities before executing a command; a recognized
language does not imply every operation or compiler is available.

| Tool | Purpose | Execution |
|---|---|---|
| `language_info` | Detect workspaces, list capabilities or preview an argv plan | Reads files; does not spawn commands |
| `language` | Check, lint, format, test, build or gather debug evidence | Executes a revalidated predefined plan without a shell |
| `language_package` | Install/add/remove/update/audit/outdated | Executes the ecosystem package-manager plan and reports changes |

## Detect, select, preview

```json
{"action":"detect"}
```

Send this to `language_info`. Select a returned workspace id/root when a
monorepo has multiple candidates. `cwd` selects a project-contained directory;
`target` can help resolve the relevant workspace and `language` narrows the
profile. Ambiguous or unavailable operations are reported with evidence.

```json
{"action":"plan","language":"typescript","operation":"semantic","mode":"standard"}
```

Planning returns commands and availability information without executing them.
Profiles include TypeScript/JavaScript, Go, Rust, PHP, C#, Python, Java, Ruby,
C/C++, Swift, Dart, Elixir, Deno and Shell; use `action: "capabilities"` for
the actual operations/package managers in the current build.

## Execute checks and tests

Examples for `language`, after workspace detection:

```json
{"action":"check","language":"typescript","check":"semantic"}
```

```json
{"action":"test","language":"go","coverage":true}
```

Actions are `check`, `lint`, `format`, `test`, `build` and `debug`. Check selects
`syntax`, `semantic` or `all`; formatting checks by default. Set
`formatCheck: false` explicitly to write formatting changes. `filter`,
`coverage`, `noRun` and debug mode are profile-dependent.
Output distinguishes `passed`, `failed`, `unavailable`, `cancelled` and
`timed_out`, with per-run commands/diagnostics and a summary. These tools use
confirmation/mutation metadata because compilers and test runners can write
artifacts even when the intended operation is a check.

## Package operations

```json
{"operation":"outdated","language":"typescript"}
```

```json
{"operation":"add","language":"typescript","names":["zod"],"scope":"runtime","dryRun":true}
```

`language_package` uses `operation`, not the execution tool's `action`.
It reports package mutations, vulnerabilities/outdated entries and changed
manifests/lockfiles. Lifecycle scripts are disabled by default; `allowScripts`
is an explicit execution choice included in permission identity. `dryRun`
support depends on the selected ecosystem plan; inspect the resulting plan
and outcome rather than assuming every package manager has identical semantics.

Sources: [`tool.ts`](../../packages/tools/src/languages/tool.ts),
[`execute-tool.ts`](../../packages/tools/src/languages/execute-tool.ts),
[`package-tool.ts`](../../packages/tools/src/languages/package-tool.ts),
[`profiles and planner`](../../packages/tools/src/languages/).
The [design](../designs/language-support-system-design.md) contains broader
acceptance goals, not a guarantee that every planned operation has shipped.
