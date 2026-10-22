#!/usr/bin/env bun
/**
 * Design evaluation — does the design layer change what models build?
 *
 *   generate  each run (provider/model command) × condition × brief writes
 *             <out>/<run>/<condition>/<brief>/index.html. Conditions: `layer`
 *             (Design Studio on) and `bare` (WRONGSTACK_DESIGN_STUDIO=off and
 *             the design and skill tools disallowed, so no design skill reaches
 *             the model). Sequential: each job is one paid model session. Job
 *             logs go to <out>/.logs, outside the job directory: a log in the
 *             working directory is context the agent reads back.
 *   score     serves every page and measures it with the same scripts the
 *             agent uses: `design_reference inspect` (FAIL/WARN at 1440/768/390)
 *             and `extract` (design DNA). Per run × condition: pages produced,
 *             pages with 0 FAIL, mean FAIL/WARN, and diversity — the mean
 *             pairwise DNA distance between its pages for different briefs
 *             (low = every brief got the same look). Writes results.json and
 *             report.md. No judge model; every number is a measurement.
 *   ratchet   compares results.json with a committed baseline and exits 1 when
 *             a layer arm got worse (fewer clean pages, more FAILs, or
 *             diversity down by more than 0.05). --write records the baseline.
 *
 * Usage:
 *   bun scripts/design-eval/run.ts generate --runs <runs.json> [--out <dir>] [--only <brief,…>] [--timeout-min <n>] [--retries <n>]
 *   bun scripts/design-eval/run.ts score [--out <dir>]
 *   bun scripts/design-eval/run.ts ratchet [--out <dir>] [--baseline <file>] [--write]
 *
 * runs.json: [{ "label": "sonnet", "command": ["bun", "<repo>/packages/cli/dist/index.js",
 *   "--provider", "anthropic", "--model", "claude-sonnet-5-5", "--yolo"] }, …]
 * Optional "env" per run is merged into the job environment — point WRONGSTACK_HOME
 * at an evaluation profile that pins the model (fallbackAuto false, no fallback
 * chain) so a rate limit cannot swap the model mid-run.
 * The prompt is appended as the last argument; the job runs in the page directory.
 * Requires built packages (core, tools, cli) and the browser tools' Chromium.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REPO = path.resolve(HERE, '../..');
const CONDITIONS = ['layer', 'bare'] as const;
const DEFAULT_JOB_TIMEOUT_MIN = 15;
const DIVERSITY_SLACK = 0.05;

interface Brief {
  id: string;
  brief: string;
}
interface Run {
  label: string;
  command: string[];
  env?: Record<string, string> | undefined;
}
interface PageScore {
  run: string;
  condition: string;
  brief: string;
  produced: boolean;
  fails: number;
  warns: number;
  error?: string;
  dnaError?: string;
}
interface ArmScore {
  run: string;
  condition: string;
  pages: number;
  produced: number;
  clean: number;
  meanFails: number;
  meanWarns: number;
  diversity: number | null;
}

function usage(code: number): never {
  const text = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const block = /\* Usage:[\s\S]*?\* Requires[^\n]*/.exec(text)?.[0] ?? '';
  console.log(
    `Usage: bun scripts/design-eval/run.ts <generate|score|ratchet> [options]\n${block.replace(/^\s*\* ?/gm, '')}`,
  );
  process.exit(code);
}

/** Print a one-line error for the operator and exit. */
function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function loadBriefs(): { instructions: string; briefs: Brief[] } {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'briefs.json'), 'utf8'));
}

