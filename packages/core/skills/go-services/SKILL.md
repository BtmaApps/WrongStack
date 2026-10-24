---
name: go-services
description: "Build and upgrade Go services, workers and CLI applications with context propagation and explicit ownership. Use when implementing Go HTTP/data/concurrency paths; preserve module and deployment constraints and verify race-sensitive behavior deterministically."
trigger: "Build and upgrade Go services, workers and CLI applications with context propagation and explicit ownership. Use when implementing Go HTTP/data/concurrency paths; preserve module and deployment constraints and verify race-sensitive behavior deterministically."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["*.go", "go.mod"]
---

# Go Services

## Selection card
- Task: Build Go handlers, concurrency and cancellation.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Production Go services and CLI tools rely on explicit `context.Context` propagation, structured concurrency (`errgroup.WithContext`, bounded worker pools, clear channel ownership), wrapped error inspection (`errors.Is`, `errors.As`, `errors.Join`), and race-free state transitions verified under `go test -race`.

Checked stable Go target: 1.27.3 on 2026-10-23. Inspect go.mod/toolchain, dependencies and actual compiler before using release-specific APIs.

## Rules

1. Propagate `context.Context` deadlines and cancellation through all owned I/O (`http.NewRequestWithContext`, `db.QueryContext`) and child goroutines.
2. Define channel and goroutine ownership explicitly: only the sender closes a channel, every spawned goroutine has a known stop condition, and owners wait (`sync.WaitGroup` / `errgroup.Group`) before returning.
3. Bound concurrency (`errgroup.SetLimit` / semaphore) and request sizes (`http.MaxBytesReader`, `ReadHeaderTimeout`); spawning one goroutine per unbounded input item is a resource leak.
4. Wrap errors with context (`fmt.Errorf("...: %w", err)`), check `rows.Err()`, and `defer` close/cleanup on every path after checking the open error.
5. Protect shared state (`sync.Mutex`, `atomic`) and beware shallow struct copies that still share underlying slices, maps, or pointers.
6. Distinguish compile success from data races and lifecycle correctness.

## Core Patterns & Pitfalls

- **Gated Goroutine Lifecycle**: Tie background loops to `ctx.Done()`, use `select { case out <- v: case <-ctx.Done(): return ctx.Err() }` on sends that could block when consumers exit early, and wait for exit in `Close()`/`Shutdown()`.
- **HTTP Client & Server Timeouts**: Never use the zero-timeout `http.DefaultClient` or `http.ListenAndServe` in production; configure explicit `ReadHeaderTimeout`, `WriteTimeout`, `IdleTimeout`, and request context deadlines.
- **Anti-pattern — Nil-Interface Trap & Deferred Close Ignores**: Returning a typed `nil` pointer wrapped in an `error` interface creates a non-nil `error`, and ignoring `defer file.Close()` errors on writable files can silently drop buffered writes.

## Workflow

1. Inspect modules, entrypoint, existing interfaces and tests.
2. Verify current toolchain target and dependency support.
3. Implement the narrow path with context and cleanup contracts.
4. Use controlled completion ordering for lifecycle/race cases; run the configured race detector where applicable.
5. Run project format/vet/test/build and exercise the actual command/service.

## Before returning

- [ ] `go.mod` version/toolchain directive and module dependencies verified
- [ ] `context.Context` deadlines and cancellation propagated through all I/O and goroutines
- [ ] Every spawned goroutine and channel has bounded concurrency and deterministic shutdown wait
- [ ] `go vet` and `go test -race` pass with deterministic synchronization (no sleep-based races)
- [ ] HTTP/DB timeouts, body limits, and error wrapping (`%w`) verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Go releases](https://go.dev/dl/?mode=json), [Go documentation](https://go.dev/doc/).

## Skills in scope

- api-design — HTTP routing (`net/http` `ServeMux` patterns), JSON decoding bounds, and status/error contracts.
- observability — structured logging (`log/slog`), OpenTelemetry trace propagation, and Prometheus metrics.
- testing — table-driven tests, `synctest` / deterministic barrier synchronization, and `-race` verification.
- docker-deploy — multi-stage static/distroless Go binary builds and container signal handling.
