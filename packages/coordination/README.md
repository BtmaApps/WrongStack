# @wrongstack/coordination

Multi-agent coordination: the director and its tools, the fleet manager and
supervisor, delegation and dispatch, the collaboration bus, and the project
mailbox with its per-project daemon. It also holds the composition attach
modules (`mailbox-attach`, `session-note-attach`, `leader-delivery-attach`)
behind `defaultAgentCoordination`, which hosts bind to core's
`AGENT_COORDINATION` token (`@wrongstack/runtime` does).

Extracted from `@wrongstack/core` (`src/coordination/`) on 2026-10-24. It
depends on core's public subpaths (`agent`, `brain`, `utils`, `security`,
`storage`, `session-catalog`, `typesafe`, `sandbox`, `vcs`, `execution`) and on
`@wrongstack/agent-catalog`; core does not depend on it.

The mailbox daemon entry is `dist/mailbox-project-server.js`. It must stay at
the dist root beside the chunks: the client resolves it relative to its own
module URL, and the standalone binary loads it from `scripts/binary/entry.mjs`.
