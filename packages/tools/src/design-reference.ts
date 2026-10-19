import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import {
  compareDesignDna,
  DESIGN_DNA_EXTRACTOR,
  DESIGN_INSPECT_EXTRACTOR,
  type DesignDna,
  type DesignDnaRaw,
  type DesignInspectRaw,
  type InspectRuntimeEvidence,
  type InspectSurface,
  inspectDesign,
  renderInspectMarkdown,
  designProjectDir,
  dnaToTokenOverrides,
  ensureDesignDir,
  renderDesignDnaMarkdown,
  renderDnaComparisonMarkdown,
  summarizeDesignDna,
} from '@wrongstack/core/design';
import { isNetworkLockedOff } from '@wrongstack/core/security';
import { ToolValidationError } from '@wrongstack/core/types';
import { atomicWrite } from '@wrongstack/core/utils';
import { managerFor, owner } from './browser/tools.js';

/**
 * `design {action:"extract"|"compare"}` — measure a rendered page's design DNA
 * and score an implementation against it.
 *
 * Extraction runs through the browser tools' own session manager, so the
 * network guard, private-origin allowlist and run-abort cleanup are the same
 * as `browser_open`; a localhost dev server needs `/browser allow <origin>`.
 * One isolated session per viewport (the viewport is fixed at creation), each
 * closed before the next opens. Results are files under
 * `.design/references/<slug>/` so a later turn — or another model — reads the
 * same numbers instead of re-describing a screenshot.
 */

/** Desktop, tablet, phone — tablet is where layouts most often break. */
export const DEFAULT_DNA_VIEWPORTS = [1440, 768, 390] as const;
const VIEWPORT_HEIGHT = 900;

export function referencesDir(projectRoot: string): string {
  return path.join(designProjectDir(projectRoot), 'references');
}

/** `https://www.stripe.com/pricing?x` → `stripe-com-pricing`. */
function referenceSlug(url: string): string {
  const u = new URL(url);
  const raw = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'reference'
  );
}

function assertHttpUrl(url: string | undefined): string {
  const value = url?.trim();
  let parsed: URL | undefined;
  try {
    parsed = value ? new URL(value) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!value || !parsed || !/^https?:$/.test(parsed.protocol)) {
    throw new ToolValidationError({
      message: 'design: "url" must be an absolute http(s) URL, e.g. "https://example.com".',
      field: 'url',
    });
  }
  return value;
}

function normalizeViewports(viewports: unknown): number[] {
  if (viewports === undefined) return [...DEFAULT_DNA_VIEWPORTS];
  const list = (Array.isArray(viewports) ? viewports : [viewports]).map(Number);
  if (
    list.length === 0 ||
    list.length > 4 ||
    list.some((w) => !Number.isInteger(w) || w < 320 || w > 3840)
  ) {
    throw new ToolValidationError({
      message:
        'design: "viewports" takes 1–4 integer widths between 320 and 3840, e.g. [1440, 390].',
      field: 'viewports',
    });
  }
  return [...new Set(list)].sort((a, b) => b - a);
}

/** Validate a slug the caller passed so it cannot walk out of `.design/references`. */
function assertSlug(slug: string, field: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new ToolValidationError({
      message: `design: "${slug}" is not a reference name — use the slug \`design {action:"extract"}\` printed (lowercase letters, digits, dashes).`,
      field,
    });
  }
  return slug;
}

interface Measured<T> {
  raws: T[];
  runtime: InspectRuntimeEvidence[];
  screenshots: Array<{ width: number; file: string }>;
}

/**
 * Run one in-page measurement script per viewport, each in its own isolated
 * session, and keep a first-screen screenshot plus the console/network
 * evidence the manager collected for that session.
 */
