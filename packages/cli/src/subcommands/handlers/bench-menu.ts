/**
 * `wstack bench` with no subcommand at a terminal: a numbered, step-by-step
 * setup for people who do not want to learn the flags. Every answer maps to
 * the same `bench run` flags a script would pass, so a menu run fingerprints
 * and reports exactly like the command line — the menu only builds the flags.
 *
 * Steps: what to compare (models / system prompts / both) → which benchmark →
 * which models → which prompt variants → attempts per task → summary → run.
 * The last answers are remembered so the next run can start with one key.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type BenchReport, readRunDir, readRunManifest, runProgress } from '@wrongstack/bench';
import { SYSTEM_PROMPT_VARIANT_OPTIONS } from '@wrongstack/core/agent';
import {
  buildChildEnv,
  buildWin32CmdShimInvocation,
  color,
  toErrorMessage,
} from '@wrongstack/core/utils';
import { buildPickableProviders } from '../../provider-helpers.js';
import type { SubcommandDeps } from '../contracts.js';
import type { BenchRunPreset } from './bench-run-config.js';

export type CompareMode = 'models' | 'prompts' | 'both';
export type MenuSuite = 'core' | 'hard' | 'polyglot-40' | 'polyglot';

/** Everything the menu asked, persisted for "run that again". */
export interface BenchMenuChoices {
  mode: CompareMode;
  suite: MenuSuite;
  /** `provider/model` refs. */
  models: string[];
  /** System prompt variants; one entry (the lean default) in `models` mode. */
  variants: string[];
  repeats: number;
  polyglotDir?: string | undefined;
}

/** One `bench run` invocation the plan expands to. */
export interface PlannedRun {
  title: string;
  flags: Record<string, string | boolean>;
  harnessOverlay?: Record<string, unknown> | undefined;
}

export const LEAN_DEFAULT_VARIANT = 'quick';

export const SUITE_OPTIONS: ReadonlyArray<{
  suite: MenuSuite;
  label: string;
  tasks: number;
  hint: string;
}> = [
  { suite: 'core', label: 'Quick check', tasks: 6, hint: 'easy tasks — wiring and token cost' },
  { suite: 'hard', label: 'Hard', tasks: 8, hint: 'tricky Node tasks that separate models' },
  {
    suite: 'polyglot-40',
    label: 'Polyglot 40',
    tasks: 40,
    hint: 'pinned Aider subset, 4 languages — fast iteration',
  },
  {
    suite: 'polyglot',
    label: 'Polyglot full',
    tasks: 223,
    hint: 'Aider set minus 2 Boost-only exercises, 6 languages — the score to publish',
  },
];

const MODE_OPTIONS: ReadonlyArray<{ mode: CompareMode; label: string; hint: string }> = [
  { mode: 'models', label: 'Models', hint: 'same harness, different models' },
  { mode: 'prompts', label: 'System prompts', hint: 'same model(s), different prompt variants' },
  { mode: 'both', label: 'Both', hint: 'every model × every prompt variant' },
];

/** Thrown when the user types `q`; the menu returns 0 without running. */
class MenuQuit extends Error {}

/**
 * Parse `1,3` / `1 3` / `2-4` against a list of `max` items. Duplicates are
 * dropped; anything out of range or unparsable yields undefined.
 */
export function parseIndexList(raw: string, max: number): number[] | undefined {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const picked = new Set<number>();
  for (const part of parts) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    const [lo, hi] = range ? [Number(range[1]), Number(range[2])] : [Number(part), Number(part)];
    if (!/^\d+(-\d+)?$/.test(part) || lo < 1 || hi > max || lo > hi) return undefined;
    for (let i = lo; i <= hi; i++) picked.add(i);
  }
  return [...picked];
}

/** Short, unique cell labels: the model id, or `provider/model` when two providers share it. */
export function cellLabels(models: string[]): string[] {
  const ids = models.map((ref) => ref.slice(ref.indexOf('/') + 1));
  return models.map((ref, i) =>
    ids.filter((id) => id === ids[i]).length > 1 ? ref : (ids[i] as string),
  );
}

