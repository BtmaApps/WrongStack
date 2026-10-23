import { describe, expect, it } from 'vitest';
import {
  decodeGovernanceServiceRequest,
  GOVERNANCE_SERVICE_PROTOCOL_VERSION,
  TASK_CONTRACT_SCHEMA_VERSION,
} from '../src/index.js';

/**
 * The decoder sits on the untrusted side of the IPC boundary, so these two
 * ceilings are security limits, not ergonomics:
 *
 * - MAX_ARRAY_ITEMS is enforced only inside arrayValue(), reached here through
 *   stringArray() for `autonomy.allowedPaths`. (A `capabilities` array is NOT a
 *   valid probe: the decoder bounds it with its own capabilityArray limit.)
 * - MAX_STRING_LENGTH is enforced only inside stringValue(), reached here
 *   through `contract.sourceRequest`.
 *
 * Each case pins the boundary from both sides: the last accepted value and the
 * first rejected one.
 */
function createTaskRequest(overrides: Record<string, unknown>) {
  const contract = {
    schemaVersion: TASK_CONTRACT_SCHEMA_VERSION,
    taskId: 'task-1',
    contractVersion: 1,
    projectId: 'project-1',
    sourceRequest: 'Bound the resource ceilings.',
    policyVersion: 'policy-1',
    repository: { rootIdentity: 'repo-hash', baselinePolicy: 'required' },
    requirements: [
      { id: 'req-1', text: 'Reject oversized payloads.', acceptanceCriteriaIds: ['ac-1'] },
    ],
    acceptanceCriteria: [{ id: 'ac-1', statement: 'Ceilings hold.', evidenceKinds: ['test'] }],
    autonomy: {
      tier: 'A2',
      allowedOperations: ['repository_read', 'file_edit', 'focused_check'],
      humanApprovalRequiredFor: [],
      allowedPaths: ['packages/governance/**'],
      deniedPaths: [],
      budget: {
        maxChangedFiles: 10,
        maxChangedLines: 1_000,
        maxNewDependencies: 0,
        maxRetries: 3,
        maxReplans: 2,
        maxSubagents: 2,
        maxWallClockMs: 900_000,
      },
      autoAuthorizePlan: true,
      autoReplanLimit: 2,
      autoResolveReviewFixes: true,
    },
    requiredChecks: [{ id: 'check-1', kind: 'test', required: true, requirementIds: ['req-1'] }],
    requiredReviewDimensions: ['correctness'],
    rollbackClass: 'git_revert',
    assumptions: [],
    sources: {
      requirements: 'explicit_user',
      scope: 'project_policy',
      checks: 'deterministic_inference',
      autonomy: 'project_policy',
    },
    ...overrides,
  };

  return {
    protocolVersion: GOVERNANCE_SERVICE_PROTOCOL_VERSION,
    requestId: 'request-ceiling',
    type: 'submit_command',
    command: {
      type: 'create_task',
      commandId: 'command-ceiling',
      taskId: 'task-1',
      expectedRevision: 0,
      actor: 'model',
      issuedAt: '2026-08-01T13:00:00.000Z',
      projectId: 'project-1',
      contract,
    },
  };
}

const ALLOWED_PATHS = '$.command.contract.autonomy.allowedPaths';
const SOURCE_REQUEST = '$.command.contract.sourceRequest';

describe('protocol decode array ceiling', () => {
  it('accepts an allowedPaths array of exactly MAX_ARRAY_ITEMS', () => {
    const decoded = decodeGovernanceServiceRequest(
      createTaskRequest({
        autonomy: {
          ...(createTaskRequest({}).command.contract.autonomy as object),
          allowedPaths: Array.from({ length: 10_000 }, () => 'packages/governance/**'),
        },
      }),
    );

    expect(decoded.decoded).toBe(true);
  });

  it('rejects an allowedPaths array one item above MAX_ARRAY_ITEMS', () => {
    const decoded = decodeGovernanceServiceRequest(
      createTaskRequest({
        autonomy: {
          ...(createTaskRequest({}).command.contract.autonomy as object),
          allowedPaths: Array.from({ length: 10_001 }, () => 'packages/governance/**'),
        },
      }),
    );

    expect(decoded.decoded).toBe(false);
    if (decoded.decoded) return;
    expect(decoded.issues).toEqual([
      expect.objectContaining({ code: 'resource_limit', path: ALLOWED_PATHS }),
    ]);
  });
});

describe('protocol decode string ceiling', () => {
  it('accepts a sourceRequest of exactly MAX_STRING_LENGTH', () => {
    const decoded = decodeGovernanceServiceRequest(
      createTaskRequest({ sourceRequest: 'a'.repeat(1_000_000) }),
    );

    expect(decoded.decoded).toBe(true);
  });

  it('rejects a sourceRequest one character above MAX_STRING_LENGTH', () => {
    const decoded = decodeGovernanceServiceRequest(
      createTaskRequest({ sourceRequest: 'a'.repeat(1_000_001) }),
    );

    expect(decoded.decoded).toBe(false);
    if (decoded.decoded) return;
    expect(decoded.issues).toEqual([
      expect.objectContaining({ code: 'resource_limit', path: SOURCE_REQUEST }),
    ]);
  });
});
