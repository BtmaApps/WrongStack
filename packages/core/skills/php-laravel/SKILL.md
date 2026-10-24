---
name: php-laravel
description: "Build and upgrade PHP/Laravel applications with validated requests, policy authorization and reliable jobs/data access. Use when implementing Laravel routes, Eloquent models or queues; preserve existing project conventions and runtime compatibility."
trigger: "Build and upgrade PHP/Laravel applications with validated requests, policy authorization and reliable jobs/data access. Use when implementing Laravel routes, Eloquent models or queues; preserve existing project conventions and runtime compatibility."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
paths: ["artisan", "routes/{web,api,console}.php", "app/Http/**/*.php", "app/Models/*.php"]
---

# Php Laravel

## Selection card
- Task: Implement Laravel policies, requests and Eloquent.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern PHP and Laravel applications pair Form Request validation, Gate/Policy object authorization, Eloquent ORM with strict eager loading (`Model::preventLazyLoading`), API Resources (`JsonResource`), and queued jobs (`ShouldQueue`). Reliable Laravel engineering requires explicit mass-assignment and serialization boundaries, transactional consistency (`DB::transaction` + `afterCommit`), and coordinated cache/worker reloads on deployment.

Checked 2026-10-23: PHP 8.5.12 and Laravel 13.38.0. Verify Composer platform requirements, extensions and framework migration notes before combining current releases.

## Rules

1. Inspect `composer.json`/`composer.lock`, PHP version and required extensions, runtime mode (PHP-FPM vs Laravel Octane), and web/queue entrypoints.
2. Validate inputs via dedicated Form Requests (`$request->validated()`) and enforce object ownership via Policies (`$this->authorize()` / `Gate::authorize()`); route authentication middleware alone does not prove tenant/resource ownership.
3. Pass explicit validated field subsets to Eloquent writes (never `$model->fill($request->all())`) and transform responses through API `JsonResource` classes rather than returning raw Eloquent models.
4. Prevent N+1 queries with `with()` / `loadMissing()`, wrap multi-step writes in `DB::transaction()`, and dispatch side-effect jobs/events with `afterCommit()` so workers never read uncommitted rows.
5. Make queued jobs idempotent, pass lightweight identifiers (`SerializesModels`) with explicit `$tries`, `$backoff`, `$timeout`, and `ShouldBeUnique` where needed.
6. Coordinate `config:cache`, `route:cache`, and `queue:restart` (or Octane reload) with deployment rollouts, and never call `env()` outside `config/*.php` files.

## Core Patterns & Pitfalls

- **Transactions & `afterCommit` Jobs**: When dispatching a queued job inside a database transaction, chain `->afterCommit()` (or set `'after_commit' => true`) so a fast queue worker cannot fail with `ModelNotFoundException` before the outer transaction commits.
- **Octane / Long-Running Worker Safety**: Avoid storing per-request state or current user references in static properties or singleton container bindings that persist across requests in Octane or queue workers.
- **Anti-pattern — Calling `env()` in Application Code**: Once `php artisan config:cache` runs in production, `env()` returns `null` outside `config/*.php`; always read runtime configuration via `config('services.x.key')`.

## Workflow

1. Trace request/job, model/policy and nearest tests.
2. Resolve latest stable runtime/framework support and required migrations.
3. Implement the narrow feature with validation, transaction and job contracts.
4. Test input/auth, failure/rollback, retry and queue worker lifecycle.
5. Run configured Composer/test/static/build checks and actual app/worker startup.

## Before returning

- [ ] `composer.json` PHP/extension constraints and Laravel version compatibility verified
- [ ] Form Request validation (`validated()`) and Policy/Gate object authorization enforced
- [ ] Eloquent queries eager-loaded (`with`), transactions wrapped cleanly, and `JsonResource` used for output
- [ ] Queued jobs configured with `afterCommit`, bounded `$tries`/`$timeout`, and idempotent handlers
- [ ] No direct `env()` calls outside `config/*.php`; Pest/PHPUnit feature tests pass

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[PHP releases](https://www.php.net/downloads.php), [Laravel docs](https://laravel.com/docs).

## Skills in scope

- api-design — Laravel API Resources, status/error responses, rate limiting, and pagination contracts.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- queues-jobs — implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics.
- authentication-sessions — implement application sign-in, sessions and identity integration with explicit account/tenant authorization.
