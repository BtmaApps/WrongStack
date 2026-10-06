# Platform and Extensions Workstream

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Workstream objective

Consolidate provider, plugin, and tool authorities; remove compatibility cycles and orphan integrations; and apply focused maintainability improvements to every remaining package without manufacturing unnecessary package boundaries.

## A. Providers

**Canonical task:** `M1`

### Current problem

Provider family, authentication, local presets, endpoints, model capabilities, discovery, and UI display facts are represented in Core, Providers, CLI, WebUI, and WebUI Server. These lists can drift and adding a provider requires unrelated edits.

### Planned slices

1. Inventory every provider fact and classify it as secret/server-only, runtime factory, or browser-safe metadata.
2. Define `ProviderDefinition` and projection schemas.
3. Add validation for duplicate IDs, families, auth strategies, capability contradictions, and missing display information.
4. Convert one low-risk provider as a vertical pilot.
5. Generate or derive:
   - trusted and compatible presets;
   - capability/family maps;
   - CLI authentication menu entries;
   - WebUI setup cards and local presets;
   - WebUI Server auto-discovery metadata;
   - documentation tables.
6. Migrate remaining providers.
7. Delete manually synchronized lists and add a test prohibiting their reintroduction.

### Exit gate

One provider addition changes one canonical definition and implementation. Browser projections contain no secrets or Node/provider-SDK dependencies.

## B. Plugins

**Canonical tasks:** `L1`, `L2`, `M2`

### Current problem

Plugin implementations are reasonably separated by folder, but metadata and loading are centralized and repeated. Catalog inspection imports implementations eagerly. Built-in product plugins are split between Core and `@wrongstack/plugins`.

### Planned slices

1. Define a data-only `PluginManifest` schema.
2. Separate manifest discovery from implementation import.
3. Decide enablement and configuration before calling a lazy loader.
4. Return a host-owned disposable handle from plugin setup.
5. Define setup failure rollback, reverse teardown, deadlines, idempotence, and per-host state isolation.
6. Project catalog, audit, CLI display, documentation, and package checks from manifests.
7. Move Core product plugin implementations into the plugin authority.
8. Decide whether externally heavy plugins deserve individual packages; keep lightweight cohesive plugins as package subpaths.
9. Add pack/publish tests verifying that loaders resolve from built artifacts, not workspace source aliases.

### Exit gate

- disabled plugins are not imported;
- metadata has one canonical edit path;
- every loaded plugin is disposed deterministically;
- Core owns plugin contracts only, not product plugin implementations.

## C. Tools

**Canonical task:** `M3`

### Current problem

Root tool registration and built-in catalogs import many implementations statically. Tool packs, built-ins, scaffolding, and catalogs have bidirectional pressure. Several individual tools are feature-sized.

### Planned slices

1. Define `ToolDefinition` with stable identity, schema, tier/pack membership, capability needs, and lazy factory.
2. Make tier/pack selection a pure projection.
3. Remove central imports of inactive tool implementations.
4. Group tools by feature ownership rather than a single flat built-in file.
5. Break catalog/pack/scaffold cycles by enforcing `definition -> loader`, never `implementation -> catalog`.
6. Split `codebase-index/writer` into traversal, chunking, persistence, and reporting responsibilities.
7. Split large Kanban/session tools into command parsing and owning-package services.
8. Keep CLI responsible only for host capability composition.

### Exit gate

Adding a tool requires one definition and implementation; pack selection does not import all tools; no tool implementation imports the central catalog.

## D. ACP

**Canonical tasks:** `S2`, `M4`

### Current problem

ACP is a coherent package but retains legacy compatibility entrypoints. `run-one-acp-task` imports the subagent runner while the runner re-exports `runOne` for compatibility, creating an avoidable cycle.

### Planned slices

1. Establish authoritative v1/SDK client, server, and integration entrypoints.
2. Move shared runner contracts to a leaf module.
3. Make compatibility entrypoints one-way wrappers that canonical modules never import.
4. Add filesystem/terminal TrustBoundary enforcement.
5. Test realpath containment, symlink escape, environment sanitization, cancellation, and process cleanup.
6. Deprecate and remove legacy entrypoints after usage scan and release window.

### Exit gate

No ACP runtime cycle exists; privileged operations pass through the shared decision seam; compatibility entrypoints are directional and scheduled.

## E. MCP

### Assessment

MCP is cohesive and does not need immediate package extraction. Its registry, client, and authorization modules are large enough to require internal seams as it grows.

### Planned improvements

