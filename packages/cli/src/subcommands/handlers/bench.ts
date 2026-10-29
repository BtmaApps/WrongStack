import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
  type BenchConfig,
  type BenchReport,
  type BenchSuite,
  type BenchTask,
  collectCellPredictions,
  compareReports,
  computeToolManifestHash,
  createCoreSuite,
  createHardSuite,
  createLocalManifestSuite,
  createPolyglotSuite,
  createSmokeSuite,
  createSwebenchSuite,
  type GradeResult,
  gradeLocalManifest,
  gradePolyglot,
  gradeSwebench,
  javaToolchainProblem,
  loadBenchConfig,
  loadSubsetIds,
  type ModelCell,
  mineTranscript,
  partitionRerunRows,
  readResultsJsonl,
  readRunDir,
  readRunManifest,
  renderComparisonMarkdown,
  renderMarkdownReport,
  reportHeaderLine,
  runBenchmark,
  type TaskResult,
  writeJsonArtifacts,
  writePredictionsJsonl,
  writeRunManifest,
} from '@wrongstack/bench';
import { color, toErrorMessage } from '@wrongstack/core/utils';
import { CLI_VERSION } from '../../version.js';
import type { SubcommandDeps, SubcommandHandler } from '../contracts.js';
import { benchExperimentCommand, readBenchReviewPolicy } from './bench-experiments.js';
import { runBenchMenu } from './bench-menu.js';
import { resolveBenchRunConfig } from './bench-run-config.js';

/**
 * `wstack bench` — run model-independent agentic benchmarks (bundled smoke,
 * local manifests, Aider polyglot, SWE-bench Verified) with deterministic
 * graders and a harness fingerprint.
 *
 *   wstack bench run     --suite <id> [--cell spec | --models config] [...]
 *   wstack bench mine    --transcript <session.jsonl> [--out <eval-dir>]
 *   wstack bench report  <dir>
 *   wstack bench compare <baseline-dir> <candidate-dir>
 *   wstack bench list    [--models <config>]
 */
export const benchCmd: SubcommandHandler = async (args, deps) => {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'review':
    case 'route':
    case 'experiment':
      return benchExperimentCommand(sub, rest, deps);
    case 'run':
      return benchRun(rest, deps);
    case 'report':
      return benchReport(rest, deps);
    case 'compare':
      return benchCompare(rest, deps);
    case 'list':
      return benchList(rest, deps);
    case 'mine':
      return benchMine(rest, deps);
    default:
      if (sub === undefined && isInteractive(deps)) {
        return runBenchMenu(deps, {
          run: (flags, preset) => benchRun([], { ...deps, flags }, preset),
          resume: (runDir, rerun) =>
            benchRun([], {
              ...deps,
              flags: { resume: runDir, ...(rerun ? { rerun: rerun.join(',') } : {}) },
            }),
        });
      }
      printUsage(deps);
      return sub === undefined ? 0 : 1;
  }
};

