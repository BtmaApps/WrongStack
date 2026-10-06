# `codebase-context` — Find a task's relevant source

Give a plain-language task and receive ranked files, relevant declaration
signatures and line numbers. The tool composes lexical seeds and a reference
graph walk; optional host-side embeddings add semantic seeds. It returns a
reading map rather than whole source bodies.

```json
{"query":"provider fallback after a rate limit","limit":8,"symbolsPerFile":3}
```

| Input | Meaning |
|---|---|
| `query` | Required non-empty task/question |
| `limit` | Files returned; default 12, bounded to 50 |
| `symbolsPerFile` | Declarations per file; default 4, bounded to 20 |
| `pathPrefix` | Optional project-relative path prefix |

Read the returned source locations before editing. Use callers/impact tools
when the next question concerns dependencies rather than initial discovery.
`seedCount` and `semanticSeedCount` report retrieval channels; zero semantic
seeds can mean the host has no embedder or that no semantic candidate cleared
its gate. Semantic retrieval failure falls back to the lexical path.

`indexStatus` is `ok`, `no-matches` or `unranked`. An unranked answer uses lexical
results when a reference graph is unavailable. `totalCandidates` precedes the
output limit; `stale: true` identifies a cached earlier-generation answer.
No matches is different from a missing index or failed lookup, which throws.

For a missing index, run `/codebase-reindex` or `codebase-index`, then retry.
While a generation is refreshing, wait for publication rather than treating
the temporary failure as an empty repository.

Source: [`codebase-context-tool.ts`](../../packages/tools/src/codebase-index/codebase-context-tool.ts).
See [calls and impact](../codebase-index-calls.md),
[/codebase-reindex](../slash/codebase-reindex.md) and
[tool discovery](../slash/tools.md).