async function measure<T extends { v: 1 }>(
  ctx: Context,
  url: string,
  viewports: number[],
  outDir: string,
  signal: AbortSignal,
  script: string = DESIGN_DNA_EXTRACTOR,
): Promise<Measured<T>> {
  if (isNetworkLockedOff()) {
    throw new Error(
      'design: extract/compare/inspect open a browser, and outbound network is locked off in restricted mode. ' +
        'Measure outside restricted mode, or work from a supplied screenshot.',
    );
  }
  const manager = managerFor(ctx);
  const ownerId = owner(ctx);
  const out: Measured<T> = { raws: [], runtime: [], screenshots: [] };
  // Screenshots of someone else's site must never become tracked repo files.
  await ensureDesignDir(ctx.projectRoot);
  await fs.mkdir(outDir, { recursive: true });
  for (const width of viewports) {
    signal.throwIfAborted();
    const session = await manager.open(
      ownerId,
      {
        url,
        viewport: { width, height: VIEWPORT_HEIGHT },
        trace: false,
        conversationId: ctx.session?.id,
      },
      signal,
    );
    try {
      const raw = (await manager.evaluate(session.id, ownerId, script, signal)) as T;
      if (raw?.v !== 1) throw new Error(`design: the page at ${url} returned no measurement`);
      out.raws.push(raw);
      const evidence = await manager.snapshot(session.id, ownerId, signal);
      out.runtime.push({
        consoleErrors: evidence.console.filter((c) => c.level === 'error').map((c) => c.text),
        failedRequests: evidence.network
          .filter((n) => n.failed || (n.status !== undefined && n.status >= 400))
          .map((n) => `${n.status ?? 'failed'} ${n.url}`),
      });
      const shot = await manager.screenshot(session.id, ownerId, { fullPage: false }, signal);
      const file = path.join(outDir, `${width}.png`);
      await fs.copyFile(shot.path, file);
      out.screenshots.push({ width, file });
    } finally {
      await manager.close(session.id, ownerId).catch(() => undefined);
    }
  }
  return out;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

const rel = (projectRoot: string, file: string): string =>
  path.relative(projectRoot, file).replace(/\\/g, '/');

export async function extractReference(
  ctx: Context,
  input: { url?: string | undefined; name?: string | undefined; viewports?: unknown },
  signal: AbortSignal,
): Promise<{ slug: string; dna: DesignDna; output: string; path: string }> {
  const url = assertHttpUrl(input.url);
  const viewports = normalizeViewports(input.viewports);
  const slug = input.name ? assertSlug(input.name.trim(), 'name') : referenceSlug(url);
  const dir = path.join(referencesDir(ctx.projectRoot), slug);
  const { raws, screenshots } = await measure<DesignDnaRaw>(ctx, url, viewports, dir, signal);
  const dna = summarizeDesignDna(raws);
  await writeJson(path.join(dir, 'raw.json'), raws);
  await writeJson(path.join(dir, 'dna.json'), dna);
  const markdown = renderDesignDnaMarkdown(dna);
  await atomicWrite(path.join(dir, 'dna.md'), markdown);
  const overrides = dnaToTokenOverrides(dna);
  const output = [
    markdown.trimEnd(),
    '',
    `Saved: ${rel(ctx.projectRoot, dir)}/{dna.md,dna.json,raw.json} · screenshots ${screenshots
      .map((s) => rel(ctx.projectRoot, s.file))
      .join(
        ', ',
      )} — read the screenshots before naming patterns; numbers do not show imagery or tone.`,
    `Reference name for compare: "${slug}".`,
    '',
    'Carry the measured system into Design Studio (after pinning the closest kit with `design {action:"use"}`):',
    `design {action:"set", set:${JSON.stringify(overrides)}}`,
    'Learn the decisions, not the brand: do not copy logos, product imagery, copy or a licensed font you do not hold.',
  ].join('\n');
  return { slug, dna, output, path: rel(ctx.projectRoot, path.join(dir, 'dna.md')) };
}

async function loadDna(projectRoot: string, slug: string, field: string): Promise<DesignDna> {
  const file = path.join(referencesDir(projectRoot), assertSlug(slug, field), 'dna.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as DesignDna;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ToolValidationError({
        message: `design: no extracted reference "${slug}" (expected ${rel(projectRoot, file)}). Run \`design {action:"extract", url:"…"}\` first.`,
        field,
      });
    }
    throw err;
  }
}

