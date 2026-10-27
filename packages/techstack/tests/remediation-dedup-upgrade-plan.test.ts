import { describe, expect, it } from 'vitest';
import { parsePurl } from '../src/registry/purl.js';
import { applyPlan, generateUpgradePlan } from '../src/remediation.js';
import { TrendStore } from '../src/trend.js';
import type { Snapshot } from '../src/types.js';

describe('generateUpgradePlan per-dependency deduplication', () => {
  it('merges multiple actionable findings for the same dependency into one plan item with highest severity and action', async () => {
    const snapshot: Snapshot = {
      id: 'snap-multi',
      projectId: 'p1',
      targetRoot: '/tmp',
      fingerprint: 'fp1',
      createdAt: '2026-10-18T00:00:00.000Z',
      adapterVersion: '0.1.0',
      coverage: 'full',
      workspaces: [],
      dependencies: [
        {
          id: 'dep-express',
          workspaceId: 'ws-root',
          ecosystem: 'npm',
          name: 'express',
          sourceType: 'registry',
          direct: true,
          scope: 'runtime',
          locked: '4.18.2',
          latestStable: '4.21.0',
          status: 'vulnerable',
          evidence: [],
        },
      ],
      findings: [
        {
          id: 'f-cve-1',
          dependencyId: 'dep-express',
          type: 'vulnerability',
          severity: 'medium',
          action: 'upgrade_patch',
          confidence: 1,
          rationale: 'CVE-2024-1111',
          evidence: [],
        },
        {
          id: 'f-cve-2',
          dependencyId: 'dep-express',
          type: 'vulnerability',
          severity: 'critical',
          action: 'upgrade_minor',
          confidence: 1,
          rationale: 'CVE-2024-2222',
          evidence: [],
        },
      ],
    };

    const plan = generateUpgradePlan(snapshot);
    expect(plan.items).toHaveLength(1);
    expect(plan.summary.total).toBe(1);
    expect(plan.summary.minor).toBe(1);
    expect(plan.summary.patch).toBe(0);
    expect(plan.items[0]?.severity).toBe('critical');
    expect(plan.items[0]?.action).toBe('upgrade_minor');
    expect(plan.items[0]?.rationale).toBe('CVE-2024-1111; CVE-2024-2222');

    const executedOps: string[] = [];
    await applyPlan(plan, {
      dryRun: false,
      approve: () => true,
      execute: async (op) => {
        executedOps.push(`${op.dependencyName}@${op.targetVersion}:${op.action}`);
      },
    });
    expect(executedOps).toEqual(['express@4.21.0:upgrade_minor']);
  });

  it('omits targetVersion/install commands on non-upgrade actions, guards TrendStore against invalid timestamps, and rejects malformed PURLs (F687)', () => {
    const snapshot: Snapshot = {
      id: 'snap-f687',
      projectId: 'p1',
      targetRoot: '/tmp',
      fingerprint: 'fp-f687',
      createdAt: '2026-10-20T00:00:00.000Z',
      adapterVersion: '0.1.0',
      coverage: 'full',
      workspaces: [],
      dependencies: [
        {
          id: 'dep-replace',
          workspaceId: 'ws-1',
          ecosystem: 'npm',
          name: 'deprecated-pkg',
          sourceType: 'registry',
          direct: true,
          scope: 'runtime',
          locked: '1.0.0',
          latestStable: '1.2.0',
          status: 'deprecated',
          evidence: [],
        },
        {
          id: 'dep-remove',
          workspaceId: 'ws-1',
          ecosystem: 'npm',
          name: 'banned-pkg',
          sourceType: 'registry',
          direct: true,
          scope: 'runtime',
          locked: '1.0.0',
          latestStable: '2.0.0',
          status: 'vulnerable',
          evidence: [],
        },
      ],
      findings: [
        {
          id: 'f-replace',
          dependencyId: 'dep-replace',
          type: 'deprecation',
          severity: 'medium',
          action: 'replace',
          confidence: 1,
          rationale: 'Deprecated',
          evidence: [],
        },
        {
          id: 'f-remove',
          dependencyId: 'dep-remove',
          type: 'policy',
          severity: 'high',
          action: 'remove',
          confidence: 1,
          rationale: 'Banned',
          evidence: [],
        },
      ],
    };

    const plan = generateUpgradePlan(snapshot);
    const replaceItem = plan.items.find((i) => i.dependencyName === 'deprecated-pkg')!;
    const removeItem = plan.items.find((i) => i.dependencyName === 'banned-pkg')!;
    expect(replaceItem.suggestedCommand).toBeUndefined();
    expect(replaceItem.targetVersion).toBeUndefined();
    expect(removeItem.suggestedCommand).toBe('npm uninstall banned-pkg');
    expect(removeItem.targetVersion).toBeUndefined();

    const report = new TrendStore({
      listSnapshots: () => [
        {
          ...snapshot,
          id: 's1',
          createdAt: 'invalid-date',
          dependencies: [{ ...snapshot.dependencies[0]!, status: 'vulnerable' }],
        },
        {
          ...snapshot,
          id: 's2',
          createdAt: '2026-10-25T00:00:00.000Z',
          dependencies: [{ ...snapshot.dependencies[0]!, locked: '1.1.0', status: 'current' }],
        },
      ],
    }).analyze('p1');
    expect(Number.isFinite(report.dependencies[0]?.lockedVersionAgeMs)).toBe(true);
    expect(Number.isFinite(report.dependencies[0]?.upgradeVelocityPerDay)).toBe(true);
    expect(Number.isFinite(report.vulnerabilityHalfLifeMs)).toBe(true);

    expect(parsePurl('pkg:maven//spring-core@6.2.7')).toBeUndefined();
    expect(parsePurl('pkg:npm/foo/bar@1.0.0')).toBeUndefined();
  });
});
