import { afterAll, describe, expect, it } from 'vitest';
import {
  calculatePlanVersionFingerprint,
  type GovernanceDecisionContext,
  PLAN_VERSION_SCHEMA_VERSION,
  SqliteGovernanceEventStore,
  TASK_CONTRACT_SCHEMA_VERSION,
  workspaceSnapshotFenceId,
} from '../src/index.js';

/**
 * Direct-call coverage for the guards inside verifyIssuancePrecondition that
 * the lease/store integration suites reach only indirectly.
 *
 * These cases exist to answer a mutation-testing question: can changing the
 * `activePlanFingerprint` format guard, or the denial code on the
 * missing-active-plan branch, be observed at all? Both input shapes below ARE
 * exercised, so a mutant that survives them is equivalent, not untested.
 */
describe('verification ledger issuance preconditions', () => {
  const stores: SqliteGovernanceEventStore[] = [];

  interface Fixture {
    host: {
      db: unknown;
      verifyWorkspaceSnapshotPrecondition: () => null;
      verifyCandidatePrecondition: () => null;
    };
    activePlanFingerprint: string;
    run: {
      taskId: string;
      contractVersion: number;
      planFingerprint: string;
      workspaceManifestHash: string;
    };
    precondition: (overrides?: Record<string, unknown>) => Record<string, unknown>;
    verifyIssuancePrecondition: (host: never, run: never, precondition: never) => unknown;
  }

  async function openFixture(): Promise<Fixture> {
    const store = SqliteGovernanceEventStore.open(':memory:', {
      now: () => '2026-08-02T12:05:00.000Z',
      verificationLeaseSecret: () => 's'.repeat(43),
    });
    stores.push(store);

    const contract = {
      schemaVersion: TASK_CONTRACT_SCHEMA_VERSION,
      taskId: 'task-1',
      contractVersion: 1,
      projectId: 'project-1',
      sourceRequest: 'Issue a registry-bound verification capability.',
      policyVersion: 'policy-1',
      repository: { rootIdentity: 'repository-1', baselinePolicy: 'required' as const },
      requirements: [{ id: 'req-1', text: 'Preserve behavior.', acceptanceCriteriaIds: ['ac-1'] }],
      acceptanceCriteria: [
        { id: 'ac-1', statement: 'Focused tests pass.', evidenceKinds: ['test' as const] },
      ],
      autonomy: {
        tier: 'A2' as const,
        allowedOperations: [
          'repository_read' as const,
          'file_edit' as const,
          'focused_check' as const,
        ],
        humanApprovalRequiredFor: [],
        allowedPaths: ['packages/governance/**'],
        deniedPaths: [],
        budget: {
          maxChangedFiles: 10,
          maxChangedLines: 1000,
          maxNewDependencies: 0,
          maxRetries: 3,
          maxReplans: 2,
          maxSubagents: 2,
          maxWallClockMs: 900000,
        },
        autoAuthorizePlan: true,
        autoReplanLimit: 2,
        autoResolveReviewFixes: true,
      },
      requiredChecks: [
        { id: 'check-test', kind: 'test' as const, required: true, requirementIds: ['req-1'] },
      ],
      requiredReviewDimensions: ['correctness' as const],
      rollbackClass: 'git_revert' as const,
      assumptions: [],
      sources: {
        requirements: 'explicit_user' as const,
        scope: 'project_policy' as const,
        checks: 'deterministic_inference' as const,
        autonomy: 'project_policy' as const,
      },
    };
    const plan = {
      schemaVersion: PLAN_VERSION_SCHEMA_VERSION,
      planId: 'plan-1',
      taskId: 'task-1',
      planVersion: 1,
      parentPlanVersion: null,
      contractVersion: 1,
      createdBy: 'model' as const,
      createdAt: '2026-08-02T11:01:00.000Z',
      changeReason: 'Initial bounded verification plan.',
      steps: [
        {
          id: 'implement',
          title: 'Implement',
          description: 'Implement the bounded governance change.',
          operations: ['file_edit' as const],
          expectedPaths: ['packages/governance/src/verification-issuance-coordinator.ts'],
          requirementIds: ['req-1'],
          acceptanceCriteriaIds: ['ac-1'],
          requiredCheckIds: ['check-test'],
        },
      ],
      edges: [],
    };
    const decisionContext: GovernanceDecisionContext = {
      transitionFacts: {
        contractApproved: true,
        planApproved: true,
        withinAutonomyEnvelope: true,
        authorization: 'automatic',
        executionGrantValid: true,
        snapshotCurrent: true,
        requiredEvidenceSatisfied: true,
        blockingFindings: 0,
        rollbackVerified: true,
      },
    };
    const commands = [
      {
        type: 'create_task',
        commandId: 'c-1',
        taskId: 'task-1',
        expectedRevision: 0,
        actor: 'model',
        issuedAt: '2026-08-02T11:00:00.000Z',
        projectId: 'project-1',
        contract,
      },
      {
        type: 'transition_task',
        commandId: 'c-2',
        taskId: 'task-1',
        expectedRevision: 1,
        actor: 'model',
        issuedAt: '2026-08-02T11:01:00.000Z',
        to: 'scoped',
      },
      {
        type: 'attach_plan_version',
        commandId: 'c-3',
        taskId: 'task-1',
        expectedRevision: 2,
        actor: 'model',
        issuedAt: '2026-08-02T11:02:00.000Z',
        plan,
      },
      ...(['planned', 'authorized', 'executing', 'proposed_complete'] as const).map(
        (to, index) => ({
          type: 'transition_task',
          commandId: `c-${index + 4}`,
          taskId: 'task-1',
          expectedRevision: index + 3,
          actor: 'model',
          issuedAt: `2026-08-02T11:0${index + 3}:00.000Z`,
          to,
        }),
      ),
    ];
    for (const command of commands) store.execute(command as never, decisionContext);

    const activePlanFingerprint = calculatePlanVersionFingerprint(plan);
    const workspaceManifestHash = 'b'.repeat(64);
    const capturedAt = '2026-08-02T12:01:00.000Z';

    const basePrecondition = {
      taskRevision: 7,
      activeContractVersion: 1,
      activePlanVersion: 1,
      activePlanFingerprint,
      workflowState: 'proposed_complete' as const,
      workspaceManifestHash,
      workspaceSnapshot: {
        schemaVersion: 1 as const,
        snapshotId: workspaceSnapshotFenceId('project-1', 1, workspaceManifestHash, capturedAt),
        projectId: 'project-1',
        revision: 1,
        manifestHash: workspaceManifestHash,
        capturedAt,
      },
      candidateObservation: { sequence: 1, observationId: 'observation-1' },
    };

    const { verifyIssuancePrecondition } = await import(
      '../src/verification-ledger-preconditions.js'
    );

    return {
      host: {
        db: (store as unknown as { db: unknown }).db,
        verifyWorkspaceSnapshotPrecondition: () => null,
        verifyCandidatePrecondition: () => null,
      },
      activePlanFingerprint,
      run: {
        taskId: 'task-1',
        contractVersion: 1,
        planFingerprint: activePlanFingerprint,
        workspaceManifestHash,
      },
      precondition: (overrides = {}) => ({ ...basePrecondition, ...overrides }),
      verifyIssuancePrecondition:
        verifyIssuancePrecondition as unknown as Fixture['verifyIssuancePrecondition'],
    };
  }

  afterAll(() => {
    for (const store of stores.splice(0)) store.close();
  });

  it('accepts issuance when the canonical plan, revision and state all agree', async () => {
    const fixture = await openFixture();

    expect(
      fixture.verifyIssuancePrecondition(
        fixture.host as never,
        fixture.run as never,
        fixture.precondition() as never,
      ),
    ).toBeNull();
  });

  it('reports canonical_state_mismatch when the run plan fingerprint drifts from the active plan', async () => {
    const fixture = await openFixture();

    expect(
      fixture.verifyIssuancePrecondition(
        fixture.host as never,
        { ...fixture.run, planFingerprint: 'f'.repeat(64) } as never,
        fixture.precondition() as never,
      ),
    ).toMatchObject({ issued: false, code: 'canonical_state_mismatch' });
  });

  it('reports canonical_state_mismatch for a malformed activePlanFingerprint', async () => {
    const fixture = await openFixture();

    expect(
      fixture.verifyIssuancePrecondition(
        fixture.host as never,
        fixture.run as never,
        fixture.precondition({ activePlanFingerprint: 'not-a-sha256-fingerprint' }) as never,
      ),
    ).toMatchObject({ issued: false, code: 'canonical_state_mismatch' });
  });

  it('reports canonical_state_mismatch when the precondition names an inactive plan version', async () => {
    const fixture = await openFixture();

    expect(
      fixture.verifyIssuancePrecondition(
        fixture.host as never,
        fixture.run as never,
        fixture.precondition({ activePlanVersion: 99 }) as never,
      ),
    ).toMatchObject({ issued: false, code: 'canonical_state_mismatch' });
  });
});
