---
name: node-modern
description: |
  Use this skill when writing, reviewing, or refactoring Node.js code — modules, async flow, cancellation, file and process I/O, HTTP — on a current Node.js release.
  Triggers: user mentions "Node", "Node.js", "ESM", "CommonJS", "require", "import", "fetch", "AbortSignal", "AbortController", "stream", "child_process", "spawn", "fs", "event loop".
version: 2.0.0
required-capabilities: [filesystem.read, filesystem.write]
required-tools: []
optional-capabilities: [verification.run]
---

# Modern Node.js

## Overview

Current Node.js ships most of what older code pulled from npm: global fetch,
`AbortSignal.timeout`, `node:test`, Web Streams, promise-based `fs` and timers.
Use the platform first, and match the module system and Node version the project
declares (`"type"` and `"engines"` in package.json, `.nvmrc`, CI config).

## Rules

1. Match the module system. In an ESM package (`"type": "module"` or `.mjs`)
   write ES `import` statements, with explicit file extensions on relative imports when the
   project compiles with NodeNext. Don't convert a CommonJS package to ESM as a
   side effect of another change.
2. Import built-ins with the `node:` prefix (`node:fs/promises`, `node:path`).
3. Give every operation that can wait a deadline: pass an `AbortSignal` to
   fetch calls, child processes, and timers; combine user cancellation with a
   timeout using `AbortSignal.any`.
4. Prefer built-ins over dependencies — global fetch over axios/node-fetch,
   `node:crypto` `randomUUID` over uuid — unless the project already
   standardizes on the dependency.
5. Handle `ENOENT` by reading inside try/catch and branching on `err.code`;
   checking `access` first is a race (TOCTOU).
6. Never block the event loop in a server or CLI hot path: no `*Sync` fs calls
   or CPU-heavy loops on request paths.
7. Pass arguments to child processes as an array (`execFile`/`spawn`), never by
   interpolating into a shell string.
8. Every promise is awaited, returned, or explicitly handled; let entry points
   report unhandled rejections instead of swallowing them.

## Patterns

```ts
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Deadline plus user cancellation.
export async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const deadline = AbortSignal.timeout(10_000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  if (!res.ok) throw new Error(`GET ${url} failed with ${res.status}`);
  return res.json();
}

// Missing file is an expected outcome, not an exception.
export async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

// Atomic replace: readers never observe a half-written file.
export async function writeAtomic(target: string, data: string): Promise<void> {
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, target);
}

// Cancellable delay — the promise API takes a signal; the global setTimeout does not.
await delay(500, undefined, { signal: AbortSignal.timeout(5_000) });

// Arguments as an array — no shell, no injection.
const { stdout } = await execFileAsync('git', ['log', '--oneline', '-5'], {
  signal: AbortSignal.timeout(15_000),
});

// Partial failure is acceptable: collect every outcome.
const results = await Promise.allSettled(urls.map((url) => getJson(url)));
const failed = results.filter((r) => r.status === 'rejected');
```

In ESM, `__dirname` doesn't exist: use `import.meta.dirname` on current Node, or
`path.dirname(fileURLToPath(import.meta.url))` on older releases.

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `fetch(url)` with no signal | Hangs forever on a stalled server | `AbortSignal.timeout()` |
| `exec(\`cmd ${input}\`)` | Shell injection | `execFile` with an argument array |
| `existsSync` then `readFile` | Race between check and use | try/catch on the read |
| `readFileSync` in a request handler | Blocks every other request | `node:fs/promises` |
| Catching an `AbortError` and continuing silently | Hides timeouts and cancellations | Rethrow, or report it as a timeout |
| `writeFile` directly over a config or state file | A crash leaves it truncated | Write to a temp file, then rename |

## Before returning

- [ ] Module system and Node version match what the project declares
- [ ] Built-ins imported with `node:`; no new dependency the platform covers
- [ ] Every network call, child process, and delay is cancellable or bounded
- [ ] Child-process arguments passed as arrays
- [ ] Missing-file and abort cases handled deliberately; no floating promises

## Skills in scope

- `typescript-strict` — for typing Node.js APIs and boundaries
- `security-scanner` — for shell, path, and SSRF exposure in I/O code
- `testing` — for testing async and time-based logic with fake timers