/** Expand the choices into one `bench run` per prompt variant. */
export function planRuns(choices: BenchMenuChoices): PlannedRun[] {
  const labels = cellLabels(choices.models);
  const cell = choices.models.map((ref, i) => `${labels[i]}=${ref}`).join(',');
  const flags: Record<string, string | boolean> = {
    suite: choices.suite === 'polyglot-40' ? 'polyglot' : choices.suite,
    cell,
    repeats: String(choices.repeats),
  };
  if (choices.suite === 'polyglot' || choices.suite === 'polyglot-40') {
    if (choices.polyglotDir) flags['polyglot-dir'] = choices.polyglotDir;
  }
  if (choices.suite === 'polyglot-40') flags['subset'] = 'polyglot-wstack-40';
  // The pinned full set: the two Boost.DateTime exercises would score every
  // model 0 for an environment reason on a machine without Boost.
  if (choices.suite === 'polyglot') flags['subset'] = 'polyglot-wstack-223';
  const variants = choices.mode === 'models' ? [LEAN_DEFAULT_VARIANT] : choices.variants;
  return variants.map((variant) => ({
    title: `${variant} prompt`,
    flags: { ...flags },
    // The lean profile already runs `quick`; only other variants need an overlay.
    ...(variant === LEAN_DEFAULT_VARIANT ? {} : { harnessOverlay: { systemPrompt: { variant } } }),
  }));
}

/** Attempts the whole plan makes — what the summary warns about. */
export function plannedAttempts(choices: BenchMenuChoices, languagesAvailable?: number): number {
  const option = SUITE_OPTIONS.find((o) => o.suite === choices.suite);
  let tasks = option?.tasks ?? 0;
  if (choices.suite === 'polyglot' && languagesAvailable !== undefined && languagesAvailable < 6) {
    tasks = Math.round((tasks * languagesAvailable) / 6);
  }
  const variants = choices.mode === 'models' ? 1 : choices.variants.length;
  return tasks * choices.models.length * variants * choices.repeats;
}

export interface BenchMenuIo {
  run: (flags: Record<string, string | boolean>, preset: BenchRunPreset) => Promise<number>;
  /** Finish a stopped run in its own directory, with the flags it started with. */
  resume?: ((runDir: string, rerun?: string[]) => Promise<number>) | undefined;
}

export async function runBenchMenu(deps: SubcommandDeps, io: BenchMenuIo): Promise<number> {
  const out = (line = '') => deps.renderer.write(`${line}\n`);
  try {
    out();
    out(
      `  ${color.bold('WrongStack bench')} ${color.dim('— pick what to measure; q quits at any step')}`,
    );
    if (io.resume) {
      const unfinished = await findUnfinishedRun(path.resolve(deps.cwd, 'bench-results'));
      if (unfinished) {
        out();
        out(
          `  ${color.amber('!')} Unfinished run ${color.bold(path.basename(unfinished.dir))}: ` +
            `${unfinished.completed}/${unfinished.planned} done · ${unfinished.label}`,
        );
        const resume = await ask(
          deps,
          `  ${color.amber('?')} Finish it (only the missing runs)? ${color.dim('[Y/n]')} `,
        );
        if (isYes(resume)) {
          const rerun: string[] = [];
          for (const group of unfinished.allFailed) {
            const again = await ask(
              deps,
              `  ${color.amber('?')} All ${group.rows} recorded ${group.prefix} rows failed — ` +
                `a harness fault (e.g. wrong JDK) looks like this. Run them again? ${color.dim('[y/N]')} `,
            );
            if (/^y(es)?$/i.test(again.trim())) rerun.push(group.prefix);
          }
          return rerun.length > 0
            ? await io.resume(unfinished.dir, rerun)
            : await io.resume(unfinished.dir);
        }
      }
    }

    const statePath = path.join(deps.paths.globalRoot, 'bench', 'menu-last.json');
    const last = await readLast(statePath);
    let choices: BenchMenuChoices | undefined;
    if (last) {
      out();
      out(`  ${color.dim('Last time:')} ${describe(last)}`);
      const again = await ask(deps, `  ${color.amber('?')} Run that again? ${color.dim('[Y/n]')} `);
      if (isYes(again)) choices = last;
    }
    choices ??= await askChoices(deps, last);

    let languages: string[] | undefined;
    if (choices.suite === 'polyglot' || choices.suite === 'polyglot-40') {
      const dir = await ensurePolyglotDir(deps, choices.polyglotDir);
      if (!dir) return 1;
      choices = { ...choices, polyglotDir: dir };
      languages = await detectLanguages(choices.suite === 'polyglot-40');
      const missing = ALL_LANGUAGES.filter((l) => !languages?.includes(l));
      if (languages.length === 0) {
        deps.renderer.writeError(
          'No polyglot toolchain found (python, node, go, cargo, cmake, java).',
        );
        return 1;
      }
      if (missing.length > 0) {
        out(`  ${color.amber('!')} Skipping ${missing.join(', ')} — toolchain not found on PATH.`);
      }
    }

    const attempts = plannedAttempts(choices, languages?.length);
    out();
    out(`  ${color.bold('Plan')}  ${describe(choices)}`);
    out(
      `        ${color.dim(`${attempts} agent runs · roughly ${fmtDuration(estimateMs(choices.suite, attempts))} at concurrency ${suiteConcurrency(choices.suite)}`)}`,
    );
    out(
      `        ${color.dim('Each result prints as it lands · Ctrl-C stops cleanly and can be resumed later')}`,
    );
    const go = await ask(deps, `  ${color.amber('?')} Start? ${color.dim('[Y/n]')} `);
    if (!isYes(go)) return 0;
    await writeLast(statePath, choices);

    const finished: Array<{ title: string; report: BenchReport; outDir: string }> = [];
    let exit = 0;
    for (const planned of planRuns(choices)) {
      out();
      out(`  ${color.cyan('▶')} ${color.bold(planned.title)}`);
      const flags = { ...planned.flags };
      if (languages && languages.length < ALL_LANGUAGES.length)
        flags['languages'] = languages.join(',');
      const code = await io.run(flags, {
        harnessOverlay: planned.harnessOverlay,
        onFinished: (report, outDir) => finished.push({ title: planned.title, report, outDir }),
      });
      if (code !== 0) exit = code;
      // Stopped with Ctrl-C: the user wants out, not the next variant's run.
      if (code === 130) return code;
    }
    if (finished.length > 1) out(renderCombined(finished));
    return exit;
  } catch (err) {
    if (err instanceof MenuQuit) return 0;
    deps.renderer.writeError(toErrorMessage(err));
    return 1;
  }
}

