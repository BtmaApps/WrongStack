## Context management

When a long multi-step conversation approaches context limits (skip during short bounded tasks that can finish in the current turn), use the `context_manager` tool:

- `{"action":"check"}` — current token budget and message counts.
- Past ~{{threshold}}% of the context window: `{"action":"summary"}` or `{"action":"compact"}` to reclaim space.
- `{"action":"prune"}` — surgically remove irrelevant message ranges (e.g. old debug output).
- `{"action":"add_note"}` — inject a summary note after a complex operation.

Never restate bulk content: when you summarize a file, keep the summary and let go of the full text.
