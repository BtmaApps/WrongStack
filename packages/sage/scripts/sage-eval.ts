#!/usr/bin/env bun
/**
 * SAGE injection replay eval.
 *
 *   bun packages/sage/scripts/sage-eval.ts [--days 14] [--max-cases 3000]
 *     [--profile default] [--variant 'loose:minScore=0.6,relationFloor=0.8']
 *     [--sessions <dir>] [--json <out.json>]
 *     [--judge-export <pairs.jsonl>] [--judge-labels <labels.jsonl>] [--keep]
 *
 * Replays the tool calls of recent logged sessions through the production
 * tool-result injection middleware against a consistent snapshot of the
 * project's live `sage.db`, once per configuration, and prints comparable
 * metrics. The `current` configuration is the active profile's `Sage.inject`.
 *
 * Labels: `--judge-export` writes one JSON line per injected (case, memory)
 * pair with the user goal and tool call, for an LLM or human judge. Feed the
 * labels back with `--judge-labels` (lines of `{caseId, memoryId, label}`
 * where label 0 = irrelevant, 1 = related, 2 = would change the next step) to
 * get judged precision per configuration.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  mineReplayCases,
  type ReplayCase,
  type ReplayConfig,
  type ReplayRun,
  replayInjection,
  summarizeReplay,
} from '../src/eval/injection-replay.js';
import { SqliteSageStore } from '../src/sqlite-store.js';
import { loadDatabaseSync } from '../src/sqlite-store-loader.js';
import type { Sage } from '../src/types.js';

interface Args {
  root: string;
  days: number;
  maxCases: number;
  profile: string;
  variants: ReplayConfig[];
  sessions?: string;
  json?: string;
  judgeExport?: string;
  judgeLabels?: string;
  keep: boolean;
}

const NUMERIC_KEYS = new Set([
  'maxHintsPerTool',
  'maxCharsPerTool',
  'minScore',
  'minImportance',
  'relationFloor',
  'repeatCooldownMs',
]);

function parseVariant(spec: string): ReplayConfig {
  const [name, settings = ''] = spec.split(':', 2);
  const options: Record<string, number | boolean> = {};
  for (const pair of settings.split(',').filter(Boolean)) {
    const [key, raw] = pair.split('=', 2);
    if (!key || raw === undefined) throw new Error(`Bad variant setting "${pair}"`);
    if (key === 'taskAware') options[key] = raw === 'true';
    else if (NUMERIC_KEYS.has(key) && Number.isFinite(Number(raw))) options[key] = Number(raw);
    else throw new Error(`Unknown or non-numeric variant setting "${key}"`);
  }
  if (!name) throw new Error(`Variant "${spec}" needs a name`);
  return { name, options };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    root: process.cwd(),
    days: 14,
    maxCases: 3000,
    profile: 'default',
    variants: [],
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === '--root') args.root = path.resolve(value());
    else if (flag === '--days') args.days = Number(value());
    else if (flag === '--max-cases') args.maxCases = Number(value());
    else if (flag === '--profile') args.profile = value();
    else if (flag === '--variant') args.variants.push(parseVariant(value()));
    else if (flag === '--sessions') args.sessions = path.resolve(value());
    else if (flag === '--json') args.json = path.resolve(value());
    else if (flag === '--judge-export') args.judgeExport = path.resolve(value());
    else if (flag === '--judge-labels') args.judgeLabels = path.resolve(value());
    else if (flag === '--keep') args.keep = true;
    else throw new Error(`Unknown flag ${flag}`);
  }
  return args;
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function profileInjectOptions(profile: string): NonNullable<ReplayConfig['options']> {
  const config = readJson(
    path.join(os.homedir(), '.wrongstack', 'profiles', profile, 'config.json'),
  );
  const inject = ((config?.Sage as Record<string, unknown> | undefined)?.inject ?? {}) as Record<
    string,
    unknown
  >;
  const options: Record<string, unknown> = {};
  for (const key of [...NUMERIC_KEYS, 'taskAware', 'triggers']) {
    if (inject[key] !== undefined) options[key] = inject[key];
  }
  return options as NonNullable<ReplayConfig['options']>;
}

function listSessionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSessionFiles(full));
    else if (entry.name.endsWith('.jsonl') && entry.name.startsWith('sess_')) out.push(full);
  }
  return out;
}

/** The sessions directory whose newest session was started in `root`. */
function findSessionsDir(root: string): string {
  const projects = path.join(os.homedir(), '.wrongstack', 'projects');
  const want = path.resolve(root).toLowerCase();
  let best: { dir: string; count: number } | undefined;
  for (const project of fs.readdirSync(projects)) {
    const dir = path.join(projects, project, 'sessions');
    if (!fs.existsSync(dir)) continue;
    const files = listSessionFiles(dir);
    const newest = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!newest) continue;
    const first = fs.readFileSync(newest, 'utf8').split('\n', 1)[0] ?? '';
    const checkout = (readJsonLine(first)?.checkout as string | undefined) ?? '';
    if (path.resolve(checkout).toLowerCase() !== want) continue;
    if (!best || files.length > best.count) best = { dir, count: files.length };
  }
  if (!best) throw new Error(`No WrongStack sessions found for ${root}; pass --sessions <dir>.`);
  return best.dir;
}

function readJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function snapshotStore(root: string): { store: SqliteSageStore; dir: string } {
  const relative = path.join('.temp_files', 'sage-eval', `snapshot-${Date.now()}`);
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  const live = new DatabaseSync(path.join(root, '.wrongstack', 'memories', 'sage.db'));
  try {
    // A consistent point-in-time copy, read through SQLite (WAL included);
    // copying the files while the daemon writes could tear the snapshot.
    live.exec(`VACUUM INTO '${path.join(dir, 'sage.db').replaceAll("'", "''")}'`);
  } finally {
    live.close();
  }
  return { store: new SqliteSageStore({ projectRoot: root, directory: relative }), dir };
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sessionsDir = args.sessions ?? findSessionsDir(args.root);
  const cutoff = Date.now() - args.days * 86_400_000;
  const files = listSessionFiles(sessionsDir)
    .filter((file) => fs.statSync(file).mtimeMs >= cutoff)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const cases: ReplayCase[] = [];
  for (const file of files) {
    if (cases.length >= args.maxCases) break;
    const sessionId = path
      .relative(sessionsDir, file)
      .replaceAll('\\', '/')
      .replace(/\.jsonl$/, '');
    cases.push(...mineReplayCases(fs.readFileSync(file, 'utf8'), sessionId));
  }
  cases.splice(args.maxCases);
  console.log(`${cases.length} tool calls from ${files.length} sessions (last ${args.days}d)`);

  const { store, dir } = snapshotStore(args.root);
  await store.initialize();
  const cache = new Map<string, Promise<Sage | undefined>>();
  const getMemory = (id: string) => {
    let hit = cache.get(id);
    if (!hit) {
      hit = store.getSage(id).then((memory) => memory ?? undefined);
      cache.set(id, hit);
    }
    return hit;
  };
  const retriever = {
    retrieveForPath: (opts: { path: string } & Record<string, unknown>) =>
      store.retrieveForPath([opts.path], opts),
    searchSage: (query: string, opts?: Record<string, unknown>) => store.searchSage(query, opts),
    findRelatedSage: (ids: string[], opts?: Record<string, unknown>) =>
      store.findRelatedSage(ids, opts),
    recordInjection: async () => {},
    recordUse: async () => {},
  } as unknown as Parameters<typeof replayInjection>[0]['retriever'];

  const configs: ReplayConfig[] = [
    { name: 'current', options: profileInjectOptions(args.profile) },
    ...args.variants.map((variant) => ({
      ...variant,
      options: { ...profileInjectOptions(args.profile), ...variant.options },
    })),
  ];
  const labels = args.judgeLabels ? readLabels(args.judgeLabels) : undefined;
  const runs: ReplayRun[] = [];
  const summaries = [];
  try {
    for (const config of configs) {
      const run = await replayInjection({
        projectRoot: args.root,
        retriever,
        getMemory,
        cases,
        config,
      });
      runs.push(run);
      const summary = await summarizeReplay(run, args.root, getMemory);
      const judged = labels ? judgedPrecision(run, labels) : undefined;
      summaries.push({ ...summary, ...(judged ? { judged } : {}) });
      console.log(`\n== ${config.name} ${JSON.stringify(config.options ?? {})}`);
      console.log(
        `  injecting calls ${summary.casesWithInjection}/${summary.cases} · injections ${summary.injections} ` +
          `(${summary.uniqueMemories} distinct) · avg ${summary.avgCharsPerInjectingCase} chars`,
      );
      console.log(
        `  used ${pct(summary.usedRate)} (cited ${pct(summary.citedRate)}) · edit-touched ${pct(summary.editTouchedRate)} · ` +
          `progress-log ${pct(summary.progressLogShare)} · missing-anchor ${pct(summary.missingAnchorShare)}`,
      );
      if (judged) {
        console.log(
          `  judged precision ${pct(judged.precision)} (≥1) · actionable ${pct(judged.actionable)} (=2) · labelled ${judged.labelled}/${summary.injections}`,
        );
      }
      for (const top of summary.topMemories.slice(0, 5)) {
        console.log(`    ${top.injections}× used ${top.used}  ${top.id}  ${top.text}`);
      }
    }
    if (args.judgeExport) await writeJudgeExport(args.judgeExport, runs, cases, getMemory);
    if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(summaries, null, 2)}\n`);
  } finally {
    store.close();
    if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readLabels(file: string): Map<string, number> {
  const labels = new Map<string, number>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const row = readJsonLine(line);
    if (row && typeof row.caseId === 'string' && typeof row.memoryId === 'string') {
      labels.set(`${row.caseId}\0${row.memoryId}`, Number(row.label));
    }
  }
  return labels;
}

function judgedPrecision(run: ReplayRun, labels: Map<string, number>) {
  let labelled = 0;
  let related = 0;
  let actionable = 0;
  for (const result of run.results) {
    for (const id of result.injected) {
      const label = labels.get(`${result.caseId}\0${id}`);
      if (label === undefined || !Number.isFinite(label)) continue;
      labelled++;
      if (label >= 1) related++;
      if (label >= 2) actionable++;
    }
  }
  return {
    labelled,
    precision: labelled ? related / labelled : 0,
    actionable: labelled ? actionable / labelled : 0,
  };
}

async function writeJudgeExport(
  file: string,
  runs: ReplayRun[],
  cases: ReplayCase[],
  getMemory: (id: string) => Promise<Sage | undefined>,
): Promise<void> {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const run of runs) {
    for (const result of run.results) {
      for (const memoryId of result.injected) {
        const key = `${result.caseId}\0${memoryId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const replayCase = byId.get(result.caseId);
        const memory = await getMemory(memoryId);
        if (!replayCase || !memory) continue;
        lines.push(
          JSON.stringify({
            caseId: result.caseId,
            memoryId,
            userGoal: replayCase.userGoal,
            tool: { name: replayCase.toolName, input: replayCase.input },
            memory: { kind: memory.kind, text: memory.text, anchors: memory.anchors },
            question:
              'Given the user goal and this tool call, label the memory: 0 = irrelevant, 1 = related but would not change the next step, 2 = would change or prevent a mistake in the next step.',
          }),
        );
      }
    }
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`\nwrote ${lines.length} judge pairs to ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
