/**
 * TechStack — Remediation planning.
 *
 * Generates dry-run upgrade plans from a snapshot's findings. NEVER mutates
 * dependency files — the plan is read-only output that the user must
 * explicitly approve before any `language_package` or `install` tool runs.
 *
 * @see docs/specs/techstack-sdd.md §2 (R25), §9
 */

import type { LanguagePackageInput, LanguageProfileId } from '@wrongstack/tools';
import type { DependencyObservation, Finding, Snapshot } from './types.js';

export interface UpgradePlanItem {
  readonly dependencyName: string;
  readonly ecosystem: string;
  readonly workspaceId: string;
  readonly currentVersion: string | undefined;
  readonly targetVersion: string | undefined;
  readonly action: Finding['action'];
  readonly severity: Finding['severity'];
  readonly rationale: string;
  readonly breakingRisk: string | undefined;
  /** Command suggestion (informational only — never auto-executed). */
  readonly suggestedCommand: string | undefined;
}

export interface UpgradePlan {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly items: readonly UpgradePlanItem[];
  readonly summary: {
    readonly total: number;
    readonly patch: number;
    readonly minor: number;
    readonly major: number;
    readonly replace: number;
    readonly remove: number;
    readonly investigate: number;
  };
  readonly warning: string;
}

export interface PackageOperation {
  readonly ecosystem: string;
  readonly workspaceId: string;
  readonly dependencyName: string;
  readonly action: UpgradePlanItem['action'];
  readonly targetVersion?: string | undefined;
}

const LANGUAGE_BY_ECOSYSTEM: Readonly<Partial<Record<string, LanguageProfileId>>> = {
  python: 'python',
  rust: 'rust',
  go: 'go',
  php: 'php',
  dotnet: 'csharp',
};

const EXECUTABLE_ECOSYSTEMS = new Set(['npm', ...Object.keys(LANGUAGE_BY_ECOSYSTEM)]);

function versionedPackageName(operation: PackageOperation): string {
  const version = operation.targetVersion;
  if (!version) return operation.dependencyName;
  switch (operation.ecosystem) {
    case 'python':
      return `${operation.dependencyName}==${version}`;
    case 'php':
      return `${operation.dependencyName}:${version}`;
    default:
      return `${operation.dependencyName}@${version}`;
  }
}

/** Convert a remediation item into the structured safe package-tool input. */
export function toLanguagePackageInput(
  operation: PackageOperation,
  workspace?: string,
): LanguagePackageInput {
  if (operation.action === 'replace' || operation.action === 'investigate') {
    throw new Error(`${operation.action} requires a manual package choice`);
  }
  if (!EXECUTABLE_ECOSYSTEMS.has(operation.ecosystem)) {
    throw new Error(`Automated remediation is not supported for ${operation.ecosystem}`);
  }
  const language = LANGUAGE_BY_ECOSYSTEM[operation.ecosystem];
  const base = {
    ...(workspace ? { workspace } : {}),
    ...(language ? { language } : {}),
    allowScripts: false,
  };
  if (operation.action === 'remove') {
    if (operation.ecosystem === 'go') {
      return { ...base, operation: 'add', names: [`${operation.dependencyName}@none`] };
    }
    return { ...base, operation: 'remove', names: [operation.dependencyName] };
  }
  return { ...base, operation: 'add', names: [versionedPackageName(operation)] };
}

export type PackageOperationExecutor = (
  operation: PackageOperation,
) => Promise<{ readonly detail?: string | undefined } | void>;

