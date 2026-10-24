---
name: rust-systems
description: "Build and upgrade Rust services, CLI and systems components with explicit error, async and resource contracts. Use when working on Rust ownership, concurrency, serialization or unsafe boundaries; preserve MSRV and edition compatibility unless their migration is requested."
trigger: "Build and upgrade Rust services, CLI and systems components with explicit error, async and resource contracts. Use when working on Rust ownership, concurrency, serialization or unsafe boundaries; preserve MSRV and edition compatibility unless their migration is requested."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["*.rs", "Cargo.toml"]
---

# Rust Systems

## Selection card
- Task: Implement Rust ownership, error and async boundaries.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Production Rust services (Axum, Tokio, Tonic) and systems libraries rely on typed error domains (`thiserror` for libraries, structured context for applications), cancellation-safe async futures, lock-free or non-await-spanning synchronization, and explicit `unsafe` safety invariants verified with Clippy, tests, and Miri where applicable.

Checked stable Rust target: 1.99.1 on 2026-10-23. Verify rust-version, edition, workspace/toolchain pins and crate support before upgrading.

## Rules

1. Model recoverable errors and finite states explicitly with `Result<T, E>` and enums; never use `.unwrap()` or `.expect()` on untrusted input, network I/O, or fallible arithmetic in production paths.
2. Preserve borrowing, lock, and cancellation invariants across `.await` points: never hold a `std::sync::MutexGuard` across `.await`, and ensure futures inside `tokio::select!` are cancellation-safe.
3. Bound task concurrency (`JoinSet`, `Semaphore`, bounded `mpsc::channel`) and offload synchronous file/CPU work with `tokio::task::spawn_blocking`.
4. Validate deserialization (`serde` limits, `#[serde(deny_unknown_fields)]` where appropriate) at trust boundaries and separate internal domain types from public wire types.
5. For any `unsafe` block or trait implementation, precede it with a `// SAFETY:` comment proving the exact preconditions and audit every caller.
6. Distinguish in-memory `Drop` cleanup from durable async flushing/shutdown (`AsyncWriteExt::shutdown`, graceful task drain).

## Core Patterns & Pitfalls

- **Cancellation Safety in `tokio::select!`**: Dropping an in-flight future at a `.await` point discards any local state accumulated inside that future. Keep state in the outer loop or use cancellation-safe primitives (such as `mpsc::Receiver::recv` or `tokio_util::sync::CancellationToken`).
- **Lock Contention & Deadlocks**: Keep `Mutex`/`RwLock` critical sections short and synchronous—extract the needed data, drop the guard, and then perform async I/O.
- **Anti-pattern — Unbounded Channels & Detached `tokio::spawn`**: Using `mpsc::unbounded_channel()` or detached tasks without backpressure or shutdown tracking allows slow consumers to exhaust process memory.

## Workflow

1. Inspect workspace, features, toolchain/MSRV and current crate APIs.
2. Verify latest compatible stable targets and migration deltas.
3. Implement the feature with typed states and clear ownership.
4. Test error/cancel/restart behavior and boundary inputs; use configured sanitizers/Miri where relevant.
5. Run fmt/clippy/test/build through project commands and validate the deliverable.

## Before returning

- [ ] `Cargo.toml` edition, `rust-version` (MSRV), and workspace feature flags respected
- [ ] Fallible paths return typed `Result` without `.unwrap()`/`.expect()` on external inputs
- [ ] Async tasks bounded (`JoinSet`/`Semaphore`), cancellation-safe in `select!`, and free of blocking calls on async workers
- [ ] Any `unsafe` block accompanied by a concrete, verified `// SAFETY:` invariant
- [ ] `cargo fmt --check`, `cargo clippy`, and `cargo test` pass cleanly

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Rust stable manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml), [Rust book](https://doc.rust-lang.org/book/).

## Skills in scope

- api-design — Axum/Tonic route extractors, typed Problem Details responses, and serde wire contracts.
- testing — unit, property, async cancellation, and Miri/sanitizer verification harnesses.
- observability — `tracing` spans, structured fields, and OpenTelemetry subscriber instrumentation.
- docker-deploy — cached `cargo` multi-stage builds, minimal runtime images, and graceful signal handling.
