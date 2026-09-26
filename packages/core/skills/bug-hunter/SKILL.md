---
name: bug-hunter
description: |
  Use this skill when scanning source code for bugs, anti-patterns, code smells,
  or quality issues in a codebase, or when running a proof-driven bug hunt that
  must find, prove, fix, and verify one real defect. Trigger on the explicit
  vocabulary — "bug", "bug hunt", "/bughunt", "scan for issues", "find
  problems", "anti-pattern", "code smell", "static analysis" — and on the task
  shape, which is how it usually arrives: "audit these files", "scan this
  module", "check for leaks", "something's wrong in X", "look for anything
  dangerous here", "clean pass before release". Also use it when running as a
  cascade agent behind a chimera review, or as a fan-out worker auditing a chunk
  of files in parallel — those modes have extra constraints documented below.
version: 2.1.0
required-capabilities: [filesystem.read, code.inspect]
required-tools: []
optional-capabilities: [verification.run]
---

# Bug Hunter

Finds real defects in code. In a scan it outputs a prioritized hit list with
file:line references; in a proof-driven round it selects the one candidate it
can prove, and hands it to the proof, fix, and verification discipline.

## Rules

1. Always include a `file:line` you have actually read — verify the line exists;
   never invent, guess, or extrapolate a reference. No line reference = can't be
   fixed.
2. Grep finds candidates; reading finds bugs. No hit becomes a finding until you
   can state the input that triggers it and what breaks.
3. Never scan `node_modules`, build output, or generated code.
4. Don't report style issues as bugs — those are lint findings.
5. Don't inflate severity or pad the report. Twelve confirmed findings beat
   forty maybes, and a clean scan is a valid result.
6. Sort output: critical > high > medium > low.

## Workflow

```
1. Scope:    Accept file/dir globs, explicit paths, a feature, or a symptom
2. Map:      Entry points, callers, and the contract the code must honour
3. Scan:     grep/read across target files, lifecycle and async paths first
4. Confirm:  Open each hit and answer the three questions below
5. Classify: Categorize by type and severity
6. Deliver:  Report (scan modes) or select one candidate (proof-driven mode)
```

### Confirm every candidate

A regex hit is a **place to look**, never a finding. Before any hit becomes a
line in the report, open it and answer three questions:

1. **Is the triggering value actually reachable from a caller, user, or
   environment?** `element.innerHTML = "<b>Loading</b>"` is not XSS.
2. **Is the path reachable?** Dead code, unexported helpers with no callers, and
   branches behind a permanently-false flag are at most Low.
3. **Is it already handled nearby?** A `.catch()` chained further down, a
   validated input, an outer try/catch, a cleanup in the owner's teardown —
   read enough surrounding lines to know.

Also establish **what correct behaviour is and why**: a documented contract, a
caller's requirement, or an established test. A deliberate tradeoff or a
stylistic preference is not a bug, however it looks.

### Start from the index and scanners when they exist

When the codebase index and quality tools are available, let them narrow the
search and grep for the rest:

- the security-ast-scan tool for injection, hardcoded secrets, prototype
  pollution, ReDoS, unsafe eval, and N+1 queries in a file;
- the dead-code-scan tool for unreferenced exports (candidates only — dynamic
  imports and config-driven registration are invisible to it);
- the codebase-incoming-calls tool to confirm a suspicious function is
  reachable and to see how many callers inherit the defect.

Tool output is a candidate list like any grep hit: every finding is read
before it ships.

### Exclude before you scan

`node_modules`, `dist`, `build`, `.next`, `out`, `coverage`, lockfiles,
`*.min.*`, generated clients and protobufs, snapshots (`__snapshots__`),
vendored third-party directories, and `.git`.

**Test files and fixtures are a special case.** Do not scan them for secrets —
mock credentials are expected there. Do still scan them for leaks and unawaited
promises, since those cause real flakiness. When a finding lands in a test file,
say so in the finding.

---

## Severity levels

| Level | Meaning | Action |
|-------|---------|--------|
| **Critical** | Security breach, data loss, crash | Fix immediately |
| **High** | Logic bug, race condition, memory leak | Fix before release |
| **Medium** | Error handling gap, type unsafety | Fix soon |
| **Low** | Minor code smell with a real consequence | Consider fixing |

- **Reachability discounts it.** The same `as any` is Medium at a network
  boundary and Low in an internal helper that only ever receives typed input.
- **Blast radius promotes it.** A bug in one leaf component is what it is; the
  same bug in a shared util imported by forty modules is a level higher.

When torn between two levels, pick the lower one. Over-calling costs the
reader's trust in every other line.

---

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

## Running modes

### 1. Standalone scan (default)

As documented above. Report only; suggest fixes, don't apply them, unless the
user asked for fixes.

### 2. Fan-out worker

Dispatched by a leader across a chunk of files (typically 5–10 per worker).

