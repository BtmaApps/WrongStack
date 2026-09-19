/**
 * `wstack typesafe replay-brain-ledger` — calibrate the Brain's System One
 * tier on decisions this project already made.
 *
 * The Brain ledger records every decision (question, chosen option, which tier
 * or council settled it) and, for interventions, whether the same signal fired
 * again afterwards. It does not record the option list or the full context —
 * but the BrainMonitor signals (file churn, tool-failure streak, stall, error
 * storm) always ask the same steer/continue question with a context the
 * question text already carries, so those requests can be rebuilt exactly.
 *
 * Each rebuilt request goes through `probeSystemOneBrain` (the tier's real
 * questions, no thresholds), and the report compares Jev's pick with the
 * recorded one: overall agreement, how much the current thresholds would
 * settle and how often those settled picks agree, a threshold sweep, and how
 * often Jev said `continue` on a steer the ledger shows was futile (the same
 * signal re-fired).
 *
 * The recorded pick is a reference, not ground truth: most were made by the
 * council or a policy, and the outcome record only exists for steers. The
 * decision digest the live tier sees is omitted — rebuilding it from the
 * ledger would leak later outcomes into earlier decisions.
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { BrainDecisionRequest } from '@wrongstack/core/coordination';
import {
  probeSystemOneBrain,
  type SystemOneBrainProbe,
  systemOneBrainSettles,
} from '@wrongstack/core/execution';
import { resolveTypeSafeAccount } from '@wrongstack/core/typesafe';
import { color } from '@wrongstack/core/utils';
import type { SubcommandDeps } from '../contracts.js';

type MonitorKind = 'file_churn' | 'tool_failure' | 'stall' | 'error_storm';

interface LedgerRow {
  requestId: string;
  kind: string;
  question?: string;
  optionId?: string;
  detail?: string;
  outcome?: string;
}

interface ReplayCase {
  kind: MonitorKind;
  question: string;
  recorded: string;
  recordedBy: 'council' | 'other';
  /** `failure` = the same signal re-fired after a steer. */
  outcome: string | undefined;
  probe?: SystemOneBrainProbe | undefined;
  error?: string | undefined;
}

const MONITOR_OPTIONS = [
  {
    id: 'steer',
    label: 'Steer the agent with corrective guidance',
    consequence: 'A steer message is injected before its next step.',
  },
  { id: 'continue', label: 'Let the agent continue unaided' },
];

function monitorKind(question: string): MonitorKind | undefined {
  if (/has been edited \d+ times within/.test(question)) return 'file_churn';
  if (/has failed \d+ times in a row/.test(question)) return 'tool_failure';
  if (/no observable progress/.test(question)) return 'stall';
  if (/errors occurred within/.test(question)) return 'error_storm';
  return undefined;
}

/** Rebuild the context line(s) the monitor attached, from the question. */
function monitorContext(kind: MonitorKind, question: string): string {
  if (kind === 'file_churn') {
    const m = /file "([^"]+)" has been edited (\d+) times within (\d+) minutes/.exec(question);
    if (m) return `File: ${m[1]}\nEdits in window: ${m[2]}\nWindow: ${Number(m[3]) * 60}s`;
  }
  if (kind === 'tool_failure') {
    const m = /tool "([^"]+)" has failed (\d+) times/.exec(question);
    if (m) return `Tool: ${m[1]}\nConsecutive failures: ${m[2]}`;
  }
  return question;
}