async function askChoices(
  deps: SubcommandDeps,
  last: BenchMenuChoices | undefined,
): Promise<BenchMenuChoices> {
  const out = (line = '') => deps.renderer.write(`${line}\n`);

  const mode = await pickOne(
    deps,
    'What do you want to compare?',
    MODE_OPTIONS.map((o) => ({ value: o.mode, label: o.label, hint: o.hint })),
    last?.mode ?? 'models',
  );
  const suite = await pickOne(
    deps,
    'Which benchmark?',
    SUITE_OPTIONS.map((o) => ({
      value: o.suite,
      label: o.label,
      hint: `${o.tasks} tasks · ${o.hint}`,
    })),
    last?.suite ?? 'hard',
  );

  const models = await pickModels(deps, last?.models);

  let variants = [LEAN_DEFAULT_VARIANT];
  if (mode !== 'models') {
    out();
    out(`  ${color.amber('?')} System prompt variants ${color.dim('(several: 1,3)')}`);
    SYSTEM_PROMPT_VARIANT_OPTIONS.forEach((o, i) => {
      const tag = o.variant === LEAN_DEFAULT_VARIANT ? color.green(' recommended') : '';
      out(`    ${color.dim(`${i + 1}.`)} ${o.label.padEnd(9)} ${color.dim(o.hint)}${tag}`);
    });
    const preset = (last?.variants ?? ['quick', 'pro'])
      .map((v) => SYSTEM_PROMPT_VARIANT_OPTIONS.findIndex((o) => o.variant === v) + 1)
      .filter((n) => n > 0);
    const picked = await askIndexes(deps, SYSTEM_PROMPT_VARIANT_OPTIONS.length, preset);
    variants = picked.map((n) => SYSTEM_PROMPT_VARIANT_OPTIONS[n - 1]?.variant ?? 'quick');
  }

  const repeats = await pickOne(
    deps,
    'Attempts per task',
    [
      { value: 1, label: '1', hint: 'fastest — fine for a first look' },
      { value: 3, label: '3', hint: 'recommended before you share scores' },
      { value: 5, label: '5', hint: 'tightest numbers, 5× the time' },
    ],
    last?.repeats ?? 1,
  );

  return { mode, suite, models, variants, repeats, polyglotDir: last?.polyglotDir };
}