/** The menu needs a person at a real terminal; scripts keep the usage text. */
function isInteractive(deps: SubcommandDeps): boolean {
  if (deps.flags?.['no-interactive'] === true || deps.flags?.['no-menu'] === true) return false;
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function printUsage(deps: SubcommandDeps): void {
  deps.renderer.write(
    [
      color.bold('wstack bench') + ' — model-independent agentic benchmarks',
      '',
      '  (none)   At a terminal: step-by-step menu — pick models, prompts and a benchmark',
      '  run      Run a suite across a model matrix and write a report',
      '  compare  Diff two finished run directories (fingerprint-aware)',
      '  mine     Copy a real session transcript and draft trace-eval cases',
      '  report   Re-render report.md from a finished run directory',
      '  list     Show available suites and configured model cells',
      '  review   Review a transcript with advisory behavior/compaction evidence',
      '  route    Recommend models in shadow mode from a finished run and category policy',
      '  experiment Compare paired behavior/compaction runs on an identical corpus',
      '',
      color.dim('Examples:'),
      color.dim('  wstack bench run --cell anthropic/claude-sonnet-4-6,openai/gpt-5.4'),
      color.dim('  wstack bench run --suite smoke --cell zai-coding-plan/glm-5.3-flash'),
      color.dim(
        '  wstack bench run --suite polyglot --polyglot-dir ./polyglot --models bench.config.json --limit 5',
      ),
      color.dim('  wstack bench run --suite local --suite-dir ./evals --models bench.config.json'),
      color.dim('  wstack bench compare ./bench-results/<baseline> ./bench-results/<candidate>'),
      color.dim('  wstack bench mine --transcript ./session.jsonl --out ./evals'),
      color.dim('  wstack bench report ./bench-results/2026-06-14T10-00-00'),
      '',
    ].join('\n') + '\n',
  );
}

// Flags arrive already-parsed in `deps.flags` (the top-level CLI parser strips
// `--name value` pairs out of the positional args before the subcommand runs).
// `args` therefore holds only positionals (the `run`/`report`/`list` verb and,
// for `report`, the run directory).
function flagStr(deps: SubcommandDeps, name: string): string | undefined {
  const v = deps.flags?.[name];
  return typeof v === 'string' ? v : undefined;
}
function flagBool(deps: SubcommandDeps, name: string): boolean {
  const v = deps.flags?.[name];
  return v === true || v === 'true';
}

function positiveIntegerFlag(deps: SubcommandDeps, name: string): number | undefined {
  const raw = flagStr(deps, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return value;
}

/** Resolve the wstack CLI entry the runner spawns. */
async function resolveWstackEntry(): Promise<string> {
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('@wrongstack/cli/package.json');
    const entry = path.join(path.dirname(pkgPath), 'dist', 'index.js');
    await fs.access(entry);
    return entry;
  } catch {
    return process.argv[1] ?? '';
  }
}

/** What the interactive menu hands `bench run` beyond plain flags. */
export interface BenchRunPreset {
  /** Lean-profile overlay, as `--harness <file>` would load it. */
  harnessOverlay?: Record<string, unknown> | undefined;
  /** Called with the finished report and its directory. */
  onFinished?: ((report: BenchReport, outDir: string) => void) | undefined;
}

async function benchRun(
  args: string[],
  deps: SubcommandDeps,
  preset?: BenchRunPreset,
): Promise<number> {
  const resumeRaw = flagStr(deps, 'resume');
  const rerunRaw = flagStr(deps, 'rerun');
  if (!resumeRaw) {
    if (rerunRaw) {
      deps.renderer.writeError('--rerun only applies with --resume <run-dir>.');
      return 1;
    }
    return benchRunWith(args, deps, preset, undefined);
  }
  // Resume: replay the run's own flags into its own directory, and skip every
  // unit that already has a row. Only --concurrency may change — it is not
  // part of the fingerprint.
  const runDir = path.resolve(deps.cwd, resumeRaw);
  const manifest = await readRunManifest(runDir);
  if (!manifest) {
    deps.renderer.writeError(
      `${runDir} has no run.json — only runs started by this version can be resumed.`,
    );
    return 1;
  }
  const concurrency = flagStr(deps, 'concurrency');
  const flags = { ...manifest.flags, ...(concurrency ? { concurrency } : {}) };
  let priorResults = await readResultsJsonl(runDir);
  if (rerunRaw) {
    const prefixes = rerunRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { kept, dropped } = partitionRerunRows(priorResults, prefixes);
    if (dropped.length === 0) {
      deps.renderer.writeError(`--rerun ${rerunRaw} matches no recorded row in ${runDir}.`);
      return 1;
    }
    deps.renderer.writeInfo(
      `Running ${dropped.length} recorded row(s) again (task ids starting with ${prefixes.join(', ')}).`,
    );
    priorResults = kept;
  }
  return benchRunWith(
    args,
    { ...deps, flags },
    { ...preset, harnessOverlay: manifest.harnessOverlay },
    { runDir, priorResults, fingerprintHash: manifest.fingerprint.hash },
  );
}

/** A stopped run being finished in place. */
interface ResumeTarget {
  runDir: string;
  priorResults: TaskResult[];
  fingerprintHash: string;
}

async function benchRunWith(
  _args: string[],
  deps: SubcommandDeps,
  preset: BenchRunPreset | undefined,
  resume: ResumeTarget | undefined,
): Promise<number> {
  let reviewPolicy: Awaited<ReturnType<typeof readBenchReviewPolicy>> | undefined;
  try {
    if (flagStr(deps, 'review-policy'))
      reviewPolicy = await readBenchReviewPolicy(
        path.resolve(deps.cwd, flagStr(deps, 'review-policy')!),
      );
  } catch (error) {
    deps.renderer.writeError(toErrorMessage(error));
    return 1;
  }
  let harnessOverlay: Record<string, unknown> | undefined = preset?.harnessOverlay;
  const harnessPath = flagStr(deps, 'harness');
  if (harnessPath) {
    try {
      const raw: unknown = JSON.parse(
        (await fs.readFile(path.resolve(deps.cwd, harnessPath), 'utf8')).replace(/^﻿/, ''),
      );
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('--harness must point at a JSON object');
      }
      harnessOverlay = raw as Record<string, unknown>;
    } catch (error) {
      deps.renderer.writeError(`--harness: ${toErrorMessage(error)}`);
      return 1;
    }
    if (flagBool(deps, 'host-profile')) {
      deps.renderer.writeError(
        '--harness tunes the lean profile and cannot be combined with --host-profile',
      );
      return 1;
    }
  }
  const suiteId = flagStr(deps, 'suite') ?? 'core';
  let limit: number | undefined;
  let concurrency: number | undefined;
  let repeats: number | undefined;
  try {
    limit = positiveIntegerFlag(deps, 'limit');
    concurrency = positiveIntegerFlag(deps, 'concurrency');
    repeats = positiveIntegerFlag(deps, 'repeats');
  } catch (error) {
    deps.renderer.writeError(toErrorMessage(error));
    return 1;
  }
  const outBase = flagStr(deps, 'out') ?? 'bench-results';

  let config: BenchConfig;
  try {
    config = await resolveBenchRunConfig({
      suiteId,
      cwd: deps.cwd,
      flags: deps.flags,
      savedProvider: deps.config?.provider,
      savedModel: deps.config?.model,
    });
  } catch (err) {
    deps.renderer.writeError(toErrorMessage(err));
    return 1;
  }
  if (concurrency !== undefined) config.concurrency = concurrency;
  if (repeats !== undefined) config.repeats = repeats;

  // The output directory is computed up front: the SWE-bench grader writes
  // per-instance predictions under it during the run.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resume?.runDir ?? path.resolve(deps.cwd, outBase, stamp);
  const predictionsDir = path.join(outDir, 'predictions');

  // Build suite + grader.
  let suite: BenchSuite;
  let grade: (a: {
    workdir: string;
    task: BenchTask;
    cell: ModelCell;
    timeoutMs: number;
  }) => Promise<GradeResult>;
  let isSwebench = false;
  if (suiteId === 'core') {
    suite = createCoreSuite();
    grade = (a) => gradeLocalManifest(a);
  } else if (suiteId === 'hard') {
    suite = createHardSuite();
    grade = (a) => gradeLocalManifest(a);
  } else if (suiteId === 'smoke') {
    suite = createSmokeSuite();
    grade = (a) => gradeLocalManifest(a);
  } else if (suiteId === 'polyglot') {
    const polyglotDir = flagStr(deps, 'polyglot-dir');
    if (!polyglotDir) {
      deps.renderer.writeError('--polyglot-dir <path> is required for the polyglot suite.');
      return 1;
    }
    const languagesRaw = flagStr(deps, 'languages');
    const languages = languagesRaw
      ? languagesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    let ids: string[] | undefined;
    const subsetArg = flagStr(deps, 'subset');
    if (subsetArg) {
      try {
        ids = await loadSubsetIds(subsetArg, deps.cwd);
      } catch (error) {
        deps.renderer.writeError(toErrorMessage(error));
        return 1;
      }
    }
    const runsJava =
      (languages ? languages.includes('java') : true) &&
      (!ids || ids.some((id) => id.startsWith('polyglot/java/')));
    const javaProblem = runsJava ? javaToolchainProblem() : undefined;
    if (javaProblem) {
      deps.renderer.writeError(
        `Java tasks cannot be graded: ${javaProblem} Fix it, or leave java out of --languages.`,
      );
      return 1;
    }
    suite = createPolyglotSuite({
      polyglotDir: path.resolve(deps.cwd, polyglotDir),
      languages,
      ids,
    });
    grade = (a) => gradePolyglot(a);
  } else if (suiteId === 'swebench') {
    isSwebench = true;
    const datasetDir = flagStr(deps, 'dataset-dir');
    const docker = flagBool(deps, 'docker');
    suite = createSwebenchSuite({
      datasetDir: datasetDir ? path.resolve(deps.cwd, datasetDir) : undefined,
      docker,
    });
    // Inline Docker grading is not bundled (the official harness owns it); we
    // export conformant predictions. Pass an `externalGrade` here to grade live.
    grade = (a) => gradeSwebench({ ...a, predictionsDir });
  } else if (suiteId === 'local' || suiteId === 'manifest') {
    const suiteDirRaw = flagStr(deps, 'suite-dir');
    const manifestRaw = flagStr(deps, 'manifest');
    if (!suiteDirRaw && !manifestRaw) {
      deps.renderer.writeError(
        '--suite-dir <path> or --manifest <file> is required for the local suite.',
      );
      return 1;
    }
    const manifestFile = manifestRaw ? path.resolve(deps.cwd, manifestRaw) : undefined;
    const suiteDir = suiteDirRaw
      ? path.resolve(deps.cwd, suiteDirRaw)
      : path.dirname(manifestFile!);
    suite = createLocalManifestSuite({ suiteDir, manifestFile });
    grade = (a) => gradeLocalManifest(a);
  } else {
    deps.renderer.writeError(
      `unknown suite "${suiteId}" (expected: core | smoke | local | polyglot | swebench)`,
    );
    return 1;
  }

  const tools = deps.toolRegistry?.list() ?? [];
  const toolNames = tools.map((t) => t.name);
  const toolManifestHash = computeToolManifestHash(tools);
  const wstackEntry = await resolveWstackEntry();

  deps.renderer.writeInfo(`Running ${suiteId} across ${config.cells.length} model(s)…`);

  // A full matrix can run for hours. Stream every row to disk as it lands so a
  // crash, a Ctrl-C, or a dead battery leaves partial results behind instead of
  // nothing; `writeJsonArtifacts` rewrites the same file at the end.
  await fs.mkdir(outDir, { recursive: true });
  const partialPath = path.join(outDir, 'results.jsonl');
  // A resumed run keeps its rows; rewriting them drops a line a hard kill cut short.
  const kept = resume?.priorResults ?? [];
  await fs.writeFile(partialPath, kept.map((row) => `${JSON.stringify(row)}\n`).join(''), 'utf8');

  // First Ctrl-C stops cleanly: nothing new starts, in-flight runs are killed
  // and dropped, and the finished rows are reported and can be resumed. A
  // second Ctrl-C quits at once.
  const stop = new AbortController();
  const onSigint = () => {
    if (stop.signal.aborted) process.exit(130);
    deps.renderer.write(
      `\n${color.amber('■')} Stopping — runs in progress are dropped, finished ones are kept. ` +
        `${color.dim('Ctrl-C again to quit now.')}\n`,
    );
    stop.abort();
  };
  process.on('SIGINT', onSigint);
  const runFlags = Object.fromEntries(
    Object.entries(deps.flags ?? {}).filter(
      (entry): entry is [string, string | boolean] =>
        entry[0] !== 'resume' && (typeof entry[1] === 'string' || typeof entry[1] === 'boolean'),
    ),
  );

  let report: BenchReport;
  try {
    report = await runBenchmark({
      signal: stop.signal,
      priorResults: resume?.priorResults,
      onStart: async ({ fingerprint, planned }) => {
        if (resume) {
          // Rows from another harness would mix two measurements in one score.
          if (fingerprint.hash !== resume.fingerprintHash) {
            throw new Error(
              `the harness changed since this run started (fingerprint ${resume.fingerprintHash} → ${fingerprint.hash}: ` +
                'a rebuild, a version or a config change). Start a new run instead.',
            );
          }
          return;
        }
        await writeRunManifest(outDir, {
          suite: suite.id,
          startedAt: new Date().toISOString(),
          fingerprint,
          cells: config.cells,
          planned,
          flags: runFlags,
          ...(harnessOverlay ? { harnessOverlay } : {}),
        });
      },
      suite,
      grade,
      config,
      reviewPolicy,
      cliVersion: CLI_VERSION,
      toolNames,
      toolManifestHash,
      nodeBin: process.execPath,
      wstackEntry,
      limit,
      hostHomeDir: deps.paths?.globalRoot,
      keepSandbox: flagBool(deps, 'keep-sandbox'),
      profile: flagBool(deps, 'host-profile') ? 'host' : 'lean',
      harnessOverlay,
      onProgress: (msg) => deps.renderer.write(color.dim(msg) + '\n'),
      onResult: (result) => fs.appendFile(partialPath, JSON.stringify(result) + '\n', 'utf8'),
    });
  } catch (err) {
    deps.renderer.writeError(toErrorMessage(err));
    return 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }

  await writeJsonArtifacts(outDir, report);
  const md = renderMarkdownReport(report);
  await fs.writeFile(path.join(outDir, 'report.md'), md, 'utf8');

  deps.renderer.write('\n' + md + '\n');

  // SWE-bench: merge the per-instance prediction files into one conformant
  // predictions.jsonl per cell, ready for the official harness.
  if (isSwebench) {
    for (const cell of config.cells) {
      const preds = await collectCellPredictions(predictionsDir, cell.label);
      if (preds.length === 0) continue;
      const file = await writePredictionsJsonl(outDir, cell.label, preds);
      deps.renderer.writeInfo(`Predictions for "${cell.label}" → ${file}`);
    }
    deps.renderer.writeInfo(
      'Grade with the official SWE-bench harness: ' +
        'python -m swebench.harness.run_evaluation --predictions_path <file> --run_id <id>',
    );
  }

  deps.renderer.writeInfo(`Report written to ${path.join(outDir, 'report.md')}`);
  const progress = report.progress;
  if (progress && progress.completed < progress.planned) {
    deps.renderer.writeInfo(
      `${progress.completed}/${progress.planned} runs recorded. Finish the rest with: ` +
        `wstack bench run --resume ${path.relative(deps.cwd, outDir) || outDir}` +
        `${color.dim('  (or run `wstack bench` and accept the resume prompt)')}`,
    );
    return progress.interrupted ? 130 : 1;
  }
  preset?.onFinished?.(report, outDir);

  // Every single attempt crashed before producing a result — a bad model id,
  // missing credentials, or a broken CLI entry, not a model outcome. Returning
  // 0 here let CI publish a 0%-pass leaderboard as if it were a measurement.
  const spawned = report.results.filter((row) => row.run.status !== 'crashed').length;
  if (report.results.length > 0 && spawned === 0) {
    deps.renderer.writeError(
      'Every run crashed before producing a result — check the provider/model ids and credentials. ' +
        'See the Failures section of the report.',
    );
    return 1;
  }
  return 0;
}

