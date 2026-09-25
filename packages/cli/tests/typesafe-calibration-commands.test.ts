/**
 * `wstack typesafe replay-*` and `check-judgments` — the calibration surface.
 *
 * These commands exist to be read by a person tuning thresholds, so the
 * behaviour worth pinning is what they read and what they report: which
 * journal/ledger/database rows become cases, that the missing-account and
 * unreadable-input paths exit 2 instead of reporting an empty calibration,
 * and that host failures are counted rather than crashing the run. The
 * TypeSafe host and the reference provider are fakes; the judgment code in
 * between is the real one.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SystemOneRequest, SystemOneResult, TypeSafeAnswer } from '@wrongstack/core/typesafe';
import { loadRuntimeDatabaseSync } from '@wrongstack/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  empty: false,
  ready: true,
  fail: undefined as string | undefined,
  noul: 0.95,
  scoreLevel: 3,
  calls: 0,
  providerReply: '',
  provider: true,
}));

function answerFor(q: SystemOneRequest['questions'][string]): TypeSafeAnswer {
  if (q.type === 'noul') return { type: 'noul', noul: host.noul };
  if (q.type === 'choice') {
    const ids = Object.keys(q.criteria);
    const probabilities = Object.fromEntries(
      ids.map((id, i) => [id, i === 0 ? 0.95 : 0.05 / (ids.length - 1)]),
    );
    return { type: 'choice', choice: ids[0]!, probabilities, confidence: 0.9 };
  }
  const probabilities = Object.fromEntries(
    q.criteria.map((_, i) => [
      String(i),
      i === host.scoreLevel ? 0.8 : 0.2 / (q.criteria.length - 1),
    ]),
  );
  return { type: 'score', score: host.scoreLevel, probabilities, confidence: 0.7, legend: {} };
}

vi.mock('@wrongstack/core/typesafe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/core/typesafe')>();
  const client = {
    async systemOne(req: SystemOneRequest): Promise<SystemOneResult> {
      host.calls++;
      if (host.fail) throw new Error(host.fail);
      if (host.empty) return { answers: {}, usage: { inputTokens: 0, outputTokens: 0 } };
      const answers: Record<string, TypeSafeAnswer> = {};
      for (const [id, q] of Object.entries(req.questions)) answers[id] = answerFor(q);
      return { answers, usage: { inputTokens: 1, outputTokens: 1 }, model: 'jev-fake' };
    },
  };
  return {
    ...actual,
    resolveTypeSafeAccount: () =>
      host.ready
        ? { status: 'ready', client, model: 'jev-fake', route: 'typesafe' }
        : { status: 'unconfigured', reason: 'no TypeSafe API key' },
  };
});

vi.mock('../src/subcommands/handlers/modeldiag-eval.js', () => ({
  createProviderForId: () =>
    host.provider
      ? {
          complete: async () => ({ content: [{ type: 'text', text: host.providerReply }] }),
        }
      : undefined,
}));

import { replayBrainLedger } from '../src/subcommands/handlers/typesafe-brain-replay.js';
import { checkJudgments } from '../src/subcommands/handlers/typesafe-judgment-check.js';
import { replayTopicShift } from '../src/subcommands/handlers/typesafe-topic-replay.js';
import { replayMemoryTriage } from '../src/subcommands/handlers/typesafe-triage-replay.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ws-typesafe-cal-'));
  Object.assign(host, {
    empty: false,
    ready: true,
    fail: undefined,
    noul: 0.95,
    scoreLevel: 3,
    calls: 0,
    providerReply: '',
    provider: true,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Deps = Parameters<typeof replayBrainLedger>[0];

function run(
  fn: (deps: Deps, write: (line: string) => void) => Promise<number>,
  flags: Record<string, string | boolean> = {},
): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const deps = {
    config: { provider: 'fake', model: 'fake-model', features: {} },
    flags,
    paths: { projectDir: dir },
    projectRoot: dir,
    cwd: dir,
  } as unknown as Deps;
  return fn(deps, (line) => lines.push(line)).then((code) => ({
    code,
    out: lines.join('\n').replace(/\x1b\[[0-9;]*m/g, ''),
  }));
}

describe('every calibration command without an account', () => {
  it.each([
    ['replay-brain-ledger', replayBrainLedger],
    ['replay-topic-shift', replayTopicShift],
    ['replay-memory-triage', replayMemoryTriage],
    ['check-judgments', checkJudgments],
  ] as const)('%s exits 2 and points at login', async (_name, fn) => {
    host.ready = false;
    const { code, out } = await run(fn);
    expect(code).toBe(2);
    expect(out).toContain('wstack typesafe login');
    expect(host.calls).toBe(0);
  });
});

describe('replay-brain-ledger', () => {
  const answered = (requestId: string, question: string, optionId: string, detail = '') =>
    JSON.stringify({ requestId, kind: 'answered', question, optionId, detail });

  function writeLedger(lines: string[]): string {
    const file = path.join(dir, 'brain-ledger.jsonl');
    writeFileSync(file, lines.join('\n'));
    return file;
  }

  it('rebuilds only BrainMonitor steer/continue decisions, once per question', async () => {
    const churn = 'The file "src/a.ts" has been edited 5 times within 10 minutes — steer it?';
    writeLedger([
      answered('r1', churn, 'steer', 'Council voted steer'),
      answered('r2', churn, 'continue'), // same question: deduplicated
      answered('r3', 'The tool "exec" has failed 4 times in a row.', 'continue'),
      answered('r4', 'The agent has made no observable progress for 10 minutes.', 'steer'),
      answered('r5', '7 errors occurred within 2 minutes.', 'steer'),
      answered('r6', 'Should the deploy go ahead?', 'steer'), // not a monitor question
      answered('r7', 'The file "src/b.ts" has been edited 3 times within 5 minutes.', 'abort'),
      JSON.stringify({ requestId: 'r1', kind: 'outcome', outcome: 'failure' }),
      '{"torn line',
    ]);
    const { code, out } = await run(replayBrainLedger, { json: true });
    expect(code).toBe(0);
    const report = JSON.parse(out) as {
      kinds: Array<{ kind: string; n: number; council: number; futileSteers: number }>;
      judged: number;
      errors: number;
      model: string;
    };
    expect(report.kinds.map((k) => k.kind).sort()).toEqual([
      'error_storm',
      'file_churn',
      'stall',
      'tool_failure',
    ]);
    const fileChurn = report.kinds.find((k) => k.kind === 'file_churn')!;
    expect(fileChurn).toMatchObject({ n: 1, council: 1, futileSteers: 1 });
    expect(report.judged).toBe(4);
    expect(report.errors).toBe(0);
    expect(report.model).toBe('jev-fake');
  });

  it('narrows to one --kind and prints the human report with the sweep', async () => {
    writeLedger([
      answered('r1', 'The file "src/a.ts" has been edited 5 times within 10 minutes.', 'steer'),
      answered('r2', 'The tool "exec" has failed 4 times in a row.', 'continue'),
    ]);
    const { code, out } = await run(replayBrainLedger, { kind: 'tool_failure' });
    expect(code).toBe(0);
    expect(out).toContain('Replaying 1 decision(s)');
    expect(out).toContain('tool_failure');
    expect(out).not.toContain('file_churn');
    expect(out).toContain('Sweep (decidable threshold');
    expect(out).toContain('model jev-fake');
  });

  it('counts host errors instead of failing the run', async () => {
    writeLedger([answered('r1', 'The tool "exec" has failed 4 times in a row.', 'continue')]);
    host.fail = 'socket hang up';
    const { code, out } = await run(replayBrainLedger);
    expect(code).toBe(0);
    expect(out).toContain('1 case(s) not judged (host error).');
  });

  it('says so when nothing in the ledger is replayable', async () => {
    writeLedger([answered('r1', 'Should the deploy go ahead?', 'steer')]);
    const { code, out } = await run(replayBrainLedger);
    expect(code).toBe(0);
    expect(out).toContain('No replayable BrainMonitor decisions');
    expect(host.calls).toBe(0);
  });

  it('exits 2 when the ledger cannot be read', async () => {
    const { code, out } = await run(replayBrainLedger, {
      ledger: path.join(dir, 'missing.jsonl'),
    });
    expect(code).toBe(2);
    expect(out).toContain('cannot read');
  });
});

describe('replay-topic-shift', () => {
  /** A long auth-themed session followed by one unrelated prompt: passes the local gate. */
  function writeSession(): void {
    const day = path.join(dir, 'sessions', '2026-09-19');
    mkdirSync(day, { recursive: true });
    const events: unknown[] = [{ type: 'llm_request', estimatedInputTokens: 60_000 }];
    for (let i = 0; i < 9; i++) {
      const text = `Continue the authentication session middleware token validation work, step ${i}.`;
      events.push({ type: 'user_input', content: text });
      events.push({ type: 'message_appended', message: { role: 'user', content: text } });
      events.push({
        type: 'message_appended',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: `Updated the token validation (step ${i}).` }],
        },
      });
    }
    events.push({
      type: 'user_input',
      content: 'Plan a two-week summer holiday in Portugal and estimate the budget.',
    });
    writeFileSync(
      path.join(day, 'sess_abc.jsonl'),
      `${events.map((e) => JSON.stringify(e)).join('\n')}\nnot json\n`,
    );
    writeFileSync(path.join(day, 'unrelated.txt'), 'ignored');
  }

  it('reports only prompts that pass the local gate, with both classifiers', async () => {
    writeSession();
    host.providerReply = '{"decision":"new_context","confidence":0.9}';
    const { code, out } = await run(replayTopicShift, { json: true, 'max-context': '200000' });
    expect(code).toBe(0);
    const report = JSON.parse(out) as {
      scanned: number;
      llm: string;
      cases: Array<{ session: string; prompt: string; jevBucket: string; llm: string }>;
    };
    expect(report.scanned).toBe(10);
    expect(report.llm).toBe('fake/fake-model');
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]).toMatchObject({ session: 'sess_abc', jevBucket: 'new', llm: 'new' });
    expect(report.cases[0]!.prompt).toContain('Portugal');
  });

  it('records why the provider gave no answer, and the agreement where Jev is decisive', async () => {
    writeSession();
    host.providerReply = 'I think this is a new topic.';
    const { code, out } = await run(replayTopicShift, { 'max-context': '200000' });
    expect(code).toBe(0);
    expect(out).toContain('10 prompt(s) scanned in 1 session file(s); 1 passed the local gate');
    expect(out).toContain('new 1  same 0');
    expect(out).toContain('answered 0/1');
    expect(out).toContain('1× unparseable reply');
    expect(out).toContain('agreement where Jev is decisive: — of 0');
  });

  it('runs Jev alone with --no-llm and survives a missing sessions directory', async () => {
    const { code, out } = await run(replayTopicShift, { 'no-llm': true, 'max-context': '200000' });
    expect(code).toBe(0);
    expect(out).toContain('0 prompt(s) scanned in 0 session file(s)');
    expect(out).not.toContain('Provider classifier');
  });

  it('refuses to guess a window when neither the flag nor the catalog knows it', async () => {
    const { code, out } = await run(replayTopicShift, { 'no-llm': true });
    expect(code).toBe(2);
    expect(out).toContain('Pass --max-context');
  });
});