async function generate(args: string[], out: string): Promise<void> {
  const runsFile = flag(args, 'runs');
  if (!runsFile) usage(2);
  const runs = JSON.parse(fs.readFileSync(runsFile, 'utf8')) as Run[];
  // A job inside a repository works in that repository's context (its agent
  // instructions, conventions, history), which is not the clean brief the
  // evaluation measures.
  for (let dir = out; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      fail(
        `--out ${out} is inside the repository ${dir}; use a directory outside any repository.`,
        2,
      );
    }
    if (path.dirname(dir) === dir) break;
  }
  const { instructions, briefs } = loadBriefs();
  const only = flag(args, 'only')?.split(',');
  const timeoutMs = Number(flag(args, 'timeout-min') ?? DEFAULT_JOB_TIMEOUT_MIN) * 60_000;
  // A job that produced no page is retried: provider stalls and rate limits
  // are not the design layer's doing, and a MISS would score as one.
  const retries = Number(flag(args, 'retries') ?? 1);
  for (const run of runs) {
    for (const condition of CONDITIONS) {
      for (const b of briefs.filter((x) => !only || only.includes(x.id))) {
        const dir = path.join(out, run.label, condition, b.id);
        const logs = path.join(out, '.logs', run.label, condition, b.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.mkdirSync(logs, { recursive: true });
        if (fs.existsSync(path.join(dir, 'index.html'))) {
          console.log(`skip ${run.label}/${condition}/${b.id} (index.html exists)`);
          continue;
        }
        for (let attempt = 0; attempt <= retries; attempt++) {
          const command = [
            ...run.command,
            ...(condition === 'bare'
              ? ['--disallowed-tools', 'design,design_reference,skill']
              : []),
            `${b.brief}\n\n${instructions}`,
          ];
          const started = Date.now();
          const proc = Bun.spawn(command, {
            cwd: dir,
            env: {
              ...process.env,
              ...run.env,
              ...(condition === 'bare' ? { WRONGSTACK_DESIGN_STUDIO: 'off' } : {}),
            },
            stdout: Bun.file(path.join(logs, attempt ? `session.${attempt}.log` : 'session.log')),
            stderr: 'pipe',
            windowsHide: true,
          });
          const timer = setTimeout(() => proc.kill(), timeoutMs);
          const code = await proc.exited;
          clearTimeout(timer);
          fs.writeFileSync(
            path.join(logs, attempt ? `stderr.${attempt}.log` : 'stderr.log'),
            await new Response(proc.stderr).text(),
          );
          const ok = fs.existsSync(path.join(dir, 'index.html'));
          console.log(
            `${ok ? 'ok  ' : 'MISS'} ${run.label}/${condition}/${b.id}${attempt ? ` (retry ${attempt})` : ''} exit=${code} ${Math.round((Date.now() - started) / 1000)}s`,
          );
          if (ok) break;
        }
      }
    }
  }
}

