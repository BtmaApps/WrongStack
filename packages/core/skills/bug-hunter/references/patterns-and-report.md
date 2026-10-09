## Bug patterns to find

Regex column = **where to start grepping**. Confirm column = what must be true
in the actual code before it becomes a finding.

| Pattern | Regex hint | Confirm by reading | Severity |
|---------|------------|--------------------|----------|
| Uncaught promise | `\.then\(` without `.catch` | No `.catch` on the chain and no enclosing try/catch on an awaited call | high |
| Missing await | async call as a bare statement | The call has side effects whose ordering or failure matters | high |
| Listener / timer leak | `\.on\(`, `addEventListener`, `setInterval`, `setTimeout`, `subscribe` | No matching removal or clear in teardown, on abort, or on the error path, and the owner outlives the handler | high |
| Abort not honoured | `AbortSignal`, `signal` parameters | Signal accepted but not passed down, not checked between steps, or its listener is never removed after completion | high |
| Stateful regex | `/g` or `/y` flag on a shared or module-level regex | Reused with `.test()`/`.exec()` across calls, so `lastIndex` makes alternate calls miss | high |
| Ignored option | option or config field in a type or signature | Accepted but never read on some path, or overwritten by a default | medium |
| Unsafe fallback | `\|\|` or `??` defaults, `catch` returning a default | A valid falsy value (`0`, `''`, `false`) is replaced, or a failure is turned into a plausible success | medium |
| Stale state | caches, memos, module-level maps, `let` captured by closures | The key omits an input that changes the result, or nothing invalidates it | high |
| Race / check-then-act | an `await` between a check and the act it guards | Another caller can change the checked state in between; a second call can start before the first finishes | high |
| Path / name normalization | `path.join`, `split('/')`, `endsWith('.`, `toLowerCase` | Separators, drive-letter case, trailing slashes, or extension case differ between producer and consumer | medium |
| Boundary / off-by-one | `<=`, `length - 1`, `slice(`, pagination, limits | Empty, single-element, exact-limit, or last-page input breaks the contract | medium |
| Unreachable branch | conditions over narrowed types, duplicate `case` | The branch can never run, so the handling it promises never happens | medium |
| Swallowed error | `catch {}`, `catch (e) {}`, `.catch(() => {})` | The failure it hides is meaningful rather than genuinely ignorable | medium |
| Unbounded resource | `while (true)`, recursion, unpaginated fetch-all, unbounded arrays or maps | No break condition, timeout, eviction, or limit on a path that can grow | high |
| Hardcoded secret | `sk-`, `AKIA`, `-----BEGIN`, `api[_-]?key\s*=` | It's a live credential, not a hash, digest, or test fixture | critical |
| Injection | `exec(` or `execSync(` with `${`; SQL built with `+` or `${`; `innerHTML =` | The interpolated value can carry caller-controlled input and is not escaped or parameterized | critical |
| Unsafe any | `:\s*any\b` or `as any` | Sits at a trust boundary (parsed JSON, network, DB, user input) rather than internal glue | medium |

Extend this table when a hunt turns up a pattern worth watching for — but only
with rows that pass the same test: a grep that narrows the search plus a
condition that decides it.

---

## Output format (scan modes)

```
## Bug Hunt Report — <scope>

### Critical (must fix)
1. [SHELL-INJ] `tools/shell.ts:42` — template literal in exec()
   `exec(\`echo ${userInput}\`)` → use execFile with args array

### High
2. [LEAK] `tools/pool.ts:89` — listener never removed on abort

### Summary
| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 1 |

Total: 2 findings in 2 files

<nextsteps>
1. Fix the shell injection in tools/shell.ts:42
2. Fix the listener leak in tools/pool.ts:89
</nextsteps>
```

When more than 30% of hits were noise, add one line under Summary:
`False positive rate: ~N% — <one-line cause>`. If a scan turns up nothing, say
so plainly with the scope and file count.

---
