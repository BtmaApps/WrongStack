# @wrongstack/agent-catalog

The agent role catalog: every phase's `AgentDefinition`s (`AGENT_CATALOG`,
`AGENTS_BY_PHASE`), their capability routing metadata and role skills, the
lazily loaded role prompts, the dispatch log, and the project-agent identity,
learning, consolidation and roster files under `.wrongstack/agents/`.

The bundled role prompts live in `instructions/agents`. They are read relative
to this package (`src/` and `dist/` both sit one level below it, as does the
standalone binary's embedded copy), so the directory ships in `files` and in
the binary's asset pack.

Extracted from `@wrongstack/core` (`src/coordination/agents/`) on 2026-10-24.
It sits **below** core: it depends only on `@wrongstack/contracts`,
`@wrongstack/primitives` and `@wrongstack/persistence`, and core's
coordination imports it. Core still re-exports the catalog names from its
coordination and root barrels.
