# Surfaces and Hosts Workstream

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Workstream objective

Make CLI and Desktop thin hosts, make TUI/WebUI/SimpleUI/WebUI HQ presentation shells, and establish `@wrongstack/webui-server` plus the neutral surface protocol as the only browser-backend authority.

## Shared prerequisites

- complete runtime and test-project inventory;
- surface protocol contract and runtime decoders;
- golden request/response/event fixtures;
- shared connection state machine and pure semantic projections;
- provider/plugin metadata authorities available for surface projection;
- explicit trust and capability boundary for privileged actions.

## A. CLI

**Canonical tasks:** `C1–C3`, with dependencies on `L1`, `P3`, `M1–M3`, and `R3`

### Current responsibilities to remove

- reusable execution and memory services;
- a second WebUI backend implementation;
- provider and plugin metadata lists;
- slash-command-owned business logic;
- broad `SlashCommandContext` coupled to every command;
- HQ inline dashboard implementation;
- behavior duplicated from standalone packages for parity.

### Target CLI structure

```text
cli/
  entry/             # argv, environment, exit codes
  bootstrap/         # config and dependency composition
  runtime/           # host lifecycle coordination only
  surfaces/          # TUI, headless, WebUI, HQ adapters
  commands/          # parsing and thin use-case adapters
  shutdown/          # disposal and signal coordination
```

### Planned slices

#### A1 — Characterize boot and dispatch

Add journeys for help/version, invalid configuration, headless prompt, TUI launch, WebUI launch, plugin setup failure, signal shutdown, and dependency disposal order.

#### A2 — Split slash command contract from catalog

Move `SlashCommandContext` to a dependency-light `commands/context.ts`. Commands import only the smallest context capability they require. Registration moves to a catalog module; context must never import command implementations.

Prefer capability subinterfaces:

- `SessionCommandServices`;
- `MemoryCommandServices`;
- `ProviderCommandServices`;
- `CoordinationCommandServices`;
- `UiCommandServices`.

#### A3 — Extract reusable command services

Move memory, suggestion parsing, provider management, plugin management, and other reusable behavior to their owning package. Slash commands validate input and map results to terminal output.

#### A4 — Define explicit CLI phases

Build independently testable phase functions:

1. parse and validate startup;
2. compose dependencies;
3. initialize plugins and adapters;
4. select and run surface;
5. coordinate shutdown;
6. dispose resources in reverse order.

#### A5 — Integrate disposable lifecycle

Plugin host, WebUI server, filesystem watchers, fleet/mailbox bridges, MCP clients, and other resources return idempotent disposables owned by the host scope.

#### A6 — Reduce `cli-main`

After responsibilities are moved, `cli-main` composes phases and maps failures to exit behavior. It must not become a collection of forwarding wrappers around functions that still depend on the complete CLI context.

### CLI exit gate

- CLI owns composition and terminal concerns only;
- commands depend on narrow capability interfaces;
- reusable behavior has non-CLI owners;
- shutdown is deterministic and tested;
- CLI has no embedded WebUI handler behavior or inline HQ application.

## B. WebUI backend consolidation

**Canonical task:** `P3`

### Current problem

CLI and `@wrongstack/webui-server` independently implement message routing, handlers, event setup, lifecycle, and helper behavior. Source comments explicitly describe mirroring and parity. Message types are also declared separately by server, CLI, and frontend packages.

### Canonical ownership

- surface protocol package: messages, decoders, versions, fixtures;
- WebUI Server: transport, authentication integration, message dispatch, handler application services, event subscriptions;
- CLI: supplies host capabilities and starts/stops the server;
- WebUI/SimpleUI: clients of the protocol.

### Handler-family migration protocol

For each handler family:

1. capture old CLI and standalone server behavior with common golden fixtures;
2. define required capability ports in WebUI Server;
3. make both old entrypoints call the same canonical handler;
4. compare responses, emitted events, side effects, validation, and authorization;
5. switch production composition to the canonical path;
6. retain a feature-flag rollback for one release where risk warrants it;
7. delete the old CLI implementation after usage scan.

### Recommended handler order

1. handshake, version, and capabilities;
2. read-only status, history, and configuration;
3. provider/model discovery;
4. session message and execution operations;
5. memory operations;
6. Kanban and coordination operations;
7. privileged process, filesystem, or terminal operations;
8. event subscriptions and shutdown lifecycle;
9. static asset hosting.

Read-only handlers go first. Privileged and state-mutating handlers wait for trust-boundary coverage.

### Exit gate

- one dispatcher and handler implementation per message;
- protocol types are imported from the neutral authority;
- CLI has no `message-router`, mirrored handlers, or duplicate server message unions;
- behavioral parity tests replace source-regex parity checks.

## C. TUI

**Canonical tasks:** `T1–T3`

### Current problems

- the root application owns most feature workflows and subscriptions;
- root state and actions depend on component implementation models;
- one reducer handles hundreds of unrelated actions;
- effects and callbacks cross domain boundaries;
- UI-neutral behavior is difficult to test without rendering the whole application.

### Target feature structure

