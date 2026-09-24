/**
 * Regression: dispose() must not close the store under an in-flight composite
 * operation. Composite operations (session consolidation, hygiene, candidate
 * accept, legacy import) chain several mutations separated by off-chain
 * awaits; between two of them the mutation chains look settled even though
 * more work is coming, so a drain that only awaited the chain heads let
 * close() land under the operation's next BEGIN IMMEDIATE — silently failing
 * every remaining step. Observed 2026-09-18 as consolidation facts lost
 * during teardown (29/30 facts rejected after dispose, no error surfaced to
 * the caller). Composite operations now hold a lease on the mutation queue
 * for their whole duration and drain() waits for it to be released.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteMemoryPort } from '../src/memory-port.js';
import type { SessionConsolidationInput } from '../src/types.js';

const FACT_COUNT = 30;

const LOSSLESS = {
  candidates: FACT_COUNT,
  accepted: FACT_COUNT,
  rejected: 0,
  duplicate: 0,
};

let tempDir: string;

let activePorts: SqliteMemoryPort[] = [];

beforeEach(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sqlite-dispose-'));
  activePorts = [];
});

afterEach(async () => {
  for (const port of activePorts) {
    try {
      port.close();
    } catch {
      /* already closed */
    }
  }
  // Give Windows a tick to release WAL file handles
  await new Promise((r) => setTimeout(r, 10));
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function makeInput(sessionId: string, seed: string): SessionConsolidationInput {
  return {
    sessionId,
    facts: Array.from({ length: FACT_COUNT }, (_, i) => ({
      text: `${seed} fact ${String(i).padStart(2, '0')} documents the wobble valve calibration ratchet.`,
      confidence: 1,
      importance: 1,
    })),
    autoAcceptThreshold: 0.85,
  };
}

/** Poll until `probe` is true; throws on timeout so a stalled race fails loudly. */
async function waitFor(probe: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 5000; i++) {
    if (await probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timeout waiting for ${what}`);
}

describe('dispose vs in-flight composite operations', () => {
  it('consolidation without a concurrent dispose loses no facts', async () => {
    const port = new SqliteMemoryPort({ projectRoot: tempDir });
    activePorts.push(port);
    await port.initialize();
    const result = await port.consolidateSession(makeInput('sess-control', 'control'));
    expect(result).toEqual(LOSSLESS);
  });

  it('dispose() during an in-flight consolidation waits for it instead of closing under it', async () => {
    const port = new SqliteMemoryPort({ projectRoot: tempDir });
    activePorts.push(port);
    await port.initialize();
    const consolidation = port.consolidateSession(makeInput('sess-race', 'race'));
    // Interleaving: dispose once the first fact's candidate is committed, so
    // facts 2..N are guaranteed to still be queued when the drain runs.
    await waitFor(
      async () => (await port.listCandidates()).length >= 1,
      'the first consolidation candidate to exist',
    );
    await port.dispose();
    const result = await consolidation;
    expect(result).toEqual(LOSSLESS);
  });

  it('dispose() waits for hygiene before its initialization lease begins', async () => {
    const port = new SqliteMemoryPort({ projectRoot: tempDir });
    activePorts.push(port);
    const originalInitialize = port.initialize.bind(port);
    let releaseInitialize!: () => void;
    let enteredInitialize!: () => void;
    const initializeGate = new Promise<void>((resolve) => {
      releaseInitialize = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enteredInitialize = resolve;
    });
    (port as unknown as { initialize: typeof port.initialize }).initialize = async () => {
      enteredInitialize();
      await initializeGate;
      return originalInitialize();
    };

    const hygiene = port.hygiene({ verify: false });
    await entered;
    let disposeSettled = false;
    const disposal = port.dispose().then(() => {
      disposeSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const settledBeforeInitialization = disposeSettled;
    releaseInitialize();
    await Promise.allSettled([hygiene, disposal]);

    expect(settledBeforeInitialization).toBe(false);
  });
});
