# Documentation gaps completed — 2026-10-06

This dated record follows the structural documentation review. The follow-up
completed missing command usage, lifecycle/persistence, tool workflow, SDK and
onboarding guidance against the current shared working tree.

## Gaps closed

- Twelve slash/TUI guides now explain syntax, examples, state scope and failures.
- Nine shell guides expand the earlier grouped runtime summaries into usable references.
- Four tool workflows plus their index cover language plans/execution, dead-code cleanup/undo, source-context retrieval and HTTP/search choices.
- First-session, typed client API and package-owner guides fill onboarding/integration gaps.
- Existing codebase-map, director, scout-stats, intake, provider-status, sandbox and plugin-alias references are now linked from the command indexes.
- Model tiers, reasoning effort, profile copies, portable behavior settings, session rules, solo policy and persistent automation versus session cron have explicit ownership boundaries.
- F5/F12 and the TUI /f override were corrected against the current panel registrations.

## New guides

| Document | Subject |
|---|---|
| [docs/slash/effort.md](../../slash/effort.md) | `/effort` — Reasoning effort |
| [docs/slash/tier.md](../../slash/tier.md) | `/tier` — Model tiers and budgets |
| [docs/slash/profile.md](../../slash/profile.md) | `/profile` — Configuration profiles |
| [docs/slash/permissions.md](../../slash/permissions.md) | `/permissions` — Explain decisions and session rules |
| [docs/slash/theme.md](../../slash/theme.md) | `/theme` — TUI theme presets |
| [docs/slash/sidebar.md](../../slash/sidebar.md) | `/sidebar` — TUI sidebar visibility |
| [docs/slash/goals.md](../../slash/goals.md) | `/goals` — Project goal catalog |
| [docs/slash/jev.md](../../slash/jev.md) | `/jev` — Decision account and feature controls |
| [docs/slash/connections.md](../../slash/connections.md) | `/connections` — Project service health |
| [docs/slash/flow.md](../../slash/flow.md) | `/flow` — Cross-board workbench |
| [docs/slash/solo.md](../../slash/solo.md) | `/solo` — Session worker policy |
| [docs/slash/cron.md](../../slash/cron.md) | `/cron` — Session cron monitor |
| [docs/subcommands/remote.md](../../subcommands/remote.md) | `wstack remote` — SSH-hosted WebUI |
| [docs/subcommands/config-transfer.md](../../subcommands/config-transfer.md) | `wstack config-export` / `config-import` — Portable settings |
| [docs/subcommands/chronicle.md](../../subcommands/chronicle.md) | `wstack chronicle` — Recorded events and metrics |
| [docs/subcommands/permissions.md](../../subcommands/permissions.md) | `wstack permissions` — Policy inspection |
| [docs/subcommands/sage.md](../../subcommands/sage.md) | `wstack sage` — External-agent memory and HQ sync |
| [docs/subcommands/governance.md](../../subcommands/governance.md) | `wstack governance` — Advisory service status |
| [docs/subcommands/typesafe.md](../../subcommands/typesafe.md) | `wstack typesafe` — Jev account and diagnostics |
| [docs/subcommands/skill-suggest.md](../../subcommands/skill-suggest.md) | `wstack skill-suggest` — Routing preview and evaluation |
| [docs/subcommands/proxy-status.md](../../subcommands/proxy-status.md) | `wstack proxy-status` — WrongProxy diagnostics |
| [docs/tools/README.md](../../tools/README.md) | Built-in tool workflows |
| [docs/tools/language.md](../../tools/language.md) | Language detection, planning and execution |
| [docs/tools/dead-code.md](../../tools/dead-code.md) | Dead-code scan, preview and cleanup |
| [docs/tools/codebase-context.md](../../tools/codebase-context.md) | `codebase-context` — Find a task's relevant source |
| [docs/tools/web-content.md](../../tools/web-content.md) | Search and read web content |
| [docs/client-api.md](../../client-api.md) | Typed WebUI client API |
| [docs/architecture/package-owners.md](../../architecture/package-owners.md) | Package ownership and integration entry points |
| [docs/getting-started.md](../../getting-started.md) | First session and daily workflow |

## Prevention and verification

- `docs:check` checks local paths/casing/headings, generated inventories, linked command coverage and official plugin-to-tool mappings.
- Source coverage: 42 shell keys, 111 CLI slash registrations including the hidden F-key family, and seven checked TUI names have linked guides. Conditional registrations are included in source coverage, not promised available in every host.
- The generated shell catalog now links usage guides beside the handler source.
- Negative/positive fixture controls verify missing guides, shared guides, alias rows and hidden-family coverage.
- Fifteen JSON tool examples match the source schema fields, types, enums, required fields and literal bounds.
- Both typed client API examples pass `pnpm exec tsc -p .temp_files/docs-completion-20261006/tsconfig.examples.json` (exit 0).
- All 29 new-guide tables have consistent Markdown column counts; literal pipes in code cells are escaped.
- Scoped Biome, JavaScript syntax checks and `git diff --check` pass.

Evidence scripts and outputs are under `.temp_files/docs-completion-20261006/`.
These checks validate documentation structure, registrations, examples and
source contracts. Live provider/SSH/HQ/browser/tool executions and full release
certification are separate scopes.

Continue from [the documentation index](../../README.md) or [maintenance](../../maintenance.md).
