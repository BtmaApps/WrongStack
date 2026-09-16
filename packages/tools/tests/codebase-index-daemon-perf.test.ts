/** Built-dist detached-daemon benchmark. Run after `pnpm --filter @wrongstack/tools build`. */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CircuitOpenError,
  checkCodebaseIndexServerHealth,
  getCodebaseIndexPerfSnapshot,
  resetCodebaseIndexPerfMetrics,
  resetIndexCircuitBreaker,
  runStartupIndex,
  shutdownCodebaseIndexHost,
  shutdownCodebaseIndexServer,
} from '../dist/codebase-index/index.js';
import { assertPairingValid, captureLoad, isStrictPairing } from './bench-pairing.js';

/**
 * `bench-pairing` already says what a loaded box means for this suite: an
 * unusable sample is not a product defect, so the test SKIPS rather than
 * turning the suite red — unless the runner asked for strict pairing.
 *
 * That contract only covered the MEASUREMENT. Under full-suite load the
 * detached daemon's socket dies inside `runStartupIndex`, before
 * `assertPairingValid` is ever reached, so the guard never got its say and the
 * benchmark failed the whole run on `codebase-index server connection closed`.
 * Worse, the breaker it tripped stayed open into the next case, which then
 * failed with `CircuitOpenError` — a second red from the first case's load.
 *
 * `benchIt` extends the existing contract to the setup: infrastructure failures
 * skip on a developer box and still throw under WRONGSTACK_BENCH_STRICT_PAIRING,
 * so a perf leg that cannot produce a sample still fails loudly. Assertion
 * failures are never swallowed — only the daemon dying is.
 */
const INFRASTRUCTURE_FAILURE =
  /connection closed|socket hang up|EPIPE|ECONNRESET|ECONNREFUSED|daemon (?:exited|unavailable)/i;

function isInfrastructureFailure(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return true;
  return error instanceof Error && INFRASTRUCTURE_FAILURE.test(error.message);
}

type BenchContext = { skip: (note?: string) => never };

function benchIt(
  name: string,
  body: (ctx: BenchContext) => Promise<void>,
  timeoutMs: number,
): void {
  it(
    name,
    async (ctx) => {
      try {
        await body(ctx as unknown as BenchContext);
      } catch (error) {
        if (!isInfrastructureFailure(error) || isStrictPairing()) throw error;
        (ctx as unknown as BenchContext).skip(
          `${name}: the detached daemon did not survive the shared box — ` +
            `${(error as Error).message}. Benchmark sample unusable; not a product defect.`,
        );
      }
    },
    timeoutMs,
  );
}

const elapsedMs = (start: bigint): number => Number(process.hrtime.bigint() - start) / 1e6;
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
};
const summary = (values: number[]) => ({
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
});