async function pickModels(
  deps: SubcommandDeps,
  lastModels: string[] | undefined,
): Promise<string[]> {
  const out = (line = '') => deps.renderer.write(`${line}\n`);
  const providers = (await buildPickableProviders(deps.modelsRegistry, deps.config)).filter(
    (p) => p.models.length > 0,
  );
  const favorites = new Set(deps.config.favoriteModels ?? []);
  const saved =
    deps.config.provider && deps.config.model ? `${deps.config.provider}/${deps.config.model}` : '';
  // Quick list: last picks, the saved model and favorites that resolve to a keyed provider.
  const quick = [...new Set([...(lastModels ?? []), saved, ...favorites])].filter((ref) => {
    const [pid, ...rest] = ref.split('/');
    return (
      rest.length > 0 && providers.some((p) => p.id === pid && p.models.includes(rest.join('/')))
    );
  });

  out();
  out(`  ${color.amber('?')} Models ${color.dim('(several: 1,2 — or type provider/model)')}`);
  for (const [i, ref] of quick.entries()) out(`    ${color.dim(`${i + 1}.`)} ${ref}`);
  const moreIndex = quick.length + 1;
  out(`    ${color.dim(`${moreIndex}.`)} ${color.dim('Browse all models by provider…')}`);
  while (true) {
    const raw = await ask(
      deps,
      `  ${color.amber('›')} ${quick.length > 0 ? color.dim(`[Enter = 1]`) : ''} `,
    );
    const answer = raw === '' && quick.length > 0 ? '1' : raw;
    if (answer.includes('/')) {
      const refs = answer.split(/[\s,]+/).filter((r) => r.includes('/'));
      if (refs.length > 0) return refs;
    }
    const picked = parseIndexList(answer, moreIndex);
    if (!picked) continue;
    const refs = picked.filter((n) => n <= quick.length).map((n) => quick[n - 1] as string);
    if (picked.includes(moreIndex)) refs.push(...(await browseModels(deps, providers)));
    if (refs.length > 0) return [...new Set(refs)];
  }
}

async function browseModels(
  deps: SubcommandDeps,
  providers: Awaited<ReturnType<typeof buildPickableProviders>>,
): Promise<string[]> {
  const out = (line = '') => deps.renderer.write(`${line}\n`);
  if (providers.length === 0) {
    deps.renderer.writeError('No provider with a saved key — run `wstack auth` first.');
    return [];
  }
  out();
  out(`  ${color.amber('?')} Provider ${color.dim('(several: 1,2)')}`);
  for (const [i, p] of providers.entries()) {
    out(
      `    ${color.dim(`${i + 1}.`)} ${p.id.padEnd(24)} ${color.dim(`${p.models.length} models`)}`,
    );
  }
  const pickedProviders = await askIndexes(deps, providers.length);
  const refs: string[] = [];
  for (const n of pickedProviders) {
    const provider = providers[n - 1];
    if (!provider) continue;
    out();
    out(`  ${color.amber('?')} ${provider.id} models ${color.dim('(several: 1,3)')}`);
    for (const [i, m] of provider.models.entries()) out(`    ${color.dim(`${i + 1}.`)} ${m}`);
    for (const k of await askIndexes(deps, provider.models.length)) {
      refs.push(`${provider.id}/${provider.models[k - 1]}`);
    }
  }
  return refs;
}

async function pickOne<T>(
  deps: SubcommandDeps,
  question: string,
  options: ReadonlyArray<{ value: T; label: string; hint: string }>,
  fallback: T,
): Promise<T> {
  const out = (line = '') => deps.renderer.write(`${line}\n`);
  out();
  out(`  ${color.amber('?')} ${question}`);
  const defaultIndex = Math.max(
    0,
    options.findIndex((o) => o.value === fallback),
  );
  options.forEach((o, i) => {
    const marker = i === defaultIndex ? color.cyan('●') : color.dim('○');
    out(`    ${color.dim(`${i + 1}.`)} ${marker} ${o.label.padEnd(15)} ${color.dim(o.hint)}`);
  });
  while (true) {
    const answer = await ask(
      deps,
      `  ${color.amber('›')} ${color.dim(`[Enter = ${defaultIndex + 1}]`)} `,
    );
    if (answer === '') return (options[defaultIndex] as { value: T }).value;
    const picked = parseIndexList(answer, options.length);
    if (picked?.length === 1) return (options[(picked[0] as number) - 1] as { value: T }).value;
  }
}

async function askIndexes(
  deps: SubcommandDeps,
  max: number,
  preset: number[] = [],
): Promise<number[]> {
  while (true) {
    const hint = preset.length > 0 ? color.dim(`[Enter = ${preset.join(',')}]`) : '';
    const answer = await ask(deps, `  ${color.amber('›')} ${hint} `);
    if (answer === '' && preset.length > 0) return preset;
    const picked = parseIndexList(answer, max);
    if (picked) return picked;
  }
}