1. Define leaf protocol/config DTO modules that do not import clients or registries.
2. Separate registry persistence from connection/session lifecycle.
3. Keep authorization policy independent from transport implementation.
4. Add lifecycle/disposal conformance for clients.
5. Prevent Core from acquiring a runtime dependency on MCP; hosts or WebUI Server compose MCP capabilities.
6. Add contract tests for resources, prompts, tools, auth, reconnection, and shutdown.

### Exit gate

Registry, transport, and authorization have one-way internal dependencies and no reverse Core edge.

## F. SDD

### Assessment

SDD is a successful extraction from former CLI ownership. Preserve the package boundary and continue reducing the large parallel-run orchestration path.

### Planned improvements

1. Separate plan interpretation from scheduling.
2. Separate task dispatch from worker/process adapters.
3. Isolate worktree merge and recovery policy.
4. Make supervisor state explicit and testable.
5. Keep CLI slash commands as thin adapters.
6. Document the semantic difference between SDD plans and the generic Core Goal domain.

### Exit gate

Parallel-run composes scheduler, dispatcher, merge/recovery, and supervisor services; it does not implement them inline.

## G. Security Scanner

**Canonical task:** `M5`

### Current problem

The package contains a real scanner/orchestrator and command behavior, but production composition does not import it. Core exposes a no-op security plugin that logs availability without wiring the real implementation. Tests and comments retain stale assumptions about an older location.

### Decision required

Choose exactly one:

1. register `@wrongstack/security-scanner` through the typed plugin/CLI composition path under a stable command and lifecycle; or
2. remove the package, placeholder plugin, and stale tests if the feature is intentionally unsupported.

The preferred path is real registration after `PluginManifest` is available.

### Exit gate

There is no no-op placeholder suggesting unavailable behavior. The real scanner is either reachable, tested, and packaged, or intentionally absent.

## H. Techstack

### Assessment and plan

Techstack is cohesive. Its primary architectural smell is supplying `undefined as unknown as Context` where a headless research path has no Context.

1. Identify the actual capabilities required by research/search.
2. Replace Context with a narrow interface or optional service.
3. Add a headless contract test.
4. Remove the sentinel cast.

No package split is required unless later growth introduces independent release or dependency needs.

## I. Telegram

### Assessment and plan

Telegram has a good plugin boundary and uses Core as a peer appropriately.

1. Compare its redaction behavior with other secret-scrubbing utilities.
2. Move generic redaction to a neutral security utility only if semantics can be unified.
3. Keep Telegram formatting, polling/webhook, and chat state local.
4. Add lifecycle/disposal conformance through the plugin host.

Avoid moving Telegram-specific behavior into Core.

## J. Plug-LSP

### Assessment and plan

Plug-LSP has a reasonable plugin boundary. Work is lower priority:

1. keep document tracking, server registry, and tool adapter dependency direction explicit;
2. split the large slash command into parsing, service call, and rendering if it continues to grow;
3. consume plugin lifecycle and manifest authorities;
4. verify package/peer dependency behavior from built artifacts.

No physical split is currently justified.

## K. Website

Website was inspected by the audit but is explicitly outside the implementation scope by the 2026-07-21 user decision. Refactor tasks, generated metadata migrations, and broad formatting must not modify `website/`. Cross-repository verification may report Website facts only when it can do so without requiring Website changes.

## L. Bench

Bench is cohesive and low priority. Maintain it as an independent consumer of public APIs.

Improvements:

- prevent benchmarks from importing package internals;
- add explicit dataset/fixture ownership;
- keep benchmark configuration separate from benchmark implementations;
- use benchmarks as regression evidence for memory, protocol, and coordination refactors.

## M. Package-level completion matrix

| Package | Required end state |
|---|---|
| Providers | One typed provider authority and generated projections |
| Plugins | Data-only manifests, lazy loading, deterministic lifecycle |
| Tools | Definition-driven packs and one-way catalogs |
| ACP | Canonical entrypoints, no compatibility cycle, trusted execution |
| MCP | One-way registry/transport/auth internals and clean lifecycle |
| SDD | Explicit scheduler/dispatch/supervisor boundaries |
| Security Scanner | One real production composition route or intentional removal |
| Techstack | Narrow headless research dependency, no fake Context |
| Telegram | Plugin lifecycle conformance and shared redaction where valid |
| Plug-LSP | Preserved plugin boundary and reduced command coupling |
| Website | Out of implementation scope; audit evidence only |
| Bench | Public-API-only performance consumer |