describe('built-dist detached codebase-index benchmark', () => {
  const roots: string[] = [];
  afterEach(async () => {
    delete process.env['WRONGSTACK_INDEX_BENCH_NO_HOST_MUTEX'];
    delete process.env['WRONGSTACK_INDEX_BENCH_WRITE_HOLD_MS'];
    // A daemon that died under load trips the breaker, and an open breaker
    // refuses every later index run for 60s — which turned one case's bad luck
    // into the next case's failure. The breaker is process-global state; this
    // file must not leak it between cases.
    resetIndexCircuitBreaker();
    for (const root of roots) {
      try {
        await shutdownCodebaseIndexServer(root, path.join(root, '.index'), 'benchmark teardown');
      } catch {
        // The daemon may close its socket immediately after acknowledging stop.
      }
    }
    await shutdownCodebaseIndexHost();
    for (const root of roots.splice(0)) {
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          await fs.rm(root, { recursive: true, force: true });
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EBUSY' || attempt === 4) throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
  });

  benchIt(
    'captures repeated daemon p50/p95/max and non-zero queue metrics',
    async (ctx) => {
      expect(process.env['WRONGSTACK_INDEX_INLINE']).toBeUndefined();
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-daemon-perf-'));
      process.env['WRONGSTACK_INDEX_BENCH_NO_HOST_MUTEX'] =
        process.env['WRONGSTACK_BENCH_NO_HOST_MUTEX'] ?? '1';
      process.env['WRONGSTACK_INDEX_BENCH_WRITE_HOLD_MS'] =
        process.env['WRONGSTACK_BENCH_HOLD_MS'] ?? '250';
      const holdMs = Number(process.env['WRONGSTACK_INDEX_BENCH_WRITE_HOLD_MS'] ?? '250');
      roots.push(root);

      const indexDir = path.join(root, '.index');
      const files = Array.from({ length: 12 }, (_, i) => path.join(root, `daemon-${i}.ts`));
      await Promise.all(files.map((file, i) => fs.writeFile(file, `export const d${i} = ${i};\n`)));

      await runStartupIndex({ projectRoot: root, indexDir, force: true, timeoutMs: 30_000 });
      resetCodebaseIndexPerfMetrics();
      // Bracket the measured burst only: sampling before the forced startup index
      // (or before the previous case's daemon teardown has drained) reads that
      // warm-up as drift and invalidates an otherwise clean pair.
      const loadStart = await captureLoad();
      const latencies: number[] = [];
      for (let round = 0; round < 3; round++) {
        await Promise.all(
          files.map((file) =>
            fs.appendFile(file, `\nexport const daemonChanged${round} = true;\n`),
          ),
        );
        const starts = files.map(() => process.hrtime.bigint());
        await Promise.all(
          files.map(async (_file, i) => {
            await runStartupIndex({ projectRoot: root, indexDir, timeoutMs: 30_000 });
            latencies.push(elapsedMs(starts[i]!));
          }),
        );
      }

      const loadEnd = await captureLoad();
      assertPairingValid(loadStart, loadEnd, 'codebase-index-daemon', `hold=${holdMs}`, ctx);

      const metrics = getCodebaseIndexPerfSnapshot();
      const health = await checkCodebaseIndexServerHealth(root, indexDir, { timeoutMs: 5_000 });
      const server = health.server;
      const stats = summary(latencies);
      expect(latencies).toHaveLength(36);
      expect(stats.p95).toBeLessThan(30_000);
      expect(server?.maxQueuedWrites ?? 0).toBeGreaterThan(0);
      expect(server?.writeQueueWaitMs ?? 0).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(
        `[codebase-index-daemon-perf] n=${latencies.length} p50=${stats.p50.toFixed(1)}ms ` +
          `p95=${stats.p95.toFixed(1)}ms max=${stats.max.toFixed(1)}ms ` +
          `ipcPendingPeak=${metrics.ipcPendingPeak} daemonMaxQueuedWrites=${server?.maxQueuedWrites ?? 0} ` +
          `daemonWriteQueueWait=${server?.writeQueueWaitMs ?? 0}ms`,
      );
    },
    180_000,
  );

  benchIt(
    'sweeps benchmark hold values and reports queue-wait sensitivity',
    async (ctx) => {
      const sweep: Array<{
        holdMs: number;
        p50: number;
        p95: number;
        max: number;
        waitMs: number;
        cpuStart: number;
        cpuEnd: number;
        cpuDrift: number;
        agents: number | null;
        pairingValid: true;
      }> = [];
      for (const holdMs of [50, 100, 250]) {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), `wstack-daemon-sweep-${holdMs}-`));
        roots.push(root);
        const indexDir = path.join(root, '.index');
        const files = Array.from({ length: 8 }, (_, i) => path.join(root, `sweep-${i}.ts`));
        process.env['WRONGSTACK_INDEX_BENCH_NO_HOST_MUTEX'] = '1';
        process.env['WRONGSTACK_INDEX_BENCH_WRITE_HOLD_MS'] = String(holdMs);
        await Promise.all(
          files.map((file, i) => fs.writeFile(file, `export const s${i} = ${i};\n`)),
        );
        await runStartupIndex({ projectRoot: root, indexDir, force: true, timeoutMs: 30_000 });
        resetCodebaseIndexPerfMetrics();
        // Sample after the warm-up so the pair brackets the burst, not the
        // previous sweep point's daemon shutdown.
        const loadStart = await captureLoad();
        await Promise.all(
          files.map((file) => fs.appendFile(file, '\nexport const sweepChanged = true;\n')),
        );
        const latencies: number[] = [];
        const starts = files.map(() => process.hrtime.bigint());
        await Promise.all(
          files.map(async (_file, i) => {
            await runStartupIndex({ projectRoot: root, indexDir, timeoutMs: 30_000 });
            latencies.push(elapsedMs(starts[i]!));
          }),
        );
        const loadEnd = await captureLoad();
        assertPairingValid(
          loadStart,
          loadEnd,
          'codebase-index-daemon',
          `hold=${holdMs} sweep`,
          ctx,
        );
        const health = await checkCodebaseIndexServerHealth(root, indexDir, { timeoutMs: 5_000 });
        const stats = summary(latencies);
        const waitMs = health.server?.writeQueueWaitMs ?? 0;
        expect(waitMs).toBeGreaterThan(0);
        sweep.push({
          holdMs,
          ...stats,
          waitMs,
          cpuStart: Number(loadStart.cpu.toFixed(1)),
          cpuEnd: Number(loadEnd.cpu.toFixed(1)),
          cpuDrift: Number(Math.abs(loadEnd.cpu - loadStart.cpu).toFixed(1)),
          agents: loadEnd.agents,
          pairingValid: true,
        });
      }
      // eslint-disable-next-line no-console
      console.log(`[codebase-index-daemon-sweep] ${JSON.stringify(sweep)}`);
      expect(sweep).toHaveLength(3);
      expect(sweep[2]!.waitMs).toBeGreaterThanOrEqual(sweep[0]!.waitMs);
    },
    180_000,
  );
});
