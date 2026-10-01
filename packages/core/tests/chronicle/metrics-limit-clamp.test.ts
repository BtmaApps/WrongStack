/**
 * `clampLimit` keeps a one-row floor.
 *
 * `clampLimit` (core/src/chronicle/metrics-schema.ts) guards a non-positive
 * limit by substituting the caller's fallback, and its two sibling clamps
 * (`ws-validation-common.ts`, kanban `workbench.ts`) both floor to a MINIMUM
 * OF ONE. The chronicle copy did not: a positive FRACTIONAL limit
 * (0 < limit < 1) passed the guard, then `Math.floor(0.5) === 0` was pushed
 * straight into the `LIMIT ?` clause, so `underusedTools()` / `fileLineage()`
 * / `taskOutcomes()` returned ZERO rows — the store reporting "no data" where
 * the fallback had promised rows. The value is client-controlled (the
 * WebSocket `chronicle.metrics` route forwards `payload.limit` verbatim), so
 * any fractional request emptied the view.
 *
 * This pins the store-level consequence, not just the helper's return value:
 * the SQL `LIMIT 0` is where the defect became user-visible.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clampLimit } from '../../src/chronicle/metrics-schema.js';
import { ChronicleMetricsStore } from '../../src/chronicle/metrics-store.js';
import type { ChronicleEvent } from '../../src/chronicle/types.js';
import { CHRONICLE_SCHEMA_VERSION } from '../../src/chronicle/types.js';

function toolEvent(toolName: string, occurredAt: string): ChronicleEvent {
  return {
    schemaVersion: CHRONICLE_SCHEMA_VERSION,
    eventId: `e-${toolName}-${occurredAt}`,
    eventType: 'tool.started',
    occurredAt,
    observedAt: occurredAt,
    persistedAt: occurredAt,
    sequence: 0,
    previousHash: '',
    hash: 'h',
    scope: { installationId: 'inst-1', machineId: 'machine-1', projectId: 'p1' },
    correlation: { traceId: 'trace-1', spanId: 'span-1' },
    attributes: { toolName },
    outcome: 'success',
  };
}

describe('clampLimit — one-row floor', () => {
  it('never returns 0 for a positive fractional limit', () => {
    expect(clampLimit(0.5, 500)).toBe(1);
    expect(clampLimit(0.01, 500)).toBe(1);
  });

  it('still floors, falls back, and caps at the upper bound', () => {
    expect(clampLimit(2.9, 500)).toBe(2);
    expect(clampLimit(0, 500)).toBe(500);
    expect(clampLimit(-4, 500)).toBe(500);
    expect(clampLimit(undefined, 500)).toBe(500);
    expect(clampLimit(Number.NaN, 500)).toBe(500);
    expect(clampLimit(999_999, 500)).toBe(10_000);
  });
});

describe('underusedTools() — fractional limit does not empty the result set', () => {
  let dir: string;
  let store: ChronicleMetricsStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamp-limit-'));
    store = ChronicleMetricsStore.open(dir);
    const ingester = (
      store as unknown as { ingester: { ingestEvent: (e: ChronicleEvent) => void } }
    ).ingester;
    for (const name of ['alpha', 'beta', 'gamma']) {
      ingester.ingestEvent(toolEvent(name, '2026-07-15T10:00:00.000Z'));
    }
  });

  afterEach(async () => {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  // CONTROL: an ordinary limit returns rows; a broken harness fails here first.
  it('returns the requested number of rows for an ordinary limit', () => {
    expect(store.underusedTools({ limit: 2 })).toHaveLength(2);
  });

  // CONTROL: the documented fallback is unchanged for a non-positive limit.
  it('substitutes the fallback for a non-positive limit', () => {
    expect(store.underusedTools({ limit: 0 })).toHaveLength(3);
  });

  // DEFECT: 0 < limit < 1 reached SQL as `LIMIT 0` and returned nothing.
  it('returns at least one row for a positive fractional limit', () => {
    expect(store.underusedTools({ limit: 0.5 }).length).toBeGreaterThanOrEqual(1);
  });
});
