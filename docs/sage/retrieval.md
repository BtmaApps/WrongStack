# SAGE and vector retrieval ownership

The SAGE daemon owns structured memories, candidates, graph relations and
lexical/path retrieval. A host can add semantic recall from the separate
`@wrongstack/vector-memory` store. Functions are not passed through JSON IPC.

| Stage | Source |
|---|---|
| Lexical/path visibility and structured store | [`packages/sage/src/`](../../packages/sage/src/) |
| Durable vectors and embedding cache | [`store.ts`](../../packages/vector-memory/src/store.ts), [`schema.ts`](../../packages/vector-memory/src/schema.ts) |
| Host-side read capability wrapper | [`sage-port-wrapper.ts`](../../packages/vector-memory/src/sage-port-wrapper.ts) |
| CLI/TUI composition | [`vector-memory-setup.ts`](../../packages/cli/src/wiring/vector-memory-setup.ts) |
| WebUI-server composition | [`start-webui-vector.ts`](../../packages/webui-server/src/server/start-webui-vector.ts) |

`wrapMemoryPortWithVectorRecall` retrieves the port's lexical results and local
semantic results, then fuses them. Vector-only hits are materialized through
the structured port with its visibility rules reapplied; materialization is
bounded. Write, hygiene and audit capabilities pass through unchanged.

SAGE's offline hashing re-ranker is a separate local ranking aid. It is not
the durable vector store. A service exposing only SAGE IPC/MCP does not
automatically inherit a WrongStack host's vector fusion.

Injection and meaningful use have additional relation, score, scope and budget
gates. [Collection, recall and feedback](../sage-feedback-lifecycle.md) describes
the current feedback lifecycle. A citation or text overlap is observational
evidence, not proof that a memory caused a successful outcome.

Use [the system reference](SYSTEM-REPORT.md), [configuration](../configuration.md)
and `/memory race` for the related controls. The September pipeline audit is
[historical](../archive/sage/MEMORY-PIPELINE-2026-09-03.md).
