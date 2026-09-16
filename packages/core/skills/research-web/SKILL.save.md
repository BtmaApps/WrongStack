# Research Web — WrongStack (Compact)

Conducts current-data web research with discipline: when to search, how to cross-validate, how to inject findings.

## Rules

1. Verify before claiming — never state a version number from training data without a live check.
2. Two-source minimum: single-source is tentative, two agreeing is signal.
3. Inject, don't repeat — use context_manager add_note after research.
4. Respect the stop rule: 2-3 searches + 1-2 fetches per topic.
5. Match tool to task: `search` for discovery, `fetch` to read a known page or a raw registry endpoint.

## Workflow

1. Quick lookup (1-2 turns): search → fetch → inject
2. Deep investigation (3-4 turns): search → parallel fetches → cross-reference → inject
3. Landscape survey: delegate to subagents, one per topic

## Source quality

| Tier | Examples | Trust |
|------|----------|-------|
| **Primary** | Official docs, GitHub releases | Cite as fact |
| **Secondary** | Tech blogs, conference talks | Cite with "according to" |
| **Tertiary** | Stack Overflow, Reddit | Corroborate before citing |