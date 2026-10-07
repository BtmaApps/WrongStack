import type { Evidence } from '../types.js';
import {
  type AuditCommandRunner,
  defaultAuditCommandRunner,
  type NativeAdvisory,
  type NativeAuditResult,
  npmSeverity,
} from './native-audit-command.js';

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
