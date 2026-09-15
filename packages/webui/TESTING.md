# WebUI Testing Guidelines

## Coverage Ratchet Policy

Every new store or utility test file merged to `main` **must increase** the
coverage thresholds in `vitest.config.ts` by **+1** on each metric that the new
tests improve.

### Why?

Without a ratchet, thresholds stagnate and provide no signal. The policy
ensures coverage keeps pace with new code.

### How to apply it

1. Run `pnpm --filter @wrongstack/webui test:coverage` locally.
2. Note the new aggregate values for `statements`, `branches`, `functions`, `lines`.
3. Set each threshold to `Math.floor(measured_value)`. This is the floor — CI
   will fail if coverage drops below this.
4. If a new test lands and coverage improves past a whole number
   (e.g. 62.6% → 63.1%), set the threshold to that whole number.
5. Commit message: `test(webui): tighten coverage thresholds`

### Current coverage floor

`test.coverage.thresholds` in `packages/webui/vitest.config.ts` is the source of
truth; the table below mirrors it. If the two ever disagree, the config wins —
change the config, then update this table in the same commit.

| Metric     | Threshold (enforced) | Measured 2026-09-15        |
|------------|----------------------|----------------------------|
| statements | 64                   | 64.30% (20,384 / 31,698)   |
| branches   | 54                   | 54.95% (16,125 / 29,340)   |
| functions  | 57                   | 57.46% (5,185 / 9,023)     |
| lines      | 65                   | 65.77% (17,947 / 27,287)   |

Verified by running `pnpm --filter @wrongstack/webui test:coverage`: 384 test
files / 5,418 tests passed, exit 0. This is the run that validated the raise —
the thresholds went from 62/53/55/63 to 64/54/57/65 on 2026-09-15, closing the
~2-point slack the previous floor carried on every metric. Statements is now the
tightest metric (+0.30), so a coverage-moving change lands within a third of a
point of the floor: re-measure and raise in the same change.

- The ratchet is **aggregate** (`perFile: false`): one floor over the whole
  in-scope source, not a per-file requirement.
- The measurement covers 530 files totalling 31,698 statements, all under `src/`.
  The exclusions below keep `packages/webui-server` and the type-only modules out
  of this report — confirmed by inspecting `coverage-summary.json`: 0 files from
  outside `src/`. The raise-history comment in `vitest.config.ts` still cites a
  22,949-statement denominator measured on 2026-07-29; the in-scope source has
  grown since then, so treat that figure as historical.
- The measured column is a dated snapshot, not a live value. Re-measure with
  `pnpm --filter @wrongstack/webui test:coverage`, then read the `total` entry of
  `packages/webui/coverage/coverage-summary.json` (or the `All files` row).
- Apply the policy's `Math.floor(measured)` rule when re-measuring, and land the
  config change and this table together — a floor that trails the measurement by
  whole points is exactly the window a regression slips through.

### What counts as a "store/utility test"

- Files matching `stores/*.test.ts`
- Files matching `**/slash-commands.test.ts`
- Files matching `**/code-detect.test.ts`
- Any new test file targeting a previously uncovered module

### Files excluded from coverage

`test.coverage` includes `src/**/*.{ts,tsx}` and excludes:

| Pattern | Why |
|---------|-----|
| `**/*.test.*`, `**/dist/**` | Test files and build output |
| `src/env.d.ts`, `src/vite-env.d.ts` | Ambient type declarations only |
| `src/main.tsx` | ReactDOM bootstrap entry — exercised by E2E |
| `src/lib/core-browser-shim.ts` | Side-effect polyfill shim |
| `src/server/entry.ts` | Process/bootstrap entry — exercised at runtime |
| `src/types/**`, `src/types.ts` | Type-only modules: v8 reports them 0/0, which the aggregate would read as a real gap |
| `src/protocol-compatibility.ts` | Compile-time `AssertNever` bridge only |
| `../webui-server/**`, `**/packages/webui-server/**` | Measured by `packages/webui-server/tests` under the ROOT vitest config; counting it here double-counts ~10k statements at near-0% |

All other `src/**/*.{ts,tsx}` files contribute to the aggregate ratchet, including
components and WebSocket utilities.

## Running Tests

```bash
# Unit tests (vitest workspace — includes webui via workspace projects)
pnpm test

# WebUI-only tests with coverage
pnpm --filter @wrongstack/webui test:coverage

# E2E tests (requires WebUI server running)
pnpm test:e2e

# Full release gate
pnpm release:check
```

## Adding E2E Tests

E2E tests live in `e2e/*.spec.ts` and use Playwright.

```bash
# Run E2E tests
pnpm test:e2e

# Add new component tests in `e2e/<component>.spec.ts`
```
