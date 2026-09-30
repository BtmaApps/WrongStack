/**
 * Regression: a runtime-attachment claim that SUCCEEDS but does not match the
 * requested identities/capabilities must still be RELEASED.
 *
 * `provisionAttachment` (packages/governance/src/runtime-compatibility.ts)
 * claims a runtime attachment from the governance daemon. When the claim
 * succeeds (`ok === true`) the daemon has already issued a live attachment
 * (control + model grants). If the response then fails `attachmentClaimMatches`
 * (e.g. it came back for a different model client than requested), the code
 * must release that attachment before falling back to legacy — the same
 * contract its two sibling post-claim failure paths follow. It used to return
 * with cleanup 'not_required' and leave a live attachment (and its grants)
 * behind on the daemon.
 */
import { describe, expect, it, vi } from 'vitest';
import { prepareGovernanceCompatibilityRuntimeWithAdapters } from '../src/runtime-compatibility.js';

const PROJECT = '/proj';
// A real model-safe capability (GOVERNANCE_RUNTIME_MODEL_CAPABILITIES).
const MODEL_CAP = 'task_read';

function makeToken(grantId: string): string {
  return `wsg_${grantId}.${'s'.repeat(40)}`;
}

function futureIso(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

/** Minimal adapter seam: a live daemon with a readable broker, plus a stub
 *  project client that answers `claim_runtime_attachment` with `claim`. */
function makeAdapters(claim: unknown) {
  const metadata = {
    pid: 4242,
    instanceId: 'inst-1',
    projectKey: 'key-1',
    projectRoot: PROJECT,
  };
  const client = {
    request: vi.fn(async (body: unknown) => {
      const type = (body as { type?: string }).type;
      if (type === 'claim_runtime_attachment') return claim;
      return { ok: true, result: { type: 'unknown' } };
    }),
  };
  const adapters = {
    inspect: vi.fn(async () => ({ kind: 'live' as const, metadata })),
    readAttachmentBroker: vi.fn(async () => ({
      kind: 'present' as const,
      broker: {
        projectId: PROJECT,
        pid: metadata.pid,
        instanceId: metadata.instanceId,
        projectKey: metadata.projectKey,
        projectRoot: metadata.projectRoot,
        expiresAt: futureIso(),
        credential: { token: makeToken('broker'), projectId: PROJECT, clientId: 'broker' },
      },
    })),
    connectModel: vi.fn(async () => ({ connected: true as const, client })),
    connectAttached: vi.fn(),
    connectLaunched: vi.fn(),
    launch: vi.fn(),
  };
  return { adapters: adapters as never, client };
}

function baseOptions() {
  return {
    projectRoot: PROJECT,
    projectId: PROJECT,
    adminClientId: 'admin-1',
    modelClientId: 'model-1',
    modelCapabilities: [MODEL_CAP] as const,
  };
}

describe('provisionAttachment — releases a successful-but-mismatched claim', () => {
  it('does not leave a live attachment behind when the claim mismatches', async () => {
    const controlGrantId = 'grant-control-1';
    const modelGrantId = 'grant-model-1';
    // A SUCCESSFUL claim whose model grant is for the WRONG client, so the
    // response does not match the requested identity — yet the daemon issued a
    // real attachment.
    const claim = {
      ok: true,
      result: {
        type: 'runtime_attachment_claimed',
        control: {
          grant: {
            grantId: controlGrantId,
            projectId: PROJECT,
            clientId: 'admin-1',
            status: 'active',
            capabilities: [
              'workspace_snapshot_record',
              'runtime_attachment_release',
              'daemon_status_read',
            ],
            issuedAt: futureIso(),
            expiresAt: futureIso(),
          },
          credential: { token: makeToken(controlGrantId), projectId: PROJECT, clientId: 'admin-1' },
        },
        model: {
          grant: {
            grantId: modelGrantId,
            projectId: PROJECT,
            clientId: 'WRONG-model-client', // mismatches options.modelClientId
            status: 'active',
            capabilities: [MODEL_CAP],
            issuedAt: futureIso(),
            expiresAt: futureIso(),
          },
          credential: {
            token: makeToken(modelGrantId),
            projectId: PROJECT,
            clientId: 'WRONG-model-client',
          },
        },
      },
    };

    const { adapters } = makeAdapters(claim);
    const result = await prepareGovernanceCompatibilityRuntimeWithAdapters(baseOptions(), adapters);

    // Falls back to legacy on the mismatched claim …
    expect(result.mode).toBe('legacy');
    if (result.mode !== 'legacy') throw new Error('expected legacy fallback');
    // … having reached the attach phase (not bailed at validation) …
    expect(result.phase).toBe('attach');
    expect(result.code).toBe('attachment_rejected');
    // … and because the claim succeeded, a live attachment existed, so cleanup
    // must NOT be the 'no attachment was created' value.
    expect(result.cleanup).not.toBe('not_required');
  });

  it('a server-rejected claim (ok:false) needs no release (not_required is correct)', async () => {
    const { adapters } = makeAdapters({ ok: false, error: { code: 'forbidden', message: 'no' } });
    const result = await prepareGovernanceCompatibilityRuntimeWithAdapters(baseOptions(), adapters);

    expect(result.mode).toBe('legacy');
    if (result.mode !== 'legacy') throw new Error('expected legacy fallback');
    expect(result.phase).toBe('attach');
    expect(result.code).toBe('attachment_rejected');
    // Nothing was attached server-side, so 'not_required' is the correct label.
    expect(result.cleanup).toBe('not_required');
  });
});

/**
 * Regression (sibling of the attachment-release case above, different phase):
 * `provisionModel` issues a model capability grant from the governance daemon.
 * When the issuance SUCCEEDS (`ok === true`) but the response fails
 * `modelGrantMatches` (e.g. it came back for a different model client than
 * requested), a real grant is live in the daemon registry and MUST be revoked
 * before falling back to legacy — the same contract the function's two own
 * connection-failure paths follow. It used to skip the revoke and rely only on
 * `cleanupFailedProvision`, which for an `attached` source merely stops the
 * lease (`session.stop()`), leaving the abandoned grant valid until its TTL on
 * a long-lived / shared daemon.
 */
describe('provisionModel — revokes a successful-but-mismatched model grant', () => {
  /** Adapter seam that connects an `existingAdmin` session straight to
   *  `provisionModel` (source 'attached'). The fake session answers
   *  `issue_capability_grant` with `issue` and records every revoke. */
  function makeModelAdapters(issue: unknown) {
    const revoked: string[] = [];
    const session = {
      request: vi.fn(async (body: unknown) => {
        const type = (body as { type?: string }).type;
        if (type === 'issue_capability_grant') return issue;
        if (type === 'revoke_capability_grant') {
          revoked.push((body as { grantId?: string }).grantId ?? '');
          return { ok: true, result: { type: 'capability_grant_revoked' } };
        }
        return { ok: true, result: { type: 'unknown' } };
      }),
      stop: vi.fn(),
    };
    const adapters = {
      connectAttached: vi.fn(async () => ({ connected: true as const, session })),
      inspect: vi.fn(),
      launch: vi.fn(),
      connectLaunched: vi.fn(),
      connectModel: vi.fn(),
      readAttachmentBroker: vi.fn(),
    } as never;
    return { adapters, revoked };
  }

  function modelOptions() {
    return {
      ...baseOptions(),
      existingAdmin: {
        grantId: 'admin-grant',
        credential: { token: makeToken('admin-grant'), projectId: PROJECT, clientId: 'admin-1' },
      },
    };
  }

  it('revokes the issued grant when it does not match the requested identity', async () => {
    const grantId = 'grant-model-1';
    // A SUCCESSFUL issuance for the WRONG model client — a real grant exists
    // in the daemon registry, but the response fails modelGrantMatches.
    const issue = {
      ok: true,
      result: {
        type: 'capability_grant_issued',
        grant: {
          grantId,
          projectId: PROJECT,
          clientId: 'WRONG-model-client', // mismatches options.modelClientId
          status: 'active',
          capabilities: [MODEL_CAP],
          issuedAt: futureIso(),
          expiresAt: futureIso(),
        },
        credential: {
          token: makeToken(grantId),
          projectId: PROJECT,
          clientId: 'WRONG-model-client',
        },
      },
    };

    const { adapters, revoked } = makeModelAdapters(issue);
    const result = await prepareGovernanceCompatibilityRuntimeWithAdapters(
      modelOptions(),
      adapters,
    );

    expect(result.mode).toBe('legacy');
    if (result.mode !== 'legacy') throw new Error('expected legacy fallback');
    expect(result.code).toBe('model_grant_rejected');
    // The grant was issued, so the client that walked away must have revoked it.
    expect(revoked).toContain(grantId);
  });

  it('a server-rejected issuance (ok:false) is not revoked (nothing was issued)', async () => {
    const { adapters, revoked } = makeModelAdapters({
      ok: false,
      error: { code: 'permission_denied', message: 'denied' },
    });
    const result = await prepareGovernanceCompatibilityRuntimeWithAdapters(
      modelOptions(),
      adapters,
    );

    expect(result.mode).toBe('legacy');
    if (result.mode !== 'legacy') throw new Error('expected legacy fallback');
    expect(result.code).toBe('model_grant_rejected');
    // Nothing was issued server-side, so no revoke should be sent.
    expect(revoked).toEqual([]);
  });
});
