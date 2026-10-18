import { describe, expect, it } from 'vitest';
import { applyPlan, generateUpgradePlan } from '../src/remediation.js';
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
});
