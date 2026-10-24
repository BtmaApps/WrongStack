---
name: python-backend
description: "Build and upgrade Python services with explicit environments, validation, async boundaries and resource cleanup. Use when working on FastAPI, Django or Python API/jobs; preserve the project framework and packaging workflow."
trigger: "Build and upgrade Python services with explicit environments, validation, async boundaries and resource cleanup. Use when working on FastAPI, Django or Python API/jobs; preserve the project framework and packaging workflow."
version: 1.0.2
required-capabilities: [filesystem.read]
required-tools: []
optional-capabilities: [filesystem.write, execution.shell, verification.run, web.research]
metadata:
  routing-group: backend
  domain: "backend"
---

# Python Backend

## Selection card
- Task: Implement Python APIs and typed validation.
- Start: Locate the endpoint, schema, authentication boundary and caller.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Modern Python backends (FastAPI with Pydantic v2 / SQLAlchemy 2.x async, Django 6 ASGI/WSGI) require strict separation between synchronous blocking I/O and the `asyncio` event loop, deterministic session/connection lifespan management (`lifespan` context managers), and runtime boundary validation beyond static type hints.

Checked 2026-10-23: Python 3.15.1, FastAPI 0.162.0, Django 6.1.2 and uv 0.13.5. Verify framework/native-wheel/Python support before combining them; latest Python can lead package support.

## Rules

1. Inspect `pyproject.toml`, lockfile (`uv.lock` / `poetry.lock` / `requirements*.txt`), interpreter version, virtual environment and ASGI/WSGI entrypoint.
2. Validate incoming payloads and response models (`response_model` / Pydantic `model_validate` / Django forms & serializers); static `typing` annotations alone do not validate untrusted JSON.
3. Keep blocking synchronous I/O (`requests`, synchronous DB drivers, heavy CPU work) off `async def` event loops; prefer non-blocking clients (`httpx.AsyncClient`, `AsyncSession`) or `asyncio.to_thread` / worker pools, and propagate `asyncio.CancelledError` cleanly.
4. Scope database sessions/transactions to a unit of work via context managers or dependency generators (`yield session`) with guaranteed rollback/close on exception.
5. Keep secrets/settings validated at startup (`pydantic-settings` / Django settings) and enforce object-level authorization at the query/mutation boundary.
6. Do not replace the project package manager or migrate frameworks as an incidental feature change.

## Core Patterns & Pitfalls

- **Lifespan Resource Ownership**: Initialize shared `httpx.AsyncClient` instances, DB engines, and caches inside FastAPI's `@asynccontextmanager async def lifespan(app)` rather than at module import time or per-request.
- **Cancellation & Cleanup**: Never swallow `asyncio.CancelledError` inside a bare `except Exception:` or `except BaseException:` without re-raising after cleanup.
- **Anti-pattern — Blocking Calls Inside `async def`**: Calling synchronous ORM queries, `time.sleep()`, or synchronous HTTP clients inside an `async def` endpoint stalls the entire event loop worker for all concurrent requests.

## Workflow

1. Trace the request/job path and current framework/environment conventions.
2. Verify latest stable targets and support requirements; read migration notes.
3. Implement the feature with typed/validated boundaries and explicit resource ownership.
4. Test input/errors, database rollback, cancellation and application startup.
5. Run configured formatting/lint/type/tests and the real service entrypoint.

## Before returning

- [ ] Python version, native wheel availability, and `pyproject.toml`/lockfile constraints verified
- [ ] Request/response models validated at runtime and separated from internal ORM models
- [ ] No blocking synchronous I/O or CPU work executed directly on the `asyncio` event loop
- [ ] Database sessions, transactions, and external clients scoped with deterministic rollback/teardown
- [ ] Configured linter/typechecker (`ruff`/`mypy`/`pyright`), test suite (`pytest`), and ASGI/WSGI startup verified

## Sources

Versioned facts checked 2026-10-23; refresh authoritative sources before new installs/upgrades.
[Python releases](https://www.python.org/downloads/), [FastAPI](https://fastapi.tiangolo.com/), [Django](https://docs.djangoproject.com/en/stable/).

## Skills in scope

- api-design — HTTP endpoint contracts, status codes, pagination, and OpenAPI schema fidelity.
- database-development — implement database access, models and queries with explicit consistency, transactions and bounded results.
- queues-jobs — implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics.
- testing — async `pytest` fixtures, transactional test isolation, and boundary error coverage.