async function ask(deps: SubcommandDeps, prompt: string): Promise<string> {
  // Ctrl-C / Ctrl-D quit like `q`. Through plain readLine they came back as
  // '' — Enter — so cancelling "Start? [Y/n]" started the run.
  const raw =
    typeof deps.reader.readLineCancelable === 'function'
      ? await deps.reader.readLineCancelable(prompt)
      : await deps.reader.readLine(prompt);
  if (raw === null) {
    deps.renderer.write('\n');
    throw new MenuQuit();
  }
  const answer = raw.trim();
  if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') throw new MenuQuit();
  // Case is kept: model ids (`MiniMax-M3.1-Flash`) and paths are case-sensitive.
  return answer;
}

/** Enter or y/yes. */
function isYes(answer: string): boolean {
  const a = answer.toLowerCase();
  return a === '' || a === 'y' || a === 'yes';
}

// ── polyglot dataset + toolchains ────────────────────────────────────────

const ALL_LANGUAGES = ['python', 'javascript', 'go', 'rust', 'cpp', 'java'] as const;
const POLYGLOT_REPO = 'https://github.com/Aider-AI/polyglot-benchmark';

async function ensurePolyglotDir(
  deps: SubcommandDeps,
  remembered: string | undefined,
): Promise<string | undefined> {
  const managed = path.join(deps.paths.globalRoot, 'bench-data', 'polyglot-benchmark');
  for (const candidate of [remembered, managed]) {
    if (candidate && existsSync(path.join(candidate, 'python', 'exercises'))) return candidate;
  }
  const answer = await ask(
    deps,
    `  ${color.amber('?')} The Aider polyglot exercises are not downloaded yet. Download them now (~30 MB, git clone)? ${color.dim('[Y/n, or paste a path]')} `,
  );
  if (!isYes(answer)) {
    if (existsSync(path.join(answer, 'python', 'exercises'))) return answer;
    deps.renderer.writeError(`Not a polyglot-benchmark checkout: ${answer}`);
    return undefined;
  }
  await fs.mkdir(path.dirname(managed), { recursive: true });
  deps.renderer.write(`  ${color.dim(`Cloning ${POLYGLOT_REPO} …`)}\n`);
  const ok = await succeeds('git', ['clone', '--depth', '1', POLYGLOT_REPO, managed], 300_000);
  if (!ok) {
    deps.renderer.writeError(
      'git clone failed — check git and your network, or clone it yourself.',
    );
    return undefined;
  }
  return managed;
}

/** Languages whose test toolchain answers on PATH. */
async function detectLanguages(subsetOnly: boolean): Promise<string[]> {
  const probes: Record<(typeof ALL_LANGUAGES)[number], [string, string[]]> = {
    python: ['python', ['-m', 'pytest', '--version']],
    javascript: ['npm', ['--version']],
    go: ['go', ['version']],
    rust: ['cargo', ['--version']],
    cpp: ['cmake', ['--version']],
    java: ['java', ['-version']],
  };
  // The pinned 40-task subset covers these four only.
  const wanted = subsetOnly ? (['python', 'javascript', 'go', 'rust'] as const) : ALL_LANGUAGES;
  const found = await Promise.all(
    wanted.map(async (lang) => ((await succeeds(...probes[lang], 20_000)) ? lang : undefined)),
  );
  return found.filter((l): l is (typeof ALL_LANGUAGES)[number] => l !== undefined);
}

function succeeds(command: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    // npm is a .cmd shim on Windows; keep quoting and env filtering canonical.
    const invocation =
      process.platform === 'win32'
        ? buildWin32CmdShimInvocation(command, args)
        : { command, args, windowsVerbatimArguments: false };
    execFile(
      invocation.command,
      invocation.args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: buildChildEnv(),
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      },
      (err) => resolve(!err),
    );
  });
}

// ── state + rendering ────────────────────────────────────────────────────

/**
 * The newest run directory under `outBase` that started with a run.json and
 * has not recorded every planned run. Only the newest resumable run counts:
 * an older one is stale, and offering it on every start would nag.
 */
export async function findUnfinishedRun(outBase: string): Promise<
  | {
      dir: string;
      completed: number;
      planned: number;
      label: string;
      allFailed: Array<{ prefix: string; rows: number }>;
    }
  | undefined
