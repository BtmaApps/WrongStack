/**
 * `wstack typesafe replay-memory-triage` — calibrate the triage front on this
 * project's own memories.
 *
 * Opens the project's SAGE database READ-ONLY, runs the deterministic Phases
 * 1–2 exactly as `/memory triage` does to find the gray zone, samples it, and
 * asks both Jev (`probeMemoryValue`, raw distribution) and the configured LLM
 * (the same prompt and parser `/memory triage` uses) for a 1–5 rating.
 *
 * The report compares them on the rating and — what actually matters — on the
 * triage ACTION each rating would cause (keep / stale / propose archive),
 * overall and for the subset the front would settle at each confidence
 * threshold. The LLM is the reference, not ground truth; `--no-llm` skips it
 * and reports Jev's distribution alone. Nothing is written anywhere.
 */

import * as path from 'node:path';
import { resolveTypeSafeAccount } from '@wrongstack/core/typesafe';
import { color } from '@wrongstack/core/utils';
import { loadRuntimeDatabaseSync } from '@wrongstack/persistence';
import {
  computeValueScore,
  evaluateMemory,
  type LlmCallFn,
  type MemoryValueProbe,
  preFilterBatch,
  probeMemoryValue,
  type Sage,
} from '@wrongstack/sage';
import type { SubcommandDeps } from '../contracts.js';
import { createProviderForId } from './modeldiag-eval.js';

interface TriageCase {
  memory: Sage;
  vsTotal: number;
  jev?: MemoryValueProbe | undefined;
  jevAction?: string | undefined;
  llmScore?: number | undefined;
  llmAction?: string | undefined;
  error?: string | undefined;
}

const SYSTEM_ONE_MIN_CONFIDENCE = 0.55;
const SYSTEM_ONE_MIN_PROBABILITY = 0.5;

async function loadMemories(dbPath: string): Promise<Sage[]> {
  // Read-only: a running daemon owns this database, and calibration must
  // never be the thing that writes to it.
  // Through the runtime loader, not `node:sqlite` directly: the standalone
  // binary runs on Bun, and SQLite construction outside the owning stores is
  // an architecture-test boundary.
  const Database = loadRuntimeDatabaseSync();
  const db = new Database(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare("SELECT data FROM memories WHERE status IN ('active', 'stale')")
      .all() as Array<{ data: string }>;
    const out: Sage[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.data) as Sage);
      } catch {
        // A corrupt row is the store's problem, not calibration's.
      }
    }
    return out;
  } finally {
    db.close();
  }
}

/** The action `/memory triage` would take for a given rating. */
async function actionFor(memory: Sage, score: number): Promise<string> {
  const vs = computeValueScore(memory);
  const result = await evaluateMemory(memory, vs, async () => `${score} | calibration`);
  return result.action === 'keep_llm_override' ? 'keep' : result.action;
}