```text
tui/
  shell/                     # root composition and layout
  features/
    session/
      model.ts reducer.ts controller.ts view.tsx
    execution/
    history/
    settings/
    providers/
    kanban/
    fleet/
    coordination/
    overlays/
  input/                     # key routing and command mapping
  shared/                    # renderer-specific reusable controls
```

Feature names may differ; the rule is that model/reducer/controller do not import from the view implementation.

### Planned slices

#### C1 — Journey harness

Cover startup, submit, streaming, cancellation, mode/provider change, overlay precedence, picker navigation, history, Kanban action, fleet status, and shutdown.

#### C2 — Input router

Convert raw key events into semantic commands based on explicit mode/overlay state. Views receive commands or callbacks rather than reading global key behavior.

#### C3 — Submit/run controller

Extract validation, prompt preparation, execution start/cancel, and result transition from the root component. Keep rendering state changes explicit.

#### C4 — Overlay manager

Define one overlay stack/priority model. Pickers own their internal selection; the shell owns which overlay is active.

#### C5 — Feature reducers

Move action/state types out of component files. Split reducer domains and compose them at the shell. Cross-feature actions become explicit application events rather than direct state mutation.

#### C6 — Subscription hooks

Group effects by service/feature. Each hook owns subscription and cleanup. Avoid hooks that require the complete application state and dispatch surface.

#### C7 — Root shell reduction

The root app selects layout, composes providers/controllers, and renders features. It should not implement domain rules.

### TUI exit gate

- app state/reducer does not import component implementation files;
- each feature has independent reducer/controller tests;
- root app dependency fan-out and effect count are materially reduced;
- keyboard and overlay behavior remains protected by journeys;
- no feature slice depends back on the shell.

## D. WebUI

**Canonical tasks:** `P1`, `P2`, plus metadata tasks

### Current problems

- a giant `types.ts` combines wire and presentation concepts;
- direct Vite aliases reach into Core and Tools source;
- a local Core browser shim duplicates general utilities;
- provider presets and color behavior are mirrored;
- large components combine data loading, domain state, interactions, and rendering;
- CommandPalette and slash routing form a cycle.

### Planned slices

1. Move wire types and validation to the protocol authority.
2. Replace source aliases with declared browser-safe package exports.
3. Remove `core-browser-shim` as consumers move to neutral utilities/contracts.
4. Consume provider and plugin browser projections.
5. Break CommandPalette cycle by importing leaf export utilities directly and placing command application in a service/hook.
6. Split large components by controller/model/view seam:
   - KanbanView;
   - CodeMap;
   - OfficeMapCanvas;
   - AgentOfficeView;
   - SetupScreen.
7. Keep renderer state local; share only protocol normalization and pure projections.
8. Remove unused package dependencies after source and build-output scans.

### Component split acceptance

A split is successful only when:

- data fetching/subscription has one owner;
- mutations flow through a controller or service;
- views can render from explicit props or a narrow feature model;
- no new circular imports appear;
- feature behavior is testable without the full application.

## E. SimpleUI

**Canonical task:** `P6`

### Planned slices

1. Move `isVisionModel` to a neutral provider/model utility to break the app/model-switcher cycle.
2. Adopt canonical protocol decoders.
3. Adopt shared connection state and semantic projections.
4. Keep minimal renderer-specific state local.
5. Delete duplicated message normalization and provider/model logic.

**Exit:** SimpleUI is a thin alternative renderer, not a second semantic client architecture.

## F. WebUI HQ and CLI HQ fallback

**Canonical task:** `P5`

### Planned slices

1. Inventory feature parity and recovery behavior between inline CLI HQ dashboard and WebUI HQ.
2. Guarantee packaged asset discovery and a small non-featureful recovery response.
3. Move missing required features into WebUI HQ.
4. Route production HQ hosting through WebUI Server or the accepted HQ host.
5. Delete the featureful inline HTML application.

**Exit:** one featureful HQ frontend exists; CLI fallback is only a diagnostic/recovery shell if retained.

## G. Desktop

**Canonical tasks:** `P4`, `S3`

### Target ownership

Desktop retains:

- Electron main/renderer lifecycle;
- native menu, notification, window, and OS integration;
- authenticated IPC adaptation;
- update/distribution behavior.

Runtime process management, server semantics, provider facts, and wire protocol belong to shared authorities.

### Planned slices

1. Introduce canonical protocol and trust-boundary adapters.
2. Move runtime child-process orchestration behind a host-neutral runtime/server service where practical.
3. Ensure extracted helpers are used by the production main path before deleting old implementations.
4. Make IPC contracts versioned and decoded.
5. Test start, restart, crash recovery, shutdown, and upgrade flows.

**Exit:** Desktop is a native host adapter and has no private copy of backend semantics.

## H. App wrapper

The application wrapper is already correctly thin. Protect it with a simple architecture assertion:

- imports only the declared CLI entrypoint;
- does not acquire product dependencies;
- contains no feature branching.

## Workstream completion criteria

- browser messages have one contract authority;
- WebUI Server is the sole backend authority;
- CLI owns composition rather than duplicated services;
- TUI and browser roots are feature-composition shells;
- SimpleUI consumes shared semantics;
- WebUI HQ is the only featureful HQ frontend;
- Desktop is a thin native host;
- source aliases and browser shims no longer bypass package boundaries.