> {
  let names: string[];
  try {
    names = (await fs.readdir(outBase, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
  } catch {
    return undefined;
  }
  for (const name of names) {
    const dir = path.join(outBase, name);
    const manifest = await readRunManifest(dir);
    if (!manifest) continue;
    let report: BenchReport;
    try {
      report = await readRunDir(dir);
    } catch {
      return undefined;
    }
    const progress = runProgress(report);
    if (progress.completed >= progress.planned) return undefined;
    const label = `${manifest.suite} · ${manifest.cells.map((c) => c.label).join(', ')}`;
    return {
      dir,
      completed: progress.completed,
      planned: progress.planned,
      label,
      allFailed: allFailedGroups(report.results),
    };
  }
  return undefined;
}

/**
 * Task groups (`polyglot/java/`) with at least three recorded rows, every one
 * failed. That is what a harness fault looks like — a grader on a JRE failed
 * all Java rows while the agents reported green runs — so the resume prompt
 * offers to run them again instead of keeping them as measurements.
 */
export function allFailedGroups(
  rows: ReadonlyArray<{ taskId: string; grade: { passed: boolean } }>,
): Array<{ prefix: string; rows: number }> {
  const groups = new Map<string, { rows: number; passed: number }>();
  for (const row of rows) {
    const parts = row.taskId.split('/');
    if (parts.length < 3) continue;
    const prefix = `${parts.slice(0, -1).join('/')}/`;
    const group = groups.get(prefix) ?? { rows: 0, passed: 0 };
    group.rows++;
    if (row.grade.passed) group.passed++;
    groups.set(prefix, group);
  }
  return [...groups]
    .filter(([, g]) => g.rows >= 3 && g.passed === 0)
    .map(([prefix, g]) => ({ prefix, rows: g.rows }));
}

async function readLast(file: string): Promise<BenchMenuChoices | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<BenchMenuChoices>;
    if (!raw.mode || !raw.suite || !Array.isArray(raw.models) || raw.models.length === 0) {
      return undefined;
    }
    return {
      mode: raw.mode,
      suite: raw.suite,
      models: raw.models,
      variants: Array.isArray(raw.variants) && raw.variants.length > 0 ? raw.variants : ['quick'],
      repeats: typeof raw.repeats === 'number' && raw.repeats > 0 ? raw.repeats : 1,
      polyglotDir: raw.polyglotDir,
    };
  } catch {
    return undefined;
  }
}

async function writeLast(file: string, choices: BenchMenuChoices): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(choices, null, 2), 'utf8');
  } catch {
    // Remembering is a convenience; a read-only home must not stop the run.
  }
}

export function describe(c: BenchMenuChoices): string {
  const suite = SUITE_OPTIONS.find((o) => o.suite === c.suite)?.label ?? c.suite;
  const prompts = c.mode === 'models' ? LEAN_DEFAULT_VARIANT : c.variants.join(' vs ');
  return `${suite} · ${cellLabels(c.models).join(', ')} · ${prompts} prompt · ${c.repeats}× each`;
}

function renderCombined(
  runs: Array<{ title: string; report: BenchReport; outDir: string }>,
): string {
  const lines = [
    '',
    '## All runs',
    '',
    '| Prompt | Model | Pass@1 | tok/solve |',
    '|---|---|---:|---:|',
  ];
  for (const { title, report } of runs) {
    for (const cell of report.cells) {
      const solve = cell.tokensPerSolve === undefined ? '—' : fmtK(cell.tokensPerSolve);
      lines.push(
        `| ${title} | ${cell.cell.label} | ${(cell.passRate * 100).toFixed(1)}% | ${solve} |`,
      );
    }
  }
  lines.push('', ...runs.map((r) => `- ${r.title}: ${path.join(r.outDir, 'report.md')}`), '');
  return lines.join('\n');
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/** What `bench run` defaults to: the bundled suites run 2 at a time, polyglot 4. */
function suiteConcurrency(suite: MenuSuite): number {
  return suite === 'core' || suite === 'hard' ? 2 : 4;
}

/**
 * Wall-clock guess. Per-run times are measured: polyglot averaged ~120 s per
 * agent run with glm-5.3-flash (2026-10-28, 229 runs); the bundled suites
 * ~75 s.
 */
export function estimateMs(suite: MenuSuite, attempts: number): number {
  const perRun = suite === 'core' || suite === 'hard' ? 75_000 : 120_000;
  return (attempts * perRun) / suiteConcurrency(suite);
}

function fmtDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 90 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
}
