# Target Architecture

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Architectural objective

WrongStack should be a modular monorepo with one authority per contract or behavior, explicit dependency direction, thin hosts, and time-bounded compatibility. Physical package extraction is used when it improves ownership or dependency direction; cohesive internal modules remain inside their package when a new release unit would add no value.

## Dependency direction

The target dependency flow is:

```text
Applications and hosts
  CLI · Desktop · WebUI Server · TUI · WebUI · SimpleUI · WebUI HQ
                              |
                              v
Feature/runtime implementations
  Runtime · Coordination · Storage · Super Memory · Tools · Providers
  Plugins · ACP · MCP · SDD · Kanban · Techstack · Security Scanner
                              |
                              v
Neutral contracts and primitives
  Contracts · Surface Protocol · Kernel primitives · errors · identifiers
```

Dependencies may point downward. A lower tier must not import a higher-tier implementation, surface, or host. Type-only cycles are also prohibited because they still couple ownership, compilation, and public API evolution.

## Proposed package authorities

Names are provisional until the corresponding ADR is accepted. Ownership and dependency properties are mandatory even if the final package names differ.

### `@wrongstack/contracts`

Owns dependency-light, environment-neutral contracts used by more than one package:

- stable identifiers and value objects;
- event payload DTOs rather than mutable full `Context` objects;
- `MemoryPort` and memory query/result contracts;
- provider and plugin manifest schemas when they are host-neutral;
- lifecycle/disposable interfaces;
- capability and trust decision inputs;
- shared error codes where runtime classes are not required.

Must not own:

- storage implementations;
- HTTP, WebSocket, filesystem, process, or terminal code;
- React/Ink types;
- provider SDKs;
- product feature defaults.

Controls:

- no Node built-ins unless the subpath is explicitly Node-only;
- no dependency on another WrongStack implementation package;
- domain-specific subpaths instead of one giant barrel;
- runtime decoders live with externally sourced data contracts.

### Surface protocol authority

Either a dedicated `@wrongstack/surface-protocol` package or a strictly isolated contracts subpackage owns:

- versioned client/server messages;
- runtime decoders and validation failures;
- capability negotiation;
- event envelopes;
- golden protocol fixtures;
- compatibility translation between supported versions.

It does not own transport connections, WebSocket servers, React state, or CLI handlers.

### `@wrongstack/core`

Core remains the foundation for true agent-domain behavior and kernel primitives that cannot yet be separated economically. Its long-term contents should be limited to:

- agent/domain primitives;
- context and pipeline primitives, after event payload decoupling;
- domain errors that are genuinely cross-cutting;
- stable agent lifecycle interfaces;
- narrow public subpaths with explicit ownership.

Core should stop owning:

- built-in product plugin implementations;
- GitHub-backed skill installation and generation;
- HQ server or backend behavior;
- application management tools;
- concrete storage defaults and cloud synchronization;
- provider UI metadata;
- design execution product workflow;
- host composition.

The root barrel becomes a compatibility surface. New code imports domain subpaths. Root exports are reduced only through additive replacement, usage measurement, deprecation, and scheduled removal.

### `@wrongstack/runtime`

Runtime has two allowed final states, selected by the existing pilot gate:

1. **Concrete runtime owner:** owns default implementations and dependency wiring for storage, observability, security, models, compaction, skills, and memory adapters; or
2. **Removed facade:** if the pilot demonstrates mostly pass-through exports or increased import complexity, Runtime is folded and concrete owners remain separate.

The current halfway state is not acceptable. Runtime must not use unsafe casts to conceal incompatible contracts.

### Feature and infrastructure packages

- `@wrongstack/coordination`: Director, mailbox/fleet coordination, leases, assignment lifecycle, recovery, and coordination policies.
- `@wrongstack/storage`: persistence primitives and repositories, with domain repositories separated from generic atomic persistence.
- `@wrongstack/sage`: one implementation of `MemoryPort`, internally split into command, query, index, migration, and persistence services.
- `@wrongstack/webui-server`: sole HTTP/WebSocket backend authority for browser surfaces.
- `@wrongstack/providers`: provider definitions, factories, auth/capabilities, and generated projections.
- `@wrongstack/plugins`: product plugin implementations plus a typed, data-only manifest authority.
- `@wrongstack/tools`: tool contracts, manifests, tier/pack selection, and tool implementations grouped by feature.
- `@wrongstack/security-scanner`: real security scanning implementation with one production composition route.

