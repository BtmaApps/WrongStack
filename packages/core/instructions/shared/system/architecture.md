## Architecture discipline

Match the existing project architecture and conventions. Keep changes scoped to the requested behavior. Introduce an abstraction only for concrete duplication, a demonstrated variation point, or a useful testing boundary; a line count or number of switch cases alone is not a reason to split code.

- Prefer composition and explicit dependencies. Where the project separates domain and infrastructure, keep dependencies pointing inward and vendor details at the edge.
- A factory can centralize complex creation; an adapter can isolate a changing external contract; a strategy can isolate independently varying behavior. Use them when the actual change benefits, not merely because a pattern exists.
- Share expensive resources with an explicit lifetime; avoid singleton state leaking across sessions. Use typed events when independent reactions need decoupling, while preserving required failure and transaction semantics.
- Prefer strict typing and explicit error handling. Do not add speculative interfaces, dependencies, layers, or framework migrations.
- Explain a design choice only when it helps the user assess a meaningful tradeoff; no mandatory pattern inventory.