export interface ApplyPlanOptions {
  /** Defaults to true. Set false only after explicit user approval. */
  readonly dryRun?: boolean | undefined;
  /** Permission gate evaluated independently for every plan item. */
  readonly approve?:
    | ((item: UpgradePlanItem, index: number) => boolean | Promise<boolean>)
    | undefined;
  /** Structured language-package executor; shell command strings are never run here. */
  readonly execute?: PackageOperationExecutor | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface ApplyPlanResult {
  readonly dryRun: boolean;
  readonly items: ReadonlyArray<{
    readonly dependencyName: string;
    readonly status: 'planned' | 'skipped' | 'applied' | 'failed';
    readonly detail?: string | undefined;
  }>;
}

/**
 * Suggest a package-manager command for a given ecosystem + action.
 * This is purely informational — the actual execution goes through the
 * permission-gated `language_package` tool.
 */
function suggestCommand(
  ecosystem: string,
  name: string,
  action: Finding['action'],
  targetVersion?: string,
): string | undefined {
  const ver = targetVersion ? `@${targetVersion}` : '@latest';
  switch (ecosystem) {
    case 'npm':
      if (action === 'remove') return `npm uninstall ${name}`;
      return `npm install ${name}${ver}`;
    case 'python':
      if (action === 'remove') return `pip uninstall ${name}`;
      // pip joins a version with `==` (PEP 508) — `name@version` is npm syntax
      // and pip rejects it. With no target version, name the package alone,
      // which is the same shape `versionedPackageName` sends on the executable
      // path (`toLanguagePackageInput`) instead of inventing `@latest`.
      return targetVersion ? `pip install ${name}==${targetVersion}` : `pip install ${name}`;
    case 'rust':
      if (action === 'remove') return `cargo remove ${name}`;
      return `cargo add ${name}@${targetVersion ?? 'latest'}`;
    case 'go':
      if (action === 'remove') return `go get ${name}@none`;
      return `go get ${name}@${targetVersion ?? 'latest'}`;
    case 'php':
      if (action === 'remove') return `composer remove ${name}`;
      return `composer require ${name}:${targetVersion ?? 'latest'}`;
    case 'dotnet':
      if (action === 'remove') return `dotnet remove package ${name}`;
      return `dotnet add package ${name}`;
    default:
      return undefined;
  }
}

/**
 * Generate a dry-run upgrade plan from a snapshot.
 *
 * This function is **read-only** — it never touches manifests, lockfiles,
 * or the filesystem. It only reads the snapshot's findings and produces
 * a structured plan the user can review.
 *
 * @param snapshot The enriched snapshot to plan from.
 * @returns A structured upgrade plan.
 */
export function generateUpgradePlan(snapshot: Snapshot): UpgradePlan {
  const findings = snapshot.findings as readonly Finding[];
  const items: UpgradePlanItem[] = [];

  for (const finding of findings) {
    if (finding.action === 'none') continue;

    const dep = snapshot.dependencies.find(
      (d: DependencyObservation) => d.id === finding.dependencyId,
    );
    if (!dep) continue;

    const targetVersion = dep.latestStable ?? dep.resolvable ?? dep.wanted;

    items.push({
      dependencyName: dep.name,
      ecosystem: dep.ecosystem,
      workspaceId: dep.workspaceId,
      currentVersion: dep.locked ?? dep.installed ?? dep.requested,
      targetVersion,
      action: finding.action,
      severity: finding.severity,
      rationale: finding.rationale,
      breakingRisk: finding.breakingRisk,
      suggestedCommand: suggestCommand(dep.ecosystem, dep.name, finding.action, targetVersion),
    });
  }

  // Sort by severity (critical first, then high, medium, low, info)
  const severityOrder = new Map([
    ['critical', 0],
    ['high', 1],
    ['medium', 2],
    ['low', 3],
    ['info', 4],
  ]);
  items.sort((a, b) => {
    const sa = severityOrder.get(a.severity) ?? 5;
    const sb = severityOrder.get(b.severity) ?? 5;
    return sa - sb;
  });

  const summary = {
    total: items.length,
    patch: items.filter((i) => i.action === 'upgrade_patch').length,
    minor: items.filter((i) => i.action === 'upgrade_minor').length,
    major: items.filter((i) => i.action === 'upgrade_major').length,
    replace: items.filter((i) => i.action === 'replace').length,
    remove: items.filter((i) => i.action === 'remove').length,
    investigate: items.filter((i) => i.action === 'investigate').length,
  };

  return {
    snapshotId: snapshot.id,
    generatedAt: new Date().toISOString(),
    items,
    summary,
    warning:
      'This plan is read-only. No dependency files will be modified unless you explicitly approve and execute each item.',
  };
}

/**
 * Render an upgrade plan as Markdown for the report endpoint or CLI display.
 */
export function renderPlanMarkdown(plan: UpgradePlan): string {
  const lines: string[] = [
    '# TechStack Remediation Plan',
    '',
    `**Generated:** ${plan.generatedAt}`,
    `**Snapshot:** ${plan.snapshotId}`,
    `**Total items:** ${plan.summary.total}`,
    '',
    `> ⚠️ ${plan.warning}`,
    '',
  ];

  if (plan.items.length === 0) {
    lines.push('_No remediation actions needed — all dependencies are current._');
    return lines.join('\n');
  }

  // Summary table
  lines.push('## Summary', '');
  lines.push('| Action | Count |');
  lines.push('|---|---|');
  lines.push(`| Patch upgrade | ${plan.summary.patch} |`);
  lines.push(`| Minor upgrade | ${plan.summary.minor} |`);
  lines.push(`| Major upgrade | ${plan.summary.major} |`);
  lines.push(`| Replace | ${plan.summary.replace} |`);
  lines.push(`| Remove | ${plan.summary.remove} |`);
  lines.push(`| Investigate | ${plan.summary.investigate} |`);
  lines.push('');

  // Detail items
  lines.push('## Items', '');
  for (const item of plan.items) {
    const icon =
      item.severity === 'critical'
        ? '🔴'
        : item.severity === 'high'
          ? '🟠'
          : item.severity === 'medium'
            ? '🟡'
            : item.severity === 'low'
              ? '🔵'
              : 'ℹ️';

    lines.push(`### ${icon} ${item.dependencyName} (${item.ecosystem})`, '');
    lines.push(`- **Action:** ${item.action}`);
    lines.push(`- **Current:** ${item.currentVersion ?? 'unknown'}`);
    lines.push(`- **Target:** ${item.targetVersion ?? 'latest'}`);
    lines.push(`- **Severity:** ${item.severity}`);
    lines.push(`- **Rationale:** ${item.rationale}`);
    if (item.breakingRisk) lines.push(`- **Breaking risk:** ${item.breakingRisk}`);
    if (item.suggestedCommand) {
      lines.push(`- **Suggested command:** \`${item.suggestedCommand}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Apply explicitly approved remediation items through a structured,
 * permission-gated package executor. The safe default is a dry run.
 */
export async function applyPlan(
  plan: UpgradePlan,
  options: ApplyPlanOptions = {},
): Promise<ApplyPlanResult> {
  const dryRun = options.dryRun !== false;
  const execute = options.execute;
  if (!dryRun && !execute) throw new Error('An execute strategy is required when dryRun is false');
  const results: ApplyPlanResult['items'][number][] = [];
  for (const [index, item] of plan.items.entries()) {
    if (options.signal?.aborted) throw new DOMException('Remediation cancelled', 'AbortError');
    if (dryRun) {
      results.push({ dependencyName: item.dependencyName, status: 'planned' });
      continue;
    }
    const approved = options.approve ? await options.approve(item, index) : false;
    if (!approved) {
      results.push({
        dependencyName: item.dependencyName,
        status: 'skipped',
        detail: 'Not approved',
      });
      continue;
    }
    try {
      if (!execute) throw new Error('An execute strategy is required when dryRun is false');
      const response = await execute({
        ecosystem: item.ecosystem,
        workspaceId: item.workspaceId,
        dependencyName: item.dependencyName,
        action: item.action,
        ...(item.targetVersion ? { targetVersion: item.targetVersion } : {}),
      });
      results.push({
        dependencyName: item.dependencyName,
        status: 'applied',
        ...(response?.detail ? { detail: response.detail } : {}),
      });
    } catch (error) {
      results.push({
        dependencyName: item.dependencyName,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { dryRun, items: results };
}