Not every item must become a separately published package immediately. Internal package boundaries may be piloted first, but they must obey the same dependency rules.

## Surface ownership

| Surface | Owns | Must not own |
|---|---|---|
| CLI | argument parsing, terminal host selection, bootstrap, composition, shutdown | reusable domain services, WebUI backend implementation, duplicated provider/plugin facts |
| TUI | Ink rendering, focus, keyboard interaction, surface-local view state | agent execution policy, shared domain state, provider facts |
| WebUI | React rendering and browser-local presentation state | wire protocol authority, Node-only utilities, server behavior |
| WebUI Server | HTTP/WS transport, backend handlers, authenticated service adapters | CLI behavior, React state, duplicated protocol definitions |
| WebUI HQ | HQ browser presentation | second HQ backend or CLI fallback dashboard |
| SimpleUI | deliberately minimal presentation | independent semantic protocol and duplicated app services |
| Desktop | Electron lifecycle, IPC adapter, native integration | business/runtime process orchestration that can be host-neutral |
| app wrapper | executable entrypoint | any product behavior |

## State and event boundaries

### Event payloads

Kernel events must not transport the full mutable `Context`. Define minimal immutable event DTOs containing only the fields required by consumers. If a consumer needs live services, it receives them through composition, not through an event payload.

### TUI and browser state

Shared state is limited to semantic, renderer-neutral concepts:

- connection state machine;
- session and execution projections;
- provider/model capabilities;
- normalized server events;
- commands and permissions.

Renderer-specific focus, selected rows, viewport positions, animation, open panels, and keyboard modes remain local.

### Persistence

Repositories depend on a small persistence primitive rather than importing large storage facades. Domain services receive repository ports. Migration code is isolated and cannot become a normal request path.

## Metadata authorities

### ProviderDefinition

A provider definition should contain:

- stable provider ID and family;
- display metadata;
- authentication strategies;
- default and local endpoint rules;
- capabilities and model-discovery behavior;
- factory loader;
- browser-safe projection;
- documentation projection metadata.

CLI menus, WebUI cards, auto-discovery, trusted presets, and capability maps must consume generated projections rather than maintain separate lists.

### PluginManifest

A plugin manifest should contain:

- stable name and version compatibility;
- default enabled state;
- capability and permission declarations;
- configuration schema and lifecycle semantics;
- dependency metadata;
- data-only audit/documentation fields;
- a lazy loader function or loader key.

Hosts decide whether a plugin is enabled before importing its implementation.

### ToolDefinition

Tool definitions should supply stable identity, tier/pack membership, capability requirements, schema, and factory loader. Tool packs become projections from definitions, not central static imports that import every implementation.

## Compatibility architecture

Every adapter must be directional:

```text
legacy consumer -> compatibility adapter -> canonical authority
```

The canonical authority never imports the compatibility adapter. Each adapter records:

- owner;
- reason;
- introduction date;
- supported release window;
- usage query;
- removal condition;
- rollback route.

Compatibility barrels may re-export canonical APIs, but canonical implementation modules must never import those barrels.

## Public API rules

1. New code imports declared subpaths, not package root barrels.
2. `types/index.ts` files export types only; they cannot re-export implementations.
3. Browser packages cannot alias directly into sibling source trees.
4. Public types cannot depend on component implementation files.
5. Runtime decoders accompany untrusted wire/config data.
6. A public export is added only with an owner and compatibility expectation.
7. Root-barrel reduction is measured through repository and external-usage scans.

## Architecture success indicators

- no module strongly connected components outside explicitly generated test fixtures;
- no unsafe cast between primary runtime ports and their implementations;
- no manually synchronized provider/plugin/protocol list;
- one production WebUI backend path;
- no feature implementation under Core's plural `plugins/` directory;
- root Core imports decrease each wave;
- each top-level UI shell has one-way dependencies on feature modules;
- architecture exceptions trend to zero and cannot pass expiry silently.