async function benchReport(args: string[], deps: SubcommandDeps): Promise<number> {
  const dir = args.find((a) => !a.startsWith('-'));
  if (!dir) {
    deps.renderer.writeError('Usage: wstack bench report <run-directory>');
    return 1;
  }
  const outDir = path.resolve(deps.cwd, dir);
  let report: BenchReport;
  try {
    report = await readRunDir(outDir);
  } catch (err) {
    deps.renderer.writeError(`cannot read run artifacts in ${outDir}: ${toErrorMessage(err)}`);
    return 1;
  }
  const md = renderMarkdownReport(report);
  await fs.writeFile(path.join(outDir, 'report.md'), md, 'utf8');
  deps.renderer.write('\n' + md + '\n');
  return 0;
}

async function benchCompare(args: string[], deps: SubcommandDeps): Promise<number> {
  const dirs = args.filter((a) => !a.startsWith('-'));
  const baselineRaw = dirs[0];
  const candidateRaw = dirs[1];
  if (!baselineRaw || !candidateRaw) {
    deps.renderer.writeError('Usage: wstack bench compare <baseline-dir> <candidate-dir>');
    return 1;
  }
  const baselineDir = path.resolve(deps.cwd, baselineRaw);
  const candidateDir = path.resolve(deps.cwd, candidateRaw);
  let comparisonMd: string;
  try {
    const baseline = await readRunDir(baselineDir);
    const candidate = await readRunDir(candidateDir);
    const comparison = compareReports(baseline, candidate);
    comparisonMd = renderComparisonMarkdown(comparison);
  } catch (err) {
    deps.renderer.writeError(`cannot compare runs: ${toErrorMessage(err)}`);
    return 1;
  }
  const outRaw = flagStr(deps, 'out');
  const outFile = outRaw ? path.resolve(deps.cwd, outRaw) : path.join(candidateDir, 'compare.md');
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, comparisonMd, 'utf8');
  deps.renderer.write('\n' + comparisonMd + '\n');
  deps.renderer.writeInfo(`Comparison written to ${outFile}`);
  return 0;
}

