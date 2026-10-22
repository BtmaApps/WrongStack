import { describe, expect, it } from 'vitest';
import { verifyAutomationPatch } from '../src/automation/verification.js';
import type { DockerWorkspaceResult } from '../src/docker-workspace.js';

describe('automation verifier cleanup evidence', () => {
  it.each(['removed', 'retained', 'unverified'] as const)(
    'accepts only removed verification workspaces: %s',
    async (cleanup) => {
      const candidate: DockerWorkspaceResult = {
        id: 'candidate',
        ownerToken: 'owner',
        snapshotRevision: 'd'.repeat(40),
        exitCode: 0,
        sourceTree: 'a'.repeat(40),
        inputTree: 'a'.repeat(40),
        outputTree: 'b'.repeat(40),
        imageId: `sha256:${'c'.repeat(64)}`,
        patch: '',
        output: '',
        cleanup: 'removed',
      };
      const result = await verifyAutomationPatch(
        {
          projectRoot: '/project',
          image: candidate.imageId!,
          verification: { commands: [['check']], timeoutMs: 1000 },
        },
        candidate,
        new AbortController().signal,
        async () => ({
          ...candidate,
          inputTree: candidate.outputTree,
          cleanup,
          stepResults: [{ exitCode: 0, durationMs: 1, output: 'passed' }],
        }),
      );
      expect(result.validation.status).toBe(cleanup === 'removed' ? 'passed' : 'failed');
    },
  );
});
