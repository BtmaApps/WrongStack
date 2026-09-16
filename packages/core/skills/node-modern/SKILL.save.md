# Modern Node.js (Compact)

Use the platform first, matching the project's module system and Node version.

## Rules

1. Match the module system; don't convert CJS to ESM as a side effect.
2. Import built-ins with the `node:` prefix.
3. Bound every wait: `AbortSignal.timeout()` on fetch, child processes, and delays; combine with `AbortSignal.any`.
4. Prefer built-ins (fetch, randomUUID, node:test) over new dependencies.
5. Handle `ENOENT` by reading in try/catch and branching on `err.code`; `access` first is a race.
6. No `*Sync` I/O or CPU-heavy loops on request paths.
7. Child-process arguments as arrays (`execFile`/`spawn`), never interpolated shell strings.
8. Await or handle every promise.

## Key patterns

- Cancellable delay: `setTimeout(ms, value, { signal })` from `node:timers/promises`.
- Atomic write: write a temp file, then `rename`.
- Partial failure: `Promise.allSettled`.