describe('replay-memory-triage', () => {
  const sage = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    revision: 1,
    scope: 'project',
    kind: 'fact',
    status: 'active',
    persistence: 'session',
    text: `Build output for package ${id} lands in dist/ and is regenerated on every build run.`,
    importance: 0.5,
    confidence: 0.5,
    freshness: 0.5,
    tags: [],
    anchors: [],
    sources: [{ type: 'agent' }],
    useCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  });

  function writeDb(memories: unknown[]): void {
    const memDir = path.join(dir, '.wrongstack', 'memories');
    mkdirSync(memDir, { recursive: true });
    const Database = loadRuntimeDatabaseSync();
    const db = new Database(path.join(memDir, 'sage.db'));
    db.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, status TEXT, data TEXT)');
    const insert = db.prepare('INSERT INTO memories (id, status, data) VALUES (?, ?, ?)');
    for (const m of memories as Array<{ id: string; status: string }>) {
      insert.run(m.id, m.status, JSON.stringify(m));
    }
    insert.run('corrupt', 'active', '{not json');
    insert.run('gone', 'archived', JSON.stringify(sage('gone', { status: 'archived' })));
    db.close();
  }

  it('compares Jev and the LLM on the gray zone, rating and action', async () => {
    writeDb([sage('m1'), sage('m2'), sage('m3')]);
    host.providerReply = '4 | useful build note';
    const { code, out } = await run(replayMemoryTriage, { json: true });
    expect(code).toBe(0);
    const report = JSON.parse(out) as {
      llm: string;
      model: string;
      cases: Array<{ id: string; jev: { score: number } | null; llm: { score: number } | null }>;
    };
    expect(report.llm).toBe('fake/fake-model');
    expect(report.model).toBe('jev-fake');
    expect(report.cases.map((c) => c.id).sort()).toEqual(['m1', 'm2', 'm3']);
    for (const c of report.cases) {
      expect(c.jev?.score).toBe(host.scoreLevel + 1);
      expect(c.llm?.score).toBe(4);
    }
  });

  it('prints the agreement matrix and the confidence sweep', async () => {
    writeDb([sage('m1'), sage('m2')]);
    host.providerReply = '4 | useful build note';
    const { code, out } = await run(replayMemoryTriage);
    expect(code).toBe(0);
    expect(out).toContain('in the gray zone; replaying 2 with the LLM reference');
    expect(out).toContain('1:0  2:0  3:0  4:2  5:0');
    expect(out).toContain('rating exact   100%');
    expect(out).toContain('conf ≥ 0.55 (current)');
  });

  it('reports Jev alone with --no-llm and counts host errors', async () => {
    writeDb([sage('m1'), sage('m2')]);
    host.fail = 'rate limited';
    const { code, out } = await run(replayMemoryTriage, { 'no-llm': true });
    expect(code).toBe(0);
    expect(out).toContain('(Jev only)');
    expect(out).toContain('settles at current thresholds: —');
    expect(out).toContain('2 case(s) with errors, e.g. jev: rate limited');
  });

  it('exits 2 when the reference provider cannot be built', async () => {
    writeDb([sage('m1')]);
    host.provider = false;
    const { code, out } = await run(replayMemoryTriage);
    expect(code).toBe(2);
    expect(out).toContain('cannot build provider "fake"');
  });

  it('exits 2 when the SAGE database cannot be opened', async () => {
    const { code, out } = await run(replayMemoryTriage);
    expect(code).toBe(2);
    expect(out).toContain('cannot open');
  });
});

