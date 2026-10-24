---
name: java-spring
description: "Build and upgrade Java/Spring services with explicit transaction, concurrency and deployment contracts. Use when implementing Spring Boot APIs, data access or jobs; verify JDK/framework/build-tool compatibility and preserve the application architecture."
trigger: "Build and upgrade Java/Spring services with explicit transaction, concurrency and deployment contracts. Use when implementing Spring Boot APIs, data access or jobs; verify JDK/framework/build-tool compatibility and preserve the application architecture."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["application.{properties,yml,yaml}", "application-*.{properties,yml,yaml}"]
---

# Java Spring

## Selection card
- Task: Implement Spring Boot validation and transactions.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern Java and Spring Boot services combine constructor-injected components, Jakarta Bean Validation (`@Valid`), Spring Security method/route authorization, Spring Data / JPA transaction boundaries (`@Transactional`), and bounded executors or virtual threads. Reliable Spring engineering requires respecting AOP proxy boundaries, preventing lazy-loading leaks into web controllers, and keeping database transactions free of slow external network calls.

Checked 2026-10-23: JDK 27 GA and Spring Boot 4.1.2 stable. Spring Boot 4.2.0-RC1 and JDK 28 are previews/early access. Gradle current release is 9.8.2; verify its JDK/plugin matrix.

## Rules

1. Inspect JDK release target, Maven (`mvnw`) or Gradle (`gradlew`) wrapper, Spring Boot BOM, and dependency constraints.
2. Use constructor injection (`final` fields) and keep singleton `@Service`/`@Component` beans stateless; never store per-request or per-user mutable state on a singleton bean.
3. Validate/authorize endpoints (`@Valid`, `@PreAuthorize`/security filter chains) and map persistence `@Entity` classes to immutable Java `record` DTOs or projections before serialization.
4. Verify `@Transactional` proxy boundaries and rollback rules: self-invocation within the same class bypasses the Spring AOP proxy, and checked exceptions do not trigger rollback unless `rollbackFor` is specified.
5. Keep external HTTP/RPC calls outside open `@Transactional` database connections to prevent HikariCP connection pool starvation, and configure explicit connect/read timeouts.
6. Check migration effects on Jackson serialization, GraalVM native-image reflection hints (if enabled), and graceful shutdown (`server.shutdown=graceful`).

## Core Patterns & Pitfalls

- **Transaction & Proxy Discipline**: Keep `@Transactional` methods `public` on externally called service boundaries (or prefer `TransactionTemplate.execute(...)` for fine-grained programmatic transactions), and fetch required associations via `@EntityGraph` or DTO projections rather than relying on `spring.jpa.open-in-view`.
- **Virtual Threads & Pinning**: When `spring.threads.virtual.enabled=true` is active, avoid long blocking I/O inside `synchronized` blocks where older libraries might pin carrier threads; prefer `ReentrantLock` and bounded connection pools.
- **Anti-pattern — Returning JPA `@Entity` Directly from `@RestController`**: Serializing managed JPA entities directly triggers N+1 lazy-loading queries, risks `LazyInitializationException` or infinite bidirectional JSON recursion, and exposes internal schema columns to mass-assignment or data leaks.

## Workflow

1. Trace controller → service → transaction/data boundary and existing conventions.
2. Establish the latest stable supported toolchain/framework combination.
3. Implement the narrow feature and coherent package/BOM changes if requested.
4. Test validation/auth, transaction failure, concurrency and application lifecycle.
5. Run project tests/build and the packaged service startup/user path.

## Before returning

- [ ] JDK version, Maven/Gradle wrapper, and Spring Boot stable BOM compatibility verified
- [ ] Request/response DTOs (`record`) separated from JPA `@Entity` models with `@Valid` and security checks enforced
- [ ] `@Transactional` proxy boundaries, rollback behavior, and N+1 query plans verified
- [ ] External I/O bounded with timeouts and kept outside long database transactions
- [ ] Maven/Gradle test suite, slice/integration tests, and packaged application startup verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[JDK releases](https://jdk.java.net/), [Spring requirements](https://docs.spring.io/spring-boot/system-requirements.html).

## Skills in scope

- api-design — `@RestController` contracts, `ProblemDetail` (RFC 9457) exception handling, and pagination.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- queues-jobs — implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics.
- testing — `@WebMvcTest`, `@DataJpaTest`, Testcontainers, and transactional rollback verification.
