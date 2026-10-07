/**
 * TechStack — Native audit command wrappers.
 *
 * Spawns ecosystem-native audit tools (npm audit, pip-audit, cargo-audit,
 * govulncheck, composer audit, dotnet package audit) and parses their
 * output into the TechStack advisory model.
 *
 * @see docs/archive/specs/techstack-sdd.md §6, §7
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { EcosystemId, Evidence } from '../types.js';
import {
  type AuditCommandResult,
  type AuditCommandRunner,
  cargoSeverity,
  defaultAuditCommandRunner,
  type NativeAdvisory,
  type NativeAuditResult,
  npmSeverity,
} from './native-audit-command.js';
import {
  runComposerAudit,
  runDotnetAudit,
  runGoVulncheck,
} from './native-audit-go-composer-dotnet.js';

export type {
  AuditCommandResult,
  AuditCommandRunner,
  NativeAdvisory,
  NativeAuditResult,
} from './native-audit-command.js';
export {
  runComposerAudit,
  runDotnetAudit,
  runGoVulncheck,
} from './native-audit-go-composer-dotnet.js';

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

  // pip-audit has no subcommands: a leading `audit` became its positional
  // `project_path`, which `-r` rejects as mutually exclusive and which
  // otherwise names a directory that does not exist.
  const args = ['--format', 'json'];
  if (reqFlag) {
    args.push(...reqFlag.split(' '));
  }

  const result = await runner('pip-audit', args, workspaceRoot);
  return parsePipAuditOutput(result);
}

function parsePipAuditOutput(result: AuditCommandResult): NativeAuditResult {
  const advisories: NativeAdvisory[] = [];
  let detailLines: string[] = [];

  // pip-audit exits 1 when it found vulnerabilities, with the report on stdout.
  const stdout = result.stdout?.trim() ?? '';
  if (result.status === 0 || stdout.startsWith('{') || stdout.startsWith('[')) {
    try {
      // Real JSON format (pip_audit/_format/json.py): `{dependencies: [{name,
      // version, vulns: [{id, fix_versions, aliases, description}]} | {name,
      // skip_reason}], fixes}` — findings are nested per dependency and carry
      // no severity. A bare array of dependencies is accepted too.
      const json = JSON.parse(stdout || '{}') as unknown;
      const dependencies = (
        Array.isArray(json) ? json : ((json as { dependencies?: unknown }).dependencies ?? [])
      ) as Array<{
        name?: unknown;
        vulns?: Array<{
          id?: unknown;
          fix_versions?: unknown;
          aliases?: unknown;
          description?: unknown;
        }>;
      }>;
      for (const dep of dependencies) {
        if (typeof dep?.name !== 'string' || !Array.isArray(dep.vulns)) continue;
        for (const vuln of dep.vulns) {
          if (typeof vuln?.id !== 'string') continue;
          const fixVersions = Array.isArray(vuln.fix_versions) ? vuln.fix_versions : [];
          const description =
            typeof vuln.description === 'string' && vuln.description.trim() !== ''
              ? vuln.description
              : undefined;
          advisories.push({
            id: vuln.id,
            packageName: dep.name,
            severity: 'info',
            summary: description ?? vuln.id,
            fixVersion: typeof fixVersions[0] === 'string' ? fixVersions[0] : undefined,
            aliases: Array.isArray(vuln.aliases)
              ? vuln.aliases.filter((alias): alias is string => typeof alias === 'string')
              : [],
          });
        }
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
            severity: cargoSeverity((advisory.cvss as string) ?? ''),
            summary: (advisory.title as string) ?? (advisory.description as string) ?? 'No summary',
            // rustsec puts the patched ranges beside the advisory, in
            // `versions.patched`; `advisory.patched_versions` never exists.
            fixVersion:
              ((adv.versions as { patched?: unknown[] } | undefined)?.patched?.find(
                (v): v is string => typeof v === 'string',
              ) ??
                (advisory.patched_versions as string)) ||
              undefined,
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