- Stay inside the assigned paths. Scope creep breaks the leader's coverage math.
- Return the **same result shape** every sibling worker returns — severity,
  `file:line`, one-line fix — so findings deduplicate cleanly.
- If the chunk is too large to finish, report what you confirmed and name the
  files you did not reach. Silent partial coverage is the failure that matters.

### 3. Cascade agent (behind a chimera review)

When verified chimera findings meet the `cascadeOn` threshold
(`high` or `critical`; default `high`), the runtime spawns bug-hunter for
findings at or above that severity. You receive the review report and the changed files; you investigate
each finding and **apply fixes**. Results go directly to the session
transcript. **NEVER send mailbox messages** to the leader. You take part in the
re-review loop, up to `maxCascadeDepth` cycles.

- **Minimal diff.** Fix the flagged defect and nothing else.
- **Verify the line first.** If the cited line doesn't say what the report
  claims, report the discrepancy instead of editing something adjacent.
- **Don't fix what you can't check.** If the fix needs a design decision or
  would change a public contract, leave it and say why.
- **List what you didn't fix** and the reason.

### 4. Proof-driven round (Proof-Driven Bug Hunter, /bughunt)

One round = at most one proven, fixed, verified root cause. The round's own
instructions are the protocol; this mode governs how the candidate is chosen.
It overrides the out-of-scope list below: in this mode you **do** fix the bug
and **do** write its regression test, and you **never** fan out, however large
the target.

1. **Read prior round reports first.** Collect their root-cause fingerprints
   (affected path + trigger + violated contract) and skip any candidate with the
   same root cause, even if it surfaces through a different symptom.
2. **Survey, then shortlist.** Walk the target layer by layer with the pattern
   table, lifecycle and async paths first. Keep two or three confirmed
   candidates, not one guess.
3. **Rank by provability × impact.** Prefer a reachable defect you can
   reproduce deterministically through the production path over a scarier one
   you can only argue for. A candidate whose proof would need mocking the very
   code under suspicion is not provable; drop it.
4. **Commit to one.** Write down its trigger, expected behaviour and its basis,
   observed behaviour, and impact. Then prove it with `debugging` and `testing`
   before touching production code.
5. **If the proof won't go red,** the candidate is unproven, not fixed. Move to
   the next shortlisted candidate within the round's budget, or end the round
   with no proven bug. Never edit production code to "see if it helps".
6. **Keep a coverage note:** surfaces inspected, candidates rejected and why,
   and unresolved leads. An unsuccessful reproduction does not make a surface
   bug-free, and the report must not imply it does.

Finish with `verify-before-done`: the same proof green, the regression test in
the normal suite, related checks, and an honest outcome label.

---

## Anti-patterns

- **Reporting grep output as findings** — every hit is read before it ships
- **Flagging test fixtures as leaked secrets** — mock credentials belong there
- **Inflating severity** to make the scan look productive
- **Proof-driven: fixing before the proof is red**, or picking the most
  dramatic candidate over the most provable one
- **Proof-driven: re-reporting a prior round's root cause** under a new symptom

## Out of scope (scan modes)

- **Don't fix the bugs you find in the default scan.** Apply fixes only when
  the user explicitly asks, in cascade mode, or in a proof-driven round.
- **Don't review code quality, design, or style.** Quality and design are
  `chimera`'s read-only lane; style is the linter's job. Multi-file
  restructuring is `refactor-planner`'s.
- **Don't run dependency audits.** Supply chain and lockfile scanning are
  `security-scanner`'s lane.
- **Don't write tests in a scan.** State the failing test that would catch the
  bug; test authoring is `testing`'s lane outside proof-driven rounds.
- **Don't start a `multi-agent` fan-out on your own.** For a target larger than
  roughly 10–15 files, report its size and let the leader dispatch.

## Skills in scope

- `debugging` — for the reproduction and root cause once a candidate is chosen
- `testing` — for the proof and the durable regression test
- `verify-before-done` — for the final evidence and report
- `code-review` — for reviewing a specific change set
- `security-scanner` — for hardcoded secrets and injection vectors
- `refactor-planner` — for fixing findings across multiple files
- `typescript-strict` — for TypeScript type safety rules
- `output-standards` — for standardized `<nextsteps>` formatting
- `multi-agent` — for fanning out scans across large targets (never in a
  proof-driven round)

---

## Before returning

- Every `file:line` opened and confirmed — none from grep output alone
- Every finding states a triggering input, a consequence, and the basis for the
  expected behaviour
- Excluded paths honoured; test-file findings labelled as such
- Severities pass the reachability and blast-radius checks; nothing rounded up
- Scan: summary counts match the findings; `<nextsteps>` mirrors them in order
- Cascade: fixes are minimal, unfixed findings listed with reasons, no mailbox
  message sent
- Proof-driven: one root cause, not a duplicate of a prior round; the choice,
  rejected candidates, and coverage gaps are in the report
