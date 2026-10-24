---
name: dotnet-backend
description: "Build and upgrade ASP.NET Core services with typed contracts, dependency lifetimes and verified persistence. Use when implementing .NET APIs, background services or runtime migrations; coordinate SDK, target framework and package support."
trigger: "Build and upgrade ASP.NET Core services with typed contracts, dependency lifetimes and verified persistence. Use when implementing .NET APIs, background services or runtime migrations; coordinate SDK, target framework and package support."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["*.csproj", "appsettings*.json", "Program.cs"]
---

# Dotnet Backend

## Selection card
- Task: Build ASP.NET services and dependency injection.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern ASP.NET Core services combine Minimal APIs or controllers, `ProblemDetails` error standardization, strict Dependency Injection lifetimes (`Singleton`, `Scoped`, `Transient`), EF Core persistence, and `IHostedService`/`BackgroundService` workers. Reliable .NET backend engineering requires preventing captive dependencies, propagating `CancellationToken` end-to-end, and keeping `DbContext` instances strictly unit-of-work scoped.

Checked 2026-10-23: .NET stable SDK 10.0.402 and runtime 10.0.13. .NET 11 RC is a preview, not the stable target. Verify framework/package compatibility before upgrade.

## Rules

1. Inspect `global.json`, Target Framework Monikers (`<TargetFramework>`), `Directory.Packages.props` central package management, and project references.
2. Preserve DI lifetimes (`ValidateScopes` / `ValidateOnBuild`); `Singleton` services and `BackgroundService` instances must never directly inject `Scoped` services like `DbContext`—resolve a scope via `IServiceScopeFactory.CreateAsyncScope()` per unit of work.
3. Validate and authorize Minimal API/controller endpoints at the server boundary (`RequireAuthorization`, endpoint filters/validators) and bind/serialize explicit DTOs (`record` types) rather than EF entities.
4. Propagate `CancellationToken` to all async I/O (`ToListAsync(ct)`, `SaveChangesAsync(ct)`, `HttpClient`) and never block threads with `.Result` or `.Wait()` (sync-over-async).
5. Use `AsNoTracking()` for read-only EF Core queries, configure optimistic concurrency tokens (`[Timestamp]` / `IsRowVersion` / concurrency tokens) where needed, and register typed `HttpClient` instances via `IHttpClientFactory`.
6. Separate configuration/secrets (`IOptions<T>` with validation) from application artifacts and public `ProblemDetails` responses.

## Core Patterns & Pitfalls

- **Scoped Work Inside `BackgroundService`**: Inject `IServiceScopeFactory` into long-running hosted services and create a fresh `await using var scope = scopeFactory.CreateAsyncScope();` for each iteration or message.
- **EF Core Thread Safety**: A single `DbContext` instance is not thread-safe; never run `Task.WhenAll` over concurrent queries sharing the same `DbContext`—use `IDbContextFactory<TContext>` when parallel database reads are genuinely required.
- **Anti-pattern — Sync-over-Async & Socket Exhaustion**: Calling `.GetAwaiter().GetResult()` causes thread-pool starvation under load, and instantiating `new HttpClient()` per request exhausts ephemeral sockets.

## Workflow

1. Trace endpoint/background work and current DI/persistence patterns.
2. Resolve the stable SDK/runtime target and official migration requirements.
3. Implement the narrow feature with existing contracts and cancellation.
4. Test authorization, validation, database failure/concurrency and service stop.
5. Run configured restore/build/tests and publish/start the actual runtime artifact.

## Before returning

- [ ] `global.json`, `<TargetFramework>`, and NuGet package versions verified on stable .NET release
- [ ] DI lifetimes verified free of captive `Scoped` dependencies inside `Singleton` / hosted services
- [ ] `CancellationToken` propagated through endpoints, `HttpClient`, and EF Core async calls
- [ ] Public request/response DTOs separated from EF Core entities with `ProblemDetails` error handling
- [ ] `dotnet build`, `dotnet test` (`WebApplicationFactory` where applicable), and startup verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/), [.NET releases](https://dotnet.microsoft.com/en-us/download/dotnet).

## Skills in scope

- api-design — Minimal API / controller route conventions, `ProblemDetails` (RFC 9457), and OpenAPI contracts.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
- testing — integration testing with `WebApplicationFactory<TEntryPoint>` and transactional database fixtures.
