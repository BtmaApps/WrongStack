import { Readable } from 'node:stream';
import { createSetupProviderFactory } from '@wrongstack/providers';
import type { Snapshot, TechStackStore } from '@wrongstack/techstack';
import { describe, expect, it, vi } from 'vitest';
import {
  handleTechStackDependencyResearch,
  handleTechStackModels,
  handleTechStackRemediationApply,
  handleTechStackRemediationPlan,
  handleTechStackTrends,
  type TechStackHandlerDeps,
} from '../src/server/techstack-handlers.js';

const snapshot: Snapshot = {
  id: 'snapshot-1',
  projectId: '/project',
  targetRoot: '/project',
  fingerprint: 'fingerprint',
  createdAt: '2026-07-21T00:00:00.000Z',
  adapterVersion: 'test',
  coverage: 'full',
  workspaces: [
    {
      id: 'workspace-1',
      relativeRoot: 'packages/app',
      ecosystem: 'npm',
      manifests: [],
      lockfiles: [],
      confidence: 1,
      coverage: 'full',
    },
  ],
  dependencies: [
    {
      id: 'dependency-1',
      workspaceId: 'workspace-1',
      ecosystem: 'npm',
      name: 'react',
      sourceType: 'registry',
      direct: true,
      scope: 'runtime',
      locked: '18.0.0',
      latestStable: '19.0.0',
      status: 'update_available_breaking',
      evidence: [],
    },
  ],
  findings: [
    {
      id: 'finding-1',
      dependencyId: 'dependency-1',
      type: 'upgrade',
      severity: 'medium',
      action: 'upgrade_major',
      confidence: 1,
      rationale: 'Upgrade React',
      evidence: [],
    },
  ],
};

function response() {
  const result = { status: 0, body: '' };
  return {
    result,
    value: {
      writeHead(status: number) {
        result.status = status;
      },
      end(body?: string) {
        result.body = body ?? '';
      },
    } as never,
  };
}

function request(body: unknown) {
  return Readable.from([JSON.stringify(body)]) as never;
}

function deps(
  executePackageOperation?: TechStackHandlerDeps['executePackageOperation'],
): TechStackHandlerDeps {
  const store = {
    getSnapshot: () => snapshot,
    listSnapshots: () => [snapshot],
  } as never as TechStackStore;
  return { projectId: '/project', projectRoot: '/project', store, executePackageOperation };
}

describe('TechStack remediation and trend handlers', () => {
  it('does not advertise setup-mode onboarding as a research model', async () => {
    const provider = createSetupProviderFactory().create({ type: 'wrongstack-setup' });
    const input = { ...deps(), getLlm: () => ({ provider, model: 'no-api-key' }) };
    const res = response();
    handleTechStackModels(res.value, input);
    expect(JSON.parse(res.result.body)).toMatchObject({ available: false, candidates: [] });
    const research = response();
    await handleTechStackDependencyResearch(
      research.value,
      { ...input, store: { getSnapshot: () => snapshot, getCachedResearch: () => null } as never },
      'dependency-1',
    );
    expect(research.result.status).toBe(503);
  });
  it('returns a dry-run remediation preview and trend report', async () => {
    const planResponse = response();
    await handleTechStackRemediationPlan(planResponse.value, deps());
    expect(planResponse.result.status).toBe(200);
    expect(JSON.parse(planResponse.result.body)).toMatchObject({
      plan: { summary: { total: 1 } },
      preview: { dryRun: true, items: [{ status: 'planned' }] },
    });

    const trendResponse = response();
    await handleTechStackTrends(trendResponse.value, deps());
    expect(JSON.parse(trendResponse.result.body)).toMatchObject({ trend: { snapshots: 1 } });
  });

  it('requires exact item approval and forwards the workspace to the governed executor', async () => {
    const execute = vi.fn().mockResolvedValue({ detail: 'updated' });
    const res = response();
    await handleTechStackRemediationApply(
      request({ approvedItems: ['workspace-1:npm:react:upgrade_major'] }),
      res.value,
      deps(execute),
    );
    expect(res.result.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ dependencyName: 'react', action: 'upgrade_major' }),
      'packages/app',
    );
    expect(JSON.parse(res.result.body)).toMatchObject({
      result: { items: [{ status: 'applied' }] },
    });
  });

  it('rejects an apply request without explicit item approval', async () => {
    const execute = vi.fn();
    const res = response();
    await handleTechStackRemediationApply(request({ approvedItems: [] }), res.value, deps(execute));
    expect(res.result.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('executes only the exact snapshot and targets reviewed by the native client', async () => {
    const execute = vi.fn().mockResolvedValue({ detail: 'updated' });
    const read = response();
    await handleTechStackRemediationPlan(read.value, deps());
    const plan = JSON.parse(read.result.body).plan;
    const res = response();
    await handleTechStackRemediationApply(
      request({
        approvedItems: ['workspace-1:npm:react:upgrade_major'],
        expectedSnapshotId: plan.snapshotId,
        expectedItems: plan.items,
      }),
      res.value,
      deps(execute),
    );
    expect(res.result.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ targetVersion: '19.0.0' }),
      'packages/app',
    );
  });
  it('refuses stale versions, snapshot identity and malformed reviewed items before execution', async () => {
    const read = response();
    await handleTechStackRemediationPlan(read.value, deps());
    const plan = JSON.parse(read.result.body).plan;
    for (const options of [
      { expectedSnapshotId: 'older', expectedItems: plan.items },
      {
        expectedSnapshotId: plan.snapshotId,
        expectedItems: [{ ...plan.items[0], targetVersion: '18.9.0' }],
      },
      { expectedSnapshotId: plan.snapshotId, expectedItems: null },
      { expectedSnapshotId: plan.snapshotId, expectedItems: [null] },
      {
        expectedSnapshotId: plan.snapshotId,
        expectedItems: [{ ...plan.items[0], rationale: 'Earlier advice' }],
      },
    ]) {
      const execute = vi.fn();
      const res = response();
      await handleTechStackRemediationApply(
        request({ approvedItems: ['workspace-1:npm:react:upgrade_major'], ...options }),
        res.value,
        deps(execute),
      );
      expect(res.result.status).toBe(409);
      expect(execute).not.toHaveBeenCalled();
    }
  });
});
