/**
 * TechStack — Native audit command wrappers.
 *
 * Spawns ecosystem-native audit tools (npm audit, pip-audit, cargo-audit,
 * govulncheck, composer audit, dotnet package audit) and parses their
 * output into the TechStack advisory model.
 *
 * @see docs/specs/techstack-sdd.md §6, §7
 */

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { EcosystemId, Evidence } from '../types.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface NativeAdvisory {
  readonly id: string;
  readonly packageName: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly summary: string;
  readonly fixVersion?: string | undefined;
  readonly url?: string | undefined;
  readonly aliases: readonly string[];
}

export interface NativeAuditResult {
  readonly advisories: readonly NativeAdvisory[];
  readonly evidence: Evidence;
}

// ── Parse helpers ──────────────────────────────────────────────────────────

/** Map npm audit severity strings */
function npmSeverity(s: string): NativeAdvisory['severity'] {
  switch (s.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

/** Map cargo-audit severity strings */
function cargoSeverity(s: string): NativeAdvisory['severity'] {
  switch (s.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

// ── npm audit ──────────────────────────────────────────────────────────────

/**
 * Run npm audit in the given workspace directory and parse JSON output.
 */
/** npm answered with its own `{error}` object instead of an audit report. */
class NpmAuditFailure extends Error {}

export async function runNpmAudit(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  const result = await runner('npm', ['audit', '--json'], workspaceRoot);
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.status === 1) {
    // npm audit exits 0 if no vulns, 1 if vulns found, 2 if error
    try {
      const json = JSON.parse(result.stdout || '{}');
      // npm reports its own failure (ENOLOCK in a yarn/pnpm/bun project, a
      // registry error) as exit 1 + `{error}` — the same status as "found
      // vulnerabilities". Parsed as a report, it read as a clean audit.
      const failure = json.error as { code?: unknown; summary?: unknown } | undefined;
      if (failure && typeof failure === 'object') {
        throw new NpmAuditFailure(
          `npm audit failed (${String(failure.code ?? 'error')}): ${String(failure.summary ?? '')}`,
        );
      }
      const vulnerabilities = json.vulnerabilities as
        | Record<string, Record<string, unknown>>
        | undefined;

      if (vulnerabilities) {
        for (const [pkg, info] of Object.entries(vulnerabilities)) {
          const via = info.via as Array<Record<string, unknown> | string> | undefined;
          if (!via) continue;

          for (const advisory of via) {
            if (typeof advisory === 'string') continue;
            const name = advisory.name as string | undefined;
            const title = advisory.title as string | undefined;
            const url = advisory.url as string | undefined;
            // Real npm via objects ARE the advisories: they reference their
            // registry entry with a NUMERIC `source` and carry name/title/url
            // (captured 2026-09-22). Only objects without any identifying
            // data are skipped; string entries are indirect references.
            if (typeof name !== 'string' && typeof title !== 'string') continue;
            // The advisory id (GHSA/CVE) only appears inside `url` in real
            // payloads — `cve`/`ghsa` fields never occur (captured shape).
            const cve = advisory.cve as string | undefined;
            const ghsaFromUrl =
              typeof url === 'string'
                ? /GHSA-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}/.exec(url)?.[0]
                : undefined;
            const rawFix = info.fixAvailable;
            const fixVersion =
              typeof rawFix === 'object' && rawFix !== null && 'version' in rawFix
                ? String((rawFix as { version: unknown }).version)
                : typeof rawFix === 'string' && rawFix !== ''
                  ? rawFix
                  : undefined;
            advisories.push({
              id: cve ?? ghsaFromUrl ?? `npm-${pkg}-${name ?? 'unknown'}`,
              packageName: pkg,
              severity: npmSeverity(
                (advisory.severity as string) ?? (info.severity as string) ?? 'info',
              ),
              summary: title ?? name ?? 'No summary',
              fixVersion,
              url,
              aliases: cve ? [cve] : [],
            });
          }
        }
      }

      const metadata = json.metadata as Record<string, unknown> | undefined;
      if (metadata) {
        // npm >= 7 nests both: `vulnerabilities: {critical: 1, …, total: 1}` and
        // `dependencies: {prod, dev, …, total}` (npm 6 had a bare count and
        // `totalDependencies`). Interpolated raw they read "[object Object]".
        const total = (value: unknown): string =>
          typeof value === 'number'
            ? String(value)
            : value &&
                typeof value === 'object' &&
                typeof (value as { total?: unknown }).total === 'number'
              ? String((value as { total: number }).total)
              : 'unknown';
        detailLines = [
          `Total vulnerabilities: ${total(metadata.vulnerabilities)}`,
          `Total dependencies: ${total(metadata.totalDependencies ?? metadata.dependencies)}`,
        ];
      }
    } catch (error) {
      detailLines = [
        error instanceof NpmAuditFailure ? error.message : 'Failed to parse npm audit JSON output',
      ];
    }
  } else {
    detailLines = [`npm audit exited with code ${result.status}`];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'npm audit --json',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── pip-audit ──────────────────────────────────────────────────────────────

/**
 * Run pip-audit in the given workspace directory.
 * pip-audit supports --requirement, --format json flags.
 */
export async function runPipAudit(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  // Try common requirements files
  const reqFiles = ['requirements.txt', 'requirements-dev.txt'];
  let reqFlag = '';
  for (const f of reqFiles) {
    try {
      await access(join(workspaceRoot, f));
      reqFlag = `--requirement ${f}`;
      break;
    } catch {
      // Try the next conventional requirements filename.
    }
  }

  const args = ['audit', '--format', 'json'];
  if (reqFlag) {
    args.push(...reqFlag.split(' '));
  }

  const result = await runner('pip-audit', args, workspaceRoot);
  return parsePipAuditOutput(result);
}

function parsePipAuditOutput(result: AuditCommandResult): NativeAuditResult {
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.stdout?.trim().startsWith('[')) {
    try {
      const json = JSON.parse(result.stdout || '[]') as Array<Record<string, unknown>>;
      for (const entry of json) {
        advisories.push({
          id: (entry.id as string) ?? (entry.vulnerability_id as string) ?? 'unknown',
          packageName: (entry.name as string) ?? '',
          severity: npmSeverity((entry.severity as string) ?? 'info'),
          summary:
            (entry.description as string) ?? (entry.vulnerability_id as string) ?? 'No summary',
          fixVersion: (entry.fix_version as string) ?? undefined,
          url: (entry.advisory_url as string) ?? undefined,
          aliases: (entry.aliases as string[]) ?? [],
        });
      }
    } catch {
      detailLines = ['Failed to parse pip-audit JSON output'];
    }
  } else {
    detailLines = [`pip-audit exited with code ${result.status}: ${result.stderr}`];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'pip-audit --format json',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── cargo-audit ────────────────────────────────────────────────────────────

/**
 * Run cargo-audit in the given workspace directory.
 */
export async function runCargoAudit(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  const result = await runner('cargo', ['audit', '--json'], workspaceRoot);
  return parseCargoAuditOutput(result);
}

function parseCargoAuditOutput(result: AuditCommandResult): NativeAuditResult {
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.stdout?.trim().startsWith('{')) {
    try {
      const json = JSON.parse(result.stdout || '{}');
      const vulnerabilities = json.vulnerabilities as Record<string, unknown> | undefined;
      const advisoriesList = vulnerabilities?.list as Array<Record<string, unknown>> | undefined;

      if (advisoriesList) {
        for (const adv of advisoriesList) {
          const advisory = adv.advisory as Record<string, unknown> | undefined;
          const pkg = adv.package as Record<string, unknown> | undefined;
          if (!advisory) continue;

          advisories.push({
            id: (advisory.id as string) ?? 'unknown',
            packageName: (pkg?.name as string) ?? '',
            severity: cargoSeverity(((advisory.cvss as string) ?? '').split('/')?.[0] ?? 'info'),
            summary: (advisory.title as string) ?? (advisory.description as string) ?? 'No summary',
            fixVersion: (advisory.patched_versions as string) ?? undefined,
            url: (advisory.url as string) ?? undefined,
            aliases: (advisory.aliases as string[]) ?? [],
          });
        }
      }
    } catch {
      detailLines = ['Failed to parse cargo audit JSON output'];
    }
  } else {
    detailLines = [`cargo audit exited with code ${result.status}: ${result.stderr}`];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'cargo audit --json',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── govulncheck ────────────────────────────────────────────────────────────

/**
 * Run govulncheck in the given workspace directory.
 * Output is JSON with vulnerabilities in the format:
 * { vulns: [{ id, details, osv, ... }] }
 */
/** Split concatenated (pretty-printed) JSON objects into values. */
function parseJsonObjectStream(text: string): unknown[] {
  const values: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) values.push(JSON.parse(text.slice(start, i + 1)));
    }
  }
  if (depth !== 0) throw new Error('truncated JSON stream');
  return values;
}

export async function runGoVulncheck(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  // Without a package pattern govulncheck refuses to run ("no package patterns
  // provided", exit 2), so this audit never produced a result.
  const result = await runner('govulncheck', ['-json', './...'], workspaceRoot);
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.status === 3) {
    // govulncheck exits 3 when vulnerabilities found (text mode; -json exits 0)
    try {
      // `-json` is a STREAM of objects — {config}, {SBOM}, {progress}, {osv},
      // {finding} — not one document: a single JSON.parse always failed.
      const messages = parseJsonObjectStream(result.stdout ?? '') as Array<{
        osv?: { id?: string; summary?: string; details?: string; aliases?: string[] };
        finding?: {
          osv?: string;
          fixed_version?: string;
          trace?: Array<{ module?: string; package?: string; function?: string }>;
        };
      }>;
      const osvById = new Map(
        messages.flatMap((m) => (m.osv?.id ? [[m.osv.id, m.osv] as const] : [])),
      );
      const seen = new Set<string>();
      for (const { finding } of messages) {
        // Only findings whose trace reaches a function are ones the code
        // calls — govulncheck's own "affected" verdict; module-level findings
        // are informational.
        const frame = finding?.trace?.[0];
        if (!finding?.osv || !frame?.function || seen.has(finding.osv)) continue;
        seen.add(finding.osv);
        const osv = osvById.get(finding.osv);
        advisories.push({
          id: finding.osv,
          packageName: frame.module ?? frame.package ?? '',
          severity: 'high', // govulncheck doesn't provide CVSS — default to high
          summary: osv?.summary ?? osv?.details ?? finding.osv,
          fixVersion: finding.fixed_version,
          url: `https://pkg.go.dev/vuln/${finding.osv}`,
          aliases: osv?.aliases ?? [],
        });
      }
    } catch {
      detailLines = ['Failed to parse govulncheck JSON output'];
    }
  } else {
    // Exit 1 is an error (bad pattern, load failure) — it used to read as
    // "no vulnerabilities found", a clean verdict from a scan that never ran.
    detailLines = [`govulncheck exited with code ${result.status}: ${result.stderr}`];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'govulncheck -json ./...',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── composer audit ─────────────────────────────────────────────────────────

/**
 * Run composer audit in the given workspace directory.
 */
export async function runComposerAudit(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  // `--locked`: audit composer.lock, not vendor/. Plain `composer audit` reads
  // the INSTALLED packages; with only a lock file it prints "No packages -
  // skipping audit." on stderr, exits 0 with empty stdout, and that read as a
  // clean audit.
  const result = await runner(
    'composer',
    ['audit', '--locked', '--format=json', '--no-interaction'],
    workspaceRoot,
  );
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.stdout?.trim().startsWith('{')) {
    try {
      const json = JSON.parse(result.stdout || '{}');
      const advisoriesJson = json.advisories as
        | Record<string, Array<Record<string, unknown>>>
        | undefined;

      if (advisoriesJson) {
        for (const [pkg, advs] of Object.entries(advisoriesJson)) {
          for (const adv of advs) {
            advisories.push({
              id: (adv.cve as string) ?? (adv.reference as string) ?? `composer-${pkg}`,
              packageName: pkg,
              severity: npmSeverity((adv.severity as string) ?? 'medium'),
              summary: (adv.title as string) ?? (adv.description as string) ?? 'No summary',
              // composer's report carries no fixed version: `link` is the
              // advisory URL, whose last segment (`GHSA-…`) is not a version.
              fixVersion: undefined,
              url: (adv.link as string) ?? undefined,
              aliases: (adv.cve as string) ? [adv.cve as string] : [],
            });
          }
        }
      }
    } catch {
      detailLines = ['Failed to parse composer audit JSON output'];
    }
  } else {
    detailLines = [`composer audit exited with code ${result.status}: ${result.stderr}`];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'composer audit --locked --format=json',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── dotnet package audit ───────────────────────────────────────────────────

/**
 * Run the .NET vulnerability report in the given workspace directory:
 * `dotnet list package --vulnerable --include-transitive --format json`.
 */
/** One package row of `dotnet list package --vulnerable --format json`. */
interface DotnetListedPackage {
  id?: string;
  resolvedVersion?: string;
  vulnerabilities?: Array<{ severity?: string; advisoryurl?: string }>;
}

export async function runDotnetAudit(
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  // The SDK has no `dotnet package audit` ("'audit' was not matched", exit 1),
  // so this audit never reported anything. The vulnerability report is
  // `dotnet list package --vulnerable` (JSON since SDK 7.0.200).
  const result = await runner(
    'dotnet',
    ['list', 'package', '--vulnerable', '--include-transitive', '--format', 'json'],
    workspaceRoot,
  );
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  if (result.status === 0 || result.stdout?.trim().startsWith('{')) {
    try {
      const json = JSON.parse(result.stdout || '{}');
      const vulnerabilities = json.vulnerabilities as Record<string, unknown> | undefined;
      const packages = json.packages as Record<string, Array<Record<string, unknown>>> | undefined;
      const projects = json.projects as
        | Array<{
            frameworks?: Array<{
              topLevelPackages?: DotnetListedPackage[];
              transitivePackages?: DotnetListedPackage[];
            }>;
          }>
        | undefined;

      if (Array.isArray(projects)) {
        // `dotnet list package --vulnerable --format json`: projects →
        // frameworks → top-level/transitive packages → vulnerabilities.
        const seen = new Set<string>();
        for (const framework of projects.flatMap((project) => project.frameworks ?? [])) {
          for (const pkg of [
            ...(framework.topLevelPackages ?? []),
            ...(framework.transitivePackages ?? []),
          ]) {
            for (const vuln of pkg.vulnerabilities ?? []) {
              const url = vuln.advisoryurl;
              const key = `${pkg.id}@${pkg.resolvedVersion}|${url}`;
              if (!pkg.id || seen.has(key)) continue;
              seen.add(key);
              const ghsa =
                typeof url === 'string'
                  ? /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(url)?.[0]
                  : undefined;
              advisories.push({
                id: ghsa ?? url ?? `nuget-${pkg.id}`,
                packageName: pkg.id,
                severity: npmSeverity(vuln.severity ?? 'info'),
                summary: `${pkg.id} ${pkg.resolvedVersion ?? ''} is vulnerable`.trim(),
                fixVersion: undefined,
                url,
                aliases: [],
              });
            }
          }
        }
      } else if (vulnerabilities) {
        // Flat shape: { vulnerabilities: [{ packageName, severity, advisoryUrl, ... }] }
        const vulnList = Array.isArray(vulnerabilities)
          ? (vulnerabilities as Array<Record<string, unknown>>)
          : [];
        for (const v of vulnList) {
          advisories.push({
            id: (v.advisoryId as string) ?? (v.id as string) ?? 'unknown',
            packageName: (v.packageName as string) ?? '',
            severity: npmSeverity((v.severity as string) ?? 'info'),
            summary: (v.description as string) ?? (v.title as string) ?? 'No summary',
            fixVersion: (v.fixedVersion as string) ?? (v.patchedVersion as string) ?? undefined,
            url: (v.advisoryUrl as string) ?? (v.url as string) ?? undefined,
            aliases: (v.aliases as string[]) ?? [],
          });
        }
      } else if (packages) {
        // Nested shape: { packages: { "pkgName": [{ severity, advisoryUrl, ... }] } }
        for (const [pkg, entries] of Object.entries(packages)) {
          for (const entry of entries) {
            advisories.push({
              id: (entry.advisoryId as string) ?? (entry.id as string) ?? 'unknown',
              packageName: pkg,
              severity: npmSeverity((entry.severity as string) ?? 'info'),
              summary: (entry.description as string) ?? (entry.title as string) ?? 'No summary',
              fixVersion:
                (entry.fixedVersion as string) ?? (entry.patchedVersion as string) ?? undefined,
              url: (entry.advisoryUrl as string) ?? (entry.url as string) ?? undefined,
              aliases: (entry.aliases as string[]) ?? [],
            });
          }
        }
      }
    } catch {
      detailLines = ['Failed to parse dotnet list package JSON output'];
    }
  } else {
    detailLines = [
      `dotnet list package --vulnerable exited with code ${result.status}: ${result.stderr}`,
    ];
  }

  const evidence: Evidence = {
    kind: 'audit',
    source: 'dotnet list package --vulnerable --include-transitive --format json',
    retrievedAt: new Date().toISOString(),
    detail: detailLines.join('\n') || `Found ${advisories.length} advisories`,
  };

  return { advisories, evidence };
}

// ── Common command runner ──────────────────────────────────────────────────

export interface AuditCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type AuditCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => AuditCommandResult | Promise<AuditCommandResult>;

const defaultAuditCommandRunner: AuditCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<AuditCommandResult> =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        // On Windows the audit tools are batch shims — `npm`/`composer` resolve
        // to npm.cmd/composer.cmd, which execFile cannot launch without a shell
        // (it ignores PATHEXT), so it fails ENOENT and every Windows audit
        // silently reports "exited with code null" with zero advisories. Route
        // through the shell there. Safe because every command and argument here
        // is a static literal (conventional filenames only) — no user input
        // reaches the command line; the dynamic workspace path is passed as cwd.
        shell: process.platform === 'win32',
      },
      (error, stdout, stderr) => {
        const exitCode = (error as (Error & { code?: string | number }) | null)?.code;
        const status = error ? (typeof exitCode === 'number' ? exitCode : null) : 0;
        resolve({
          status,
          stdout,
          stderr: stderr || (status === null && error ? error.message : ''),
        });
      },
    );
  });

// ── Ecosystem dispatch ─────────────────────────────────────────────────────

/**
 * Run the native audit command for the given ecosystem.
 * Returns advisories found by the native tool.
 */
export async function runNativeAudit(
  ecosystem: EcosystemId,
  workspaceRoot: string,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<NativeAuditResult> {
  switch (ecosystem) {
    case 'npm':
      return runNpmAudit(workspaceRoot, runner);
    case 'python':
      return runPipAudit(workspaceRoot, runner);
    case 'rust':
      return runCargoAudit(workspaceRoot, runner);
    case 'go':
      return runGoVulncheck(workspaceRoot, runner);
    case 'php':
      return runComposerAudit(workspaceRoot, runner);
    case 'dotnet':
      return runDotnetAudit(workspaceRoot, runner);
    // dart/pub doesn't have a standard audit command — use OSV instead
    default:
      return {
        advisories: [],
        evidence: {
          kind: 'audit',
          source: `native-audit:${ecosystem}`,
          retrievedAt: new Date().toISOString(),
          detail: `No native audit tool for ecosystem: ${ecosystem}`,
        },
      };
  }
}

// ── Availability check ─────────────────────────────────────────────────────

/**
 * Check if the native audit tool is available for the given ecosystem.
 */
export async function isNativeAuditAvailable(
  ecosystem: EcosystemId,
  runner: AuditCommandRunner = defaultAuditCommandRunner,
): Promise<boolean> {
  const result = await runner(
    ecosystem === 'npm'
      ? 'npm'
      : ecosystem === 'python'
        ? 'pip-audit'
        : ecosystem === 'rust'
          ? 'cargo'
          : ecosystem === 'go'
            ? 'govulncheck'
            : ecosystem === 'php'
              ? 'composer'
              : ecosystem === 'dotnet'
                ? 'dotnet'
                : '',
    ['--version'],
    process.cwd(),
  );

  return result.status === 0;
}

export interface ConfiguredAuditRunner {
  run(ecosystem: EcosystemId, workspaceRoot: string): Promise<NativeAuditResult>;
  isAvailable(ecosystem: EcosystemId, cwd?: string): Promise<boolean>;
}

/** Build a hermetic native-audit dispatcher around an injected command strategy. */
export function createAuditRunner(
  commandRunner: AuditCommandRunner = defaultAuditCommandRunner,
): ConfiguredAuditRunner {
  const commandFor = (ecosystem: EcosystemId): string | undefined => {
    switch (ecosystem) {
      case 'npm':
        return 'npm';
      case 'python':
        return 'pip-audit';
      case 'rust':
        return 'cargo';
      case 'go':
        return 'govulncheck';
      case 'php':
        return 'composer';
      case 'dotnet':
        return 'dotnet';
      default:
        return undefined;
    }
  };
  return {
    run: (ecosystem, workspaceRoot) => runNativeAudit(ecosystem, workspaceRoot, commandRunner),
    isAvailable: async (ecosystem, cwd = process.cwd()) => {
      const command = commandFor(ecosystem);
      return command ? (await commandRunner(command, ['--version'], cwd)).status === 0 : false;
    },
  };
}