async function score(out: string): Promise<void> {
  const { designReferenceTool, shutdownBrowserTools } = await import(
    pathToFileURL(path.join(REPO, 'packages/tools/dist/index.js')).href
  );
  const { compareDesignDna } = await import(
    pathToFileURL(path.join(REPO, 'packages/core/dist/design/index.js')).href
  );
  const pages: Array<{ run: string; condition: string; brief: string; file: string }> = [];
  for (const run of fs.existsSync(out) ? fs.readdirSync(out) : []) {
    if (run.startsWith('.')) continue;
    for (const condition of CONDITIONS) {
      const condDir = path.join(out, run, condition);
      if (!fs.existsSync(condDir)) continue;
      for (const brief of fs.readdirSync(condDir)) {
        pages.push({ run, condition, brief, file: path.join(condDir, brief, 'index.html') });
      }
    }
  }
  if (pages.length === 0) {
    fail(`No pages under ${out}. Run generate first.`, 2);
  }
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.resolve(out, rel.endsWith('/') || rel === '' ? `${rel}index.html` : rel);
      if (!file.startsWith(path.resolve(out)) || !fs.existsSync(file))
        return new Response('not found', { status: 404 });
      return new Response(Bun.file(file));
    },
  });
  const origin = `http://127.0.0.1:${server.port}`;
  process.env['WRONGSTACK_BROWSER_PRIVATE_ORIGINS'] = origin;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-eval-'));
  const ctx = {
    projectRoot: root,
    cwd: root,
    agentId: 'leader',
    signal: new AbortController().signal,
  };
  const results: PageScore[] = [];
  const dna = new Map<string, unknown>();
  try {
    for (const p of pages) {
      const row: PageScore = {
        run: p.run,
        condition: p.condition,
        brief: p.brief,
        produced: fs.existsSync(p.file),
        fails: 0,
        warns: 0,
      };
      if (row.produced) {
        const url = `${origin}/${p.run}/${p.condition}/${p.brief}/`;
        try {
          const ins = await designReferenceTool.execute({ action: 'inspect', url }, ctx, {});
          row.fails = ins.fails ?? 0;
          row.warns = ins.warns ?? 0;
        } catch (err) {
          row.error = err instanceof Error ? err.message.split('\n')[0] : String(err);
        }
        if (!row.error) {
          try {
            // Reference names are slugs; a run label like `glm-5.3` is not.
            const name = `${p.run}-${p.condition}-${p.brief}`
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-');
            const ex = await designReferenceTool.execute({ action: 'extract', url, name }, ctx, {});
            const slug = ex.reference ?? name;
            dna.set(
              `${p.run}/${p.condition}/${p.brief}`,
              JSON.parse(
                fs.readFileSync(path.join(root, '.design', 'references', slug, 'dna.json'), 'utf8'),
              ),
            );
          } catch (err) {
            // The inspect counts still stand; only diversity skips this page.
            row.dnaError = err instanceof Error ? err.message.split('\n')[0] : String(err);
          }
        }
      }
      results.push(row);
      console.log(
        `${row.produced ? (row.error ? 'ERR ' : 'ok  ') : 'MISS'} ${p.run}/${p.condition}/${p.brief} FAIL ${row.fails} WARN ${row.warns}${row.error ? ` ${row.error}` : ''}${row.dnaError ? ` (no DNA: ${row.dnaError})` : ''}`,
      );
    }
  } finally {
    await shutdownBrowserTools?.();
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const arms: ArmScore[] = [];
  const keys = [...new Set(results.map((r) => `${r.run}\u0000${r.condition}`))];
  for (const key of keys) {
    const [run, condition] = key.split('\u0000') as [string, string];
    const rows = results.filter((r) => r.run === run && r.condition === condition);
    const measured = rows.filter((r) => r.produced && !r.error);
    const prints = rows.map((r) => dna.get(`${run}/${condition}/${r.brief}`)).filter(Boolean);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < prints.length; i++) {
      for (let j = i + 1; j < prints.length; j++) {
        // compare is reference-relative; average both directions. The mean axis
        // score, not `overall` (the weakest axis): one shared radius should not
        // make two otherwise different pages read as identical, nor the reverse.
        const ab = meanAxis(compareDesignDna(prints[i], prints[j]));
        const ba = meanAxis(compareDesignDna(prints[j], prints[i]));
        sum += 1 - (ab + ba) / 2;
        n++;
      }
    }
    const mean = (f: (r: PageScore) => number) =>
      measured.length ? measured.reduce((s, r) => s + f(r), 0) / measured.length : 0;
    arms.push({
      run,
      condition,
      pages: rows.length,
      produced: rows.filter((r) => r.produced).length,
      clean: measured.filter((r) => r.fails === 0).length,
      meanFails: round(mean((r) => r.fails)),
      meanWarns: round(mean((r) => r.warns)),
      diversity: n ? round(sum / n) : null,
    });
  }
  const measuredAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(out, 'results.json'),
    `${JSON.stringify({ measuredAt, arms, pages: results }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(out, 'report.md'), renderReport(arms, measuredAt));
  console.log(`\n${renderReport(arms, measuredAt)}`);
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function meanAxis(cmp: { axes: Record<string, number | undefined> }): number {
  const scores = Object.values(cmp.axes).filter((v): v is number => typeof v === 'number');
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
}

function renderReport(arms: ArmScore[], measuredAt: string): string {
  const lines = [
    `# Design evaluation (${measuredAt})`,
    '',
    'Measured by design_reference inspect (FAIL/WARN, 1440/768/390) and extract (DNA). Diversity = mean pairwise DNA distance across briefs within an arm (0 = identical look for every brief).',
    '',
    '| run | condition | produced | 0 FAIL | mean FAIL | mean WARN | diversity |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...arms.map(
      (a) =>
        `| ${a.run} | ${a.condition} | ${a.produced}/${a.pages} | ${a.clean} | ${a.meanFails} | ${a.meanWarns} | ${a.diversity ?? '—'} |`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function ratchet(args: string[], out: string): void {
  const baselineFile = flag(args, 'baseline') ?? path.join(HERE, 'baseline.json');
  const current = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8')) as {
    arms: ArmScore[];
  };
  if (args.includes('--write')) {
    fs.writeFileSync(baselineFile, `${JSON.stringify({ arms: current.arms }, null, 2)}\n`);
    console.log(`Baseline written: ${baselineFile}`);
    return;
  }
  if (!fs.existsSync(baselineFile)) {
    fail(`No baseline at ${baselineFile}. Record one with: ratchet --write`, 2);
  }
  const base = JSON.parse(fs.readFileSync(baselineFile, 'utf8')) as { arms: ArmScore[] };
  const problems: string[] = [];
  for (const b of base.arms.filter((a) => a.condition === 'layer')) {
    const c = current.arms.find((a) => a.run === b.run && a.condition === b.condition);
    if (!c) {
      problems.push(`${b.run}/layer: missing from results`);
      continue;
    }
    if (c.clean < b.clean)
      problems.push(`${b.run}/layer: pages with 0 FAIL ${b.clean} → ${c.clean}`);
    if (c.meanFails > b.meanFails)
      problems.push(`${b.run}/layer: mean FAIL ${b.meanFails} → ${c.meanFails}`);
    if (b.diversity !== null && c.diversity !== null && c.diversity < b.diversity - DIVERSITY_SLACK)
      problems.push(`${b.run}/layer: diversity ${b.diversity} → ${c.diversity}`);
  }
  if (problems.length) {
    fail(`Design evaluation regressed:\n  ${problems.join('\n  ')}`, 1);
  }
  console.log('Design evaluation: no regression against the baseline.');
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') usage(command ? 0 : 2);
const out = path.resolve(flag(rest, 'out') ?? path.join(os.tmpdir(), 'wrongstack-design-eval'));
if (command === 'generate') await generate(rest, out);
else if (command === 'score') await score(out);
else if (command === 'ratchet') ratchet(rest, out);
else usage(2);