async function benchMine(args: string[], deps: SubcommandDeps): Promise<number> {
  const transcriptRaw = flagStr(deps, 'transcript') ?? args.find((arg) => !arg.startsWith('-'));
  if (!transcriptRaw) {
    deps.renderer.writeError(
      'Usage: wstack bench mine --transcript <session.jsonl> [--out <eval-dir>]',
    );
    return 1;
  }
  const outRaw = flagStr(deps, 'out') ?? 'evals';
  try {
    const mined = await mineTranscript({
      transcriptPath: path.resolve(deps.cwd, transcriptRaw),
      outDir: path.resolve(deps.cwd, outRaw),
    });
    deps.renderer.writeInfo(
      `Mined ${mined.candidates.length} edit attempt(s) from ${mined.sessionId}.`,
    );
    deps.renderer.writeInfo(`Pinned transcript → ${mined.copiedTranscriptPath}`);
    deps.renderer.writeInfo(`Curator drafts → ${mined.draftsPath}`);
    deps.renderer.writeInfo(
      'Add a frozen pre-edit fixture and deterministic grader before copying a draft into bench.local.json.',
    );
    return 0;
  } catch (err) {
    deps.renderer.writeError(toErrorMessage(err));
    return 1;
  }
}

async function benchList(_args: string[], deps: SubcommandDeps): Promise<number> {
  deps.renderer.write(color.bold('Suites\n'));
  deps.renderer.write(
    '  core      ' +
      color.dim('Bundled 6-task agent-edit eval (hidden tests) — default for `bench run`\n'),
  );
  deps.renderer.write(
    '  hard      ' +
      color.dim('Bundled 8-task discriminating eval (spec traps, hidden bugs, refactor)\n'),
  );
  deps.renderer.write(
    '  smoke     ' + color.dim('3 trivial file edits — harness wiring only, not a quality score\n'),
  );
  deps.renderer.write(
    '  local     ' + color.dim('Project-defined manifest tasks with command/file graders\n'),
  );
  deps.renderer.write(
    '  polyglot  ' +
      color.dim('Aider polyglot (edit accuracy) — Docker-free, needs --polyglot-dir\n'),
  );
  deps.renderer.write(
    '  swebench  ' + color.dim('SWE-bench Verified (end-to-end) — Docker-gated\n'),
  );

  const modelsPath = flagStr(deps, 'models');
  if (modelsPath) {
    try {
      const config = await loadBenchConfig(path.resolve(deps.cwd, modelsPath));
      deps.renderer.write('\n' + color.bold('Model cells\n'));
      for (const cell of config.cells) {
        deps.renderer.write(
          `  ${cell.label.padEnd(16)} ${color.dim(`${cell.provider}/${cell.model}`)}\n`,
        );
      }
      const tools = deps.toolRegistry?.list() ?? [];
      const fp = reportHeaderLine({
        cliVersion: CLI_VERSION,
        toolNames: tools.map((t) => t.name),
        maxIterations: config.maxIterations,
        yolo: true,
        subsetId: '(computed at run time)',
        toolManifestHash: computeToolManifestHash(tools),
        hash: '(computed at run time)',
      });
      deps.renderer.write('\n' + color.dim(`Harness: ${fp}`) + '\n');
    } catch (err) {
      deps.renderer.writeError(toErrorMessage(err));
      return 1;
    }
  }
  return 0;
}