function parseFlag(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function replayBrainLedger(
  deps: SubcommandDeps,
  write: (line: string) => void,
): Promise<number> {
  const flags = deps.flags ?? {};
  const account = resolveTypeSafeAccount({ config: deps.config, restGate: null });
  if (account.status !== 'ready') {
    write(`${color.red('✗')} ${account.reason}. Run \`wstack typesafe login\`.`);
    return 2;
  }
  const ledgerPath =
    typeof flags['ledger'] === 'string'
      ? path.resolve(flags['ledger'])
      : path.join(deps.paths.projectDir, 'brain-ledger.jsonl');
  const perKind = parseFlag(flags['limit'], 40);
  const onlyKind = typeof flags['kind'] === 'string' ? flags['kind'] : undefined;

  let raw: string;
  try {
    raw = await readFile(ledgerPath, 'utf8');
  } catch (err) {
    write(`${color.red('✗')} cannot read ${ledgerPath}: ${(err as Error).message}`);
    return 2;
  }
  const rows: LedgerRow[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as LedgerRow);
    } catch {
      // A torn last line from a crash is not a reason to refuse the rest.
    }
  }
  const outcomes = new Map<string, string>();
  for (const r of rows) if (r.kind === 'outcome' && r.outcome) outcomes.set(r.requestId, r.outcome);

  // Stratified, evenly spread sample per kind, deduplicated by question text.
  const byKind = new Map<MonitorKind, ReplayCase[]>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.kind !== 'answered' || !r.question || !r.optionId) continue;
    if (r.optionId !== 'steer' && r.optionId !== 'continue') continue;
    const kind = monitorKind(r.question);
    if (!kind || (onlyKind && kind !== onlyKind) || seen.has(r.question)) continue;
    seen.add(r.question);
    const list = byKind.get(kind) ?? [];
    list.push({
      kind,
      question: r.question,
      recorded: r.optionId,
      recordedBy: r.detail?.startsWith('Council') ? 'council' : 'other',
      outcome: outcomes.get(r.requestId),
    });
    byKind.set(kind, list);
  }
  const cases: ReplayCase[] = [];
  for (const list of byKind.values()) {
    const step = Math.max(1, list.length / perKind);
    for (let i = 0; i < list.length && cases.length < 10_000; i += step) {
      const picked = list[Math.floor(i)];
      if (picked) cases.push(picked);
      if (cases.filter((c) => c.kind === picked?.kind).length >= perKind) break;
    }
  }
  if (cases.length === 0) {
    write('No replayable BrainMonitor decisions in the ledger.');
    return 0;
  }
  if (flags['json'] !== true) {
    write(color.dim(`Replaying ${cases.length} decision(s) from ${ledgerPath}…`));
  }

  const judge = { client: account.client, model: account.model, feature: 'brain' as const };
  const CONCURRENCY = 8;
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    await Promise.all(
      cases.slice(i, i + CONCURRENCY).map(async (c) => {
        const request = {
          id: `replay-${i}`,
          source: 'system',
          question: c.question,
          context: monitorContext(c.kind, c.question),
          risk: 'medium',
          fallback: 'ask_human',
          options: MONITOR_OPTIONS,
        } as unknown as BrainDecisionRequest;
        try {
          c.probe = await probeSystemOneBrain(judge, request, { timeoutMs: 15_000 });
          if (!c.probe) c.error = 'malformed answer';
        } catch (err) {
          c.error = err instanceof Error ? err.message : String(err);
        }
      }),
    );
  }

  const report = summarize(cases);
  if (flags['json'] === true) {
    write(JSON.stringify({ ledger: ledgerPath, ...report }, null, 2));
    return 0;
  }
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
  for (const k of report.kinds) {
    write(color.bold(`${k.kind}`) + color.dim(`  n=${k.n} (council ${k.council})`));
    write(
      `  recorded   steer ${k.recordedSteer} / continue ${k.n - k.recordedSteer}` +
        `   Jev steer ${k.jevSteer} / continue ${k.judged - k.jevSteer}`,
    );
    write(`  agreement  ${pct(k.agree, k.judged)} of ${k.judged} judged`);
    write(
      `  settles    ${pct(k.settled, k.judged)} at current thresholds, ` +
        `agreeing ${pct(k.settledAgree, k.settled)}`,
    );
    if (k.futileSteers > 0) {
      write(
        `  futile steers (signal re-fired): ${k.futileSteers}, Jev said continue on ` +
          `${k.futileSteersJevContinue}`,
      );
    }
  }
  write('');
  write(color.bold('Sweep (decidable threshold; confidence/probability at defaults)'));
  for (const s of report.sweep) {
    write(
      `  decidable ≥ ${s.threshold.toFixed(2)}  settles ${pct(s.settled, report.judged)}  ` +
        `agreeing ${pct(s.agree, s.settled)}`,
    );
  }
  if (report.errors > 0) write(color.amber(`${report.errors} case(s) not judged (host error).`));
  write(color.dim(`model ${report.model ?? account.model}`));
  write(
    color.dim(
      'Replayed contexts lack the tool output the live monitor attaches, so tool_failure ' +
        'reads as signal-only here.',
    ),
  );
  return 0;
}

function summarize(cases: ReplayCase[]) {
  const kinds = [...new Set(cases.map((c) => c.kind))].map((kind) => {
    const list = cases.filter((c) => c.kind === kind);
    const judged = list.filter((c) => c.probe);
    const settled = judged.filter((c) => systemOneBrainSettles(c.probe!));
    const futile = list.filter((c) => c.recorded === 'steer' && c.outcome === 'failure');
    return {
      kind,
      n: list.length,
      council: list.filter((c) => c.recordedBy === 'council').length,
      recordedSteer: list.filter((c) => c.recorded === 'steer').length,
      judged: judged.length,
      jevSteer: judged.filter((c) => c.probe!.optionId === 'steer').length,
      agree: judged.filter((c) => c.probe!.optionId === c.recorded).length,
      settled: settled.length,
      settledAgree: settled.filter((c) => c.probe!.optionId === c.recorded).length,
      futileSteers: futile.length,
      futileSteersJevContinue: futile.filter((c) => c.probe?.optionId === 'continue').length,
    };
  });
  const judged = cases.filter((c) => c.probe);
  // The chosen-option probability is near 1 on almost every case; the
  // "state is enough to decide" Noul is what separates, so sweep that.
  const sweep = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((threshold) => {
    const settled = judged.filter(
      (c) =>
        c.probe!.decidable >= threshold && systemOneBrainSettles(c.probe!, { minDecidable: 0 }),
    );
    return {
      threshold,
      settled: settled.length,
      agree: settled.filter((c) => c.probe!.optionId === c.recorded).length,
    };
  });
  return {
    kinds,
    sweep,
    judged: judged.length,
    errors: cases.filter((c) => c.error).length,
    model: judged[0]?.probe?.model,
    cases: judged.map((c) => ({
      kind: c.kind,
      recorded: c.recorded,
      jev: c.probe!.optionId,
      p: Number(c.probe!.probability.toFixed(3)),
      decidable: Number(c.probe!.decidable.toFixed(3)),
    })),
    disagreements: judged
      .filter((c) => c.probe!.optionId !== c.recorded)
      .slice(0, 20)
      .map((c) => ({
        kind: c.kind,
        question: c.question.slice(0, 200),
        recorded: c.recorded,
        jev: c.probe!.optionId,
        p: Number(c.probe!.probability.toFixed(3)),
        decidable: Number(c.probe!.decidable.toFixed(3)),
      })),
  };
}
