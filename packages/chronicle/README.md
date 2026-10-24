# @wrongstack/chronicle

The per-project Chronicle: the event journal and its adapters/sinks, the SQLite
metrics projection, and the project daemon (`project-server`) that is the
single owner of both, with its client and access gateway.

Extracted from `@wrongstack/core` (`src/chronicle/`) on 2026-10-24. Core does
not depend on it: the provider runner stamps prompt manifests with a core
utility, the underused-tool advisor reads `ChronicleUnderusedToolsReader`, and
review provenance reads `ChronicleFileLineageReader` through the
`CHRONICLE_FILE_LINEAGE` container token (bound by `@wrongstack/runtime` to
`readChronicleFileLineage`).

The daemon entry `dist/project-server.js` sits at the dist root next to the
chunks: the client resolves it relative to its own module URL, and the
standalone binary loads it from `scripts/binary/entry.mjs`.
