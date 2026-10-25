# /techstack — Project Dependency Auditor

Aliases: `/tech`, `/deps`.

## What it does

`/techstack` spawns a subagent that scans every `package.json` in the project, looks up each dependency's latest version on the npm registry, and produces a structured report (`techstack.md` or `techstack.json`) in the project root.

The subagent uses the **tech-stack** skill for its verification rules — blocking dead packages, flagging prehistoric technology, and preferring Node.js built-ins over third-party packages.

## Usage

```
/techstack              Scan dependencies + write techstack.md
/techstack --json       Write techstack.json instead of markdown
/techstack --init       Init-mode: compare scaffolded vs latest versions
```

## Report structure

The markdown report groups packages by status:

| Status | Meaning |
|--------|---------|
| 🟢 **Up to Date** | Current version within 1 minor of latest |
| 🟡 **Outdated** | Behind latest (major gap or >1 minor gap) |
| 🔴 **Critical** | Known CVEs, deprecated, or >2 years without release |
| ☠️ **Dead / Obsolete** | Deprecated, archived, or superseded ≥5 years ago |

Each group has a table with: package name, current version, latest version, age, and notes.

The report ends with a **Recommendations** section listing the top 3-5 most urgent fixes.

## Init-mode (`--init`)

When called with `--init` (or automatically by the init hook), the subagent:
- Produces a comparison between scaffolded versions and the current stable versions
- Warns specifically about version numbers the LLM may have hallucinated
- Uses a friendlier format suitable for first-time setup context

This is also triggered automatically when `/init` runs for the first time on a new project.

## How it works

```
1. discoverPackageFiles()                → Finds package.json in root + workspace packages
2. Tier guard                            → Aborts with a hint if the `fetch` tool is not registered
3. buildTechStackTask()                  → Constructs detailed subagent instructions
4. opts.onSpawnAndWait(task, { tools,    → Spawns a scoped subagent and waits for the result
     allowedCapabilities })
5. Subagent executes                     → Reads package.json files → `fetch` npm registry → `write` report
6. Subagent reports                      → Chat summary returned inline when done
```

### Package discovery

The command reads the root `package.json` `workspaces` field to find workspace packages, then scans each subdirectory for `package.json`. It falls back to `pnpm-workspace.yaml` only when the root `package.json` declares no workspaces. Single-package projects just get the root `package.json`.

### Subagent design

The subagent is a general-purpose coding agent — not a fleet role. The task description activates the `tech-stack` skill by using its trigger keywords ("install", "package", "dependency", "version", etc.).

Subagents run **non-interactively under a director** and cannot answer permission prompts, so their `AutoApprovePermissionPolicy` auto-approves only tools whose declared capabilities are on an allowlist. The CLI fleet host gives subagents a **wide working default** (`WIDE_SUBAGENT_CAPABILITIES`: read, write, net, shell, install) so delegated agents can do real work end-to-end; only blast-radius-escaping capabilities (`fs.write.outside-project`, `mcp.proxy`, `subagent.spawn`, `config.mutate`) require an explicit per-spawn grant. `/techstack` doesn't need the wide set — it spawns with an explicit, minimal grant scoped to exactly what the audit needs:

- `tools: ['read', 'glob', 'grep', 'tree', 'fetch', 'write']` — scoped to exactly what the audit needs
- `allowedCapabilities: ['fs.read', 'net.outbound', 'fs.write']` — widens the default to permit the report `write`

Consequences encoded in the task prompt:

- **Network is only via the `fetch` tool** — `bash curl`/`wget` and Node `fetch()` scripts are blocked (no `shell.*` capability), so the prompt forbids those fallbacks and tells the model to retry the `fetch` tool instead.
- **File writes are only via the `write` tool** — granted explicitly via `fs.write`.
- Shell capabilities are deliberately **not** granted; widening `fs.write` does not open arbitrary command execution.

### Token-saving tier requirement

The subagent inherits the leader's tool registry. A token-saving tier of **`minimal`/`light` strips the `fetch` tool** (it is not in Tier 1), leaving the subagent unable to reach the npm registry. `/techstack` detects this up front and aborts with a hint to raise the tier to `medium` or higher rather than letting the subagent fail with a misleading "fetch appears blocked" error.

## Hook into /init

The `/init` slash command uses `detectProjectFacts()` from `helpers.ts`. The techstack scan is triggered after the AGENTS.md write when:
1. A `package.json` is detected (Node.js project)
2. The AGENTS.md is being created for the first time (no existing file)

## Code reference

- `packages/cli/src/slash-commands/techstack.ts` — slash command
- `packages/core/skills/tech-stack/SKILL.md` — skill rules used by the subagent
- `packages/cli/src/slash-commands/index.ts` — registration
- `packages/cli/src/slash-commands/init.ts` — init hook integration point

## Related commands

| Command | What it does |
|---------|-------------|
| `/init` | Creates AGENTS.md + triggers techstack on first run |
| `/spawn` | Generic subagent dispatch (techstack uses this internally) |
| `/diag` | System diagnostics (complementary to tech stack health) |
