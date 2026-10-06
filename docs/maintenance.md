# Maintaining documentation

Start at [the documentation index](README.md). Current runtime/user guidance
lives in the root guides, `architecture/`, `sage/`, `slash/` and `subcommands/`.
`plans/`, `designs/` and `specs/` state proposals or acceptance contracts; their
file lists do not establish that code has shipped. `archive/` preserves dated
evidence and superseded documents.

The [2026-10-06 review](archive/reports/documentation-review-2026-10-06.md)
records each file's disposition, source-path evidence and validation scope.
The [follow-up completion record](archive/reports/documentation-completion-2026-10-06.md)
lists added usage guides and their example/coverage checks.

For a behavior change, trace the producer, state owner and consuming surfaces,
then update the corresponding guide in the same change. Link actual source
owners and state service/test limitations precisely. Keep external links for
upstream context; repository behavior is determined by local code and tests.

```bash
pnpm docs:catalog:write
pnpm docs:check
```

The catalog writer reads source declarations without importing runtime
factories or `dist`. It derives package, tool, subcommand, mode, skill and plugin
inventories. `docs:check` checks maintained local Markdown link targets,
path casing, local ATX heading targets, catalog freshness, linked guides for
registered shell/CLI slash commands and checked TUI command families, and the
official plugin-to-tool feature matrix. CI runs the
same command. Neither link checking nor catalog generation proves arbitrary
prose, executes service workflows, verifies URLs or certifies a release.

When adding a command, add a linked guide to `subcommands/README.md` or
`slash/README.md`. The source-driven coverage check reads registration builders
without importing host factories. The hidden F-key family has one shared guide;
aliases and multi-command guides can share a page. A guide should explain
syntax, useful examples, persistence/lifecycle scope and expected failures.
For a new tool family, add its workflow to `tools/README.md` and validate sample
inputs against its current schema.

When archiving a document, preserve its content, rebase relative links and
update inbound links. Current navigation should point to a maintained guide.
Retain proposal status for unimplemented work. Ignored local reports remain
local under `archive/local/`; do not turn them into tracked publication inputs.

Architecture-health evidence is a generated exception: keep the
`docs/reports/architecture-health-current.{json,md}` pair and regenerate it with
`pnpm report:architecture`. Never hand-edit measurements or claim a commit's
freshness from an old report. Full release certification uses the separate
[release matrix](release-process.md).