describe('check-judgments', () => {
  it('runs every feature through its real question builder and reports expected vs. actual', async () => {
    const { code, out } = await run(checkJudgments);
    for (const feature of [
      'tool',
      'brain',
      'memoryTriage',
      'topicShift',
      'memoryRecall',
      'compaction',
      'kanbanVerify',
      'modelTier',
      'semanticLint',
      'skillSuggestion',
      'fleetDispatch',
    ]) {
      expect(out).toMatch(new RegExp(`^${feature}$`, 'm'));
    }
    // A host that says yes to everything cannot pass cases whose right answer is no.
    expect(code).toBe(1);
    expect(out).toContain('✓ met criterion');
    expect(out).toContain('✗ unmet criterion');
    expect(out).toMatch(/\d+\/22 as expected — typesafe route, model jev-fake/);
  });

  it('does not treat malformed replies as a correct no-suggestion verdict', async () => {
    host.empty = true;
    const { code, out } = await run(checkJudgments);
    expect(code).toBe(1);
    expect(out).toContain('0/22 as expected');
  });

  it('fails every case, without throwing, when the host is down', async () => {
    host.fail = 'ECONNREFUSED';
    const { code, out } = await run(checkJudgments);
    expect(code).toBe(1);
    expect(out).not.toContain('✓');
    expect(out).toMatch(/0\/22 as expected/);
  });
});