export async function compareReference(
  ctx: Context,
  input: {
    reference?: string | undefined;
    url?: string | undefined;
    against?: string | undefined;
    viewports?: unknown;
  },
  signal: AbortSignal,
): Promise<{ output: string; overall: number; path: string }> {
  const refSlug = input.reference?.trim();
  if (!refSlug) {
    throw new ToolValidationError({
      message:
        'design: "compare" needs reference:"<slug from extract>" plus url:"<implementation>" or against:"<other slug>".',
      field: 'reference',
    });
  }
  const ref = await loadDna(ctx.projectRoot, refSlug, 'reference');
  let impl: DesignDna;
  let implLabel: string;
  if (input.against) {
    impl = await loadDna(ctx.projectRoot, input.against.trim(), 'against');
    implLabel = input.against.trim();
  } else {
    const url = assertHttpUrl(input.url);
    // Measure the implementation at the reference's own viewports unless told otherwise.
    const viewports =
      input.viewports === undefined ? ref.source.viewports : normalizeViewports(input.viewports);
    const dir = path.join(referencesDir(ctx.projectRoot), refSlug, 'implementation');
    const { raws } = await measure<DesignDnaRaw>(ctx, url, viewports, dir, signal);
    impl = summarizeDesignDna(raws);
    await writeJson(path.join(dir, 'dna.json'), impl);
    implLabel = url;
  }
  const cmp = compareDesignDna(ref, impl);
  const markdown = renderDnaComparisonMarkdown(cmp, refSlug, implLabel);
  const file = path.join(referencesDir(ctx.projectRoot), refSlug, 'fidelity.md');
  await atomicWrite(file, `${markdown}\n`);
  return { output: markdown, overall: cmp.overall, path: rel(ctx.projectRoot, file) };
}

/**
 * `design {action:"inspect"}` — reference-free rendered quality gate. FAIL
 * marks a defect, WARN a craft problem to fix or defend; the report lists
 * what the measurement cannot see so a clean result is not read as a review.
 */
export async function inspectPage(
  ctx: Context,
  input: { url?: string | undefined; viewports?: unknown; surface?: string | undefined },
  signal: AbortSignal,
): Promise<{ output: string; fails: number; warns: number; path: string }> {
  const url = assertHttpUrl(input.url);
  const viewports = normalizeViewports(input.viewports);
  if (input.surface !== undefined && input.surface !== 'page' && input.surface !== 'app') {
    throw new ToolValidationError({
      message: 'design: "surface" is "page" (marketing/content) or "app" (dense product screen).',
      field: 'surface',
    });
  }
  const surface: InspectSurface = input.surface ?? 'page';
  const dir = path.join(designProjectDir(ctx.projectRoot), 'inspect', referenceSlug(url));
  const { raws, runtime, screenshots } = await measure<DesignInspectRaw>(
    ctx,
    url,
    viewports,
    dir,
    signal,
    DESIGN_INSPECT_EXTRACTOR,
  );
  const report = inspectDesign(
    raws.map((raw, i) => ({ raw, runtime: runtime[i] })),
    surface,
  );
  const markdown = renderInspectMarkdown(report);
  await writeJson(path.join(dir, 'inspect.json'), report);
  await atomicWrite(path.join(dir, 'inspect.md'), markdown);
  const output = [
    markdown.trimEnd(),
    '',
    `Saved: ${rel(ctx.projectRoot, dir)}/inspect.{md,json} · screenshots ${screenshots
      .map((s) => rel(ctx.projectRoot, s.file))
      .join(', ')}`,
  ].join('\n');
  return {
    output,
    fails: report.fails,
    warns: report.warns,
    path: rel(ctx.projectRoot, path.join(dir, 'inspect.md')),
  };
}