export async function replayMemoryTriage(
  deps: SubcommandDeps,
  write: (line: string) => void,
): Promise<number> {
  const flags = deps.flags ?? {};
  const account = resolveTypeSafeAccount({ config: deps.config, restGate: null });
  if (account.status !== 'ready') {
    write(`${color.red('✗')} ${account.reason}. Run \`wstack typesafe login\`.`);
    return 2;
  }
  const limit = Math.max(1, Number(flags['limit']) || 40);
  const useLlm = flags['no-llm'] !== true;

  const storageDir = deps.config.Sage?.storage?.directory;
  const dbPath = path.resolve(
    deps.projectRoot,
    storageDir && typeof storageDir === 'string'
      ? storageDir
      : path.join('.wrongstack', 'memories'),
    'sage.db',
  );
  let memories: Sage[];
  try {
    memories = await loadMemories(dbPath);
  } catch (err) {
    write(`${color.red('✗')} cannot open ${dbPath}: ${(err as Error).message}`);
    return 2;
  }

  // Phases 1–2, as the orchestrator runs them: only the gray zone reaches Phase 3.
  const { uncertain } = preFilterBatch(memories);
  const gray = uncertain
    .map((memory) => ({ memory, vs: computeValueScore(memory) }))
    .filter((x) => x.vs.band === 'gray');
  const step = Math.max(1, gray.length / limit);
  const cases: TriageCase[] = [];
  for (let i = 0; i < gray.length && cases.length < limit; i += step) {
    const pick = gray[Math.floor(i)];
    if (pick) cases.push({ memory: pick.memory, vsTotal: pick.vs.total });
  }
  if (flags['json'] !== true)
    write(
      color.dim(
        `${memories.length} memories, ${gray.length} in the gray zone; replaying ${cases.length}` +
          (useLlm ? ' with the LLM reference' : ' (Jev only)'),
      ),
    );
  if (cases.length === 0) return 0;

  let callLlm: LlmCallFn | undefined;
  let llmLabel = '';
  if (useLlm) {
    const providerId =
      typeof flags['provider'] === 'string' ? flags['provider'] : deps.config.provider;
    const model = typeof flags['model'] === 'string' ? flags['model'] : deps.config.model;
    const provider = createProviderForId(
      providerId,
      deps.config as Parameters<typeof createProviderForId>[1],
    );
    if (!provider?.complete) {
      write(
        color.amber(
          `! cannot build provider "${providerId}" here; use --provider/--model or --no-llm.`,
        ),
      );
      return 2;
    }
    llmLabel = `${providerId}/${model}`;
    callLlm = async (system, user) => {
      const response = await provider.complete(
        {
          model,
          system: [{ type: 'text', text: system }],
          messages: [{ role: 'user', content: user }],
          // 60 is what `/memory triage` sends; --llm-max-tokens shows whether
          // a reasoning model needs more room to produce any answer at all.
          maxTokens: Math.max(16, Number(flags['llm-max-tokens']) || 60),
          temperature: 0.1,
        },
        { signal: AbortSignal.timeout(60_000) },
      );
      return response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    };
  }

  const judge = { client: account.client, model: account.model, feature: 'memoryTriage' as const };
  const CONCURRENCY = 6;
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    await Promise.all(
      cases.slice(i, i + CONCURRENCY).map(async (c) => {
        try {
          c.jev = await probeMemoryValue(judge, c.memory);
          if (c.jev) c.jevAction = await actionFor(c.memory, c.jev.score);
        } catch (err) {
          c.error = `jev: ${err instanceof Error ? err.message : String(err)}`;
        }
        if (!callLlm) return;
        try {
          const r = await evaluateMemory(c.memory, computeValueScore(c.memory), callLlm);
          if (r.evaluation.ok) {
            c.llmScore = r.evaluation.score;
            c.llmAction = r.action === 'keep_llm_override' ? 'keep' : r.action;
          } else {
            c.error = `llm: ${r.evaluation.error ?? 'no score'}`;
          }
        } catch (err) {
          c.error = `llm: ${err instanceof Error ? err.message : String(err)}`;
        }
      }),
    );
  }

  const judged = cases.filter((c) => c.jev);
  const both = judged.filter((c) => c.llmScore !== undefined);
  const settles = (c: TriageCase, minConfidence: number) =>
    !!c.jev && c.jev.confidence >= minConfidence && c.jev.probability >= SYSTEM_ONE_MIN_PROBABILITY;
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);

  if (flags['json'] === true) {
    write(
      JSON.stringify(
        {
          db: dbPath,
          llm: llmLabel || null,
          model: judged[0]?.jev?.model,
          cases: cases.map((c) => ({
            id: c.memory.id,
            text: c.memory.text.slice(0, 160),
            phase2: c.vsTotal,
            jev: c.jev
              ? {
                  score: c.jev.score,
                  p: Number(c.jev.probability.toFixed(3)),
                  confidence: Number(c.jev.confidence.toFixed(3)),
                  action: c.jevAction,
                }
              : null,
            llm: c.llmScore !== undefined ? { score: c.llmScore, action: c.llmAction } : null,
            error: c.error,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  write('');
  write(color.bold('Jev rating distribution'));
  const dist = [1, 2, 3, 4, 5].map((s) => judged.filter((c) => c.jev!.score === s).length);
  write(`  1:${dist[0]}  2:${dist[1]}  3:${dist[2]}  4:${dist[3]}  5:${dist[4]}`);
  if (both.length > 0) {
    write(color.bold(`Jev vs LLM (${llmLabel}), n=${both.length}`));
    write(
      `  rating exact   ${pct(both.filter((c) => c.jev!.score === c.llmScore).length, both.length)}`,
    );
    write(
      `  rating ±1      ${pct(both.filter((c) => Math.abs(c.jev!.score - c.llmScore!) <= 1).length, both.length)}`,
    );
    write(
      `  same action    ${pct(both.filter((c) => c.jevAction === c.llmAction).length, both.length)}`,
    );
    write('  matrix (rows Jev 1-5, cols LLM 1-5)');
    for (let j = 1; j <= 5; j++) {
      const row = [1, 2, 3, 4, 5].map(
        (l) => both.filter((c) => c.jev!.score === j && c.llmScore === l).length,
      );
      write(`    ${j}: ${row.map((n) => String(n).padStart(3)).join('')}`);
    }
    write('');
    write(color.bold('Sweep (confidence threshold, p ≥ 0.5): settles / same action'));
    for (const t of [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8]) {
      const s = both.filter((c) => settles(c, t));
      write(
        `  conf ≥ ${t.toFixed(2)}${t === SYSTEM_ONE_MIN_CONFIDENCE ? ' (current)' : '          '}` +
          `  ${pct(s.length, both.length).padStart(4)}  ${pct(
            s.filter((c) => c.jevAction === c.llmAction).length,
            s.length,
          )}`,
      );
    }
  } else {
    const s = judged.filter((c) => settles(c, SYSTEM_ONE_MIN_CONFIDENCE));
    write(`  settles at current thresholds: ${pct(s.length, judged.length)}`);
  }
  const errors = cases.filter((c) => c.error);
  if (errors.length > 0) {
    write(color.amber(`${errors.length} case(s) with errors, e.g. ${errors[0]?.error}`));
  }
  write(color.dim(`model ${judged[0]?.jev?.model ?? account.model}`));
  return 0;
}
