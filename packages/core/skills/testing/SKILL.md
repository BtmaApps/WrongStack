---
name: testing
description: |
  Use this skill when writing, fixing, reviewing, or planning tests in any project, in whatever runner the project already uses.
  Triggers: user says "test", "unit test", "integration test", "e2e", "mock", "coverage", "flaky", "failing test", "regression test", "write tests", "vitest", "jest", "pytest", "go test".
version: 2.0.0
required-capabilities: [filesystem.read, verification.run]
required-tools: []
optional-capabilities: [execution.shell, code.inspect]
---

# Testing

## Overview

Write tests that fail for the right reason and pass for the right reason, in the
project's own runner, layout, and style. A test earns its place by catching a
regression someone could plausibly introduce; everything else is maintenance
cost.

## Rules

1. Match the project before writing anything. Find the runner (package.json
   scripts, vitest/jest config, pytest.ini or pyproject, go.mod, Cargo.toml),
   the test layout, the naming, and the helpers neighbouring tests already use.
2. See it fail first. A regression test must fail without the fix — a test that
   was never red proves nothing.
3. Test behaviour through the public surface. Don't assert on private helpers or
   internal structure a legitimate refactor would change.
4. Mock the boundaries you don't own (network, clock, randomness, third-party
   SDKs, slow I/O), not the collaborator next door.
5. Keep every test isolated: no order dependence, no shared mutable state;
   restore mocks, timers, and environment in teardown.
6. Bound every wait that can hang (network, sockets, child processes, polling),
   and drive time-based logic with fake timers instead of real sleeps.
7. Report exactly what ran: the command, the files, pass/fail/skip counts. A run
   that matched no tests is not a pass.

## Workflow

1. **Locate** the code under test and its existing tests. With a codebase index,
   the codebase-context and codebase-search tools find them faster than grep.
2. **Pick the level.** Unit for pure logic; integration where the bug lives in
   the wiring; end-to-end only for a user-visible flow nothing cheaper covers.
3. **Write the smallest failing test** that pins the behaviour. Run it and
   confirm it fails on the assertion, not on an import or setup error.
4. **Make it pass**, or confirm the fix makes it pass.
5. **Widen.** Run the covering suites (the codebase-targeted-test tool finds
   them for a symbol or file), then the full suite when the change touches
   shared code.

## Choosing what to assert

| Situation | Assert | Avoid |
|---|---|---|
| Pure function | Outputs across normal, boundary, and invalid inputs (table-driven) | Intermediate variables |
| Error path | The error type, code, or message the caller relies on | A bare "throws" with no matcher |
| Async flow | Final state and outputs after completion is awaited | Arbitrary sleeps |
| Bug fix | The exact input from the bug report | A paraphrase that already passed before the fix |
| UI component | What the user sees and can do (roles, text, events) | Whole-tree snapshots, class names |

## Flaky tests

A flaky test is a bug in the test or in the code, never background noise.

| Symptom | Usual cause | Fix |
|---|---|---|
| Fails under load or in CI only | Real time, timers, races | Fake timers; inject the clock; await the real completion signal |
| Fails depending on order | Leaked state between tests | Reset in teardown; run the file alone and shuffled |
| Fails intermittently with no error | Unawaited promise | Await it; enable floating-promise lint |
| Fails when suites run in parallel | Shared ports, files, env | Ephemeral ports, per-test temp dirs, scoped env |

Don't "fix" flakiness with retries or larger timeouts until the cause is found,
and say what the cause was.

## Patterns

Examples use vitest/jest syntax; translate to the project's runner.

```ts
describe('parseDuration', () => {
  it.each([
    ['90s', 90_000],
    ['2m', 120_000],
    ['0s', 0],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('rejects an unknown unit', () => {
    expect(() => parseDuration('5y')).toThrow(/unknown unit/);
  });
});

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries once after the backoff delay', async () => {
    vi.useFakeTimers();
    const call = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue('ok');
    const pending = withRetry(call, { delayMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(2); // the retry count is the contract here
  });
});
```

## Anti-patterns

- **Tests that mirror the implementation** line by line — they break on every
  refactor and catch nothing.
- **Mocking the unit under test**, or mocking so much that the test checks the mock.
- **Loosening or deleting an assertion** to make a failing test pass. Find out why
  it fails first.
- **Skipping tests or lowering coverage thresholds** to get a green run.
- **Snapshots as the only assertion** on logic.
- **Claiming "tests pass"** from a filtered or partial run without saying so.

## Before returning

- [ ] Runner, layout, naming, and helpers match the project's existing tests
- [ ] Every new regression test was seen failing before the fix
- [ ] Assertions target behaviour with specific matchers
- [ ] Mocks, timers, and environment restored; no order dependence
- [ ] Commands and results reported exactly, including skips and filters

## Skills in scope

- `debugging` — when a failing test's cause is unknown
- `bug-hunter` — when a failing test points at a real defect to locate
- `typescript-strict` — for type-safe fixtures and assertions
- `verify-before-done` — for the evidence to report once tests pass
- `git-flow` — for committing tests together with the change they cover
