import { describe, expect, it, vi } from 'vitest';
import { verifyAutomationPatch } from '../src/automation/verification.js';
import type { DockerWorkspaceOptions, DockerWorkspaceResult } from '../src/docker-workspace.js';

const tree = 'a'.repeat(40);
const source = 'b'.repeat(40);
const candidate: DockerWorkspaceResult = {
  id: 'candidate',
  ownerToken: 'owner',
  exitCode: 0,
  snapshotRevision: 'c'.repeat(40),
  sourceTree: source,
  inputTree: source,
  outputTree: tree,
  imageId: `sha256:${'c'.repeat(64)}`,
  patch: 'diff --git a/a.ts b/a.ts\n',
  output: 'All tests passed',
  cleanup: 'removed',
};
const job = {
  projectRoot: '/project',
  image: 'trusted:1',
  verification: { commands: [['bun', 'run', 'test']], timeoutMs: 30_000 },
};

describe('independent automation verification', () => {
  it('runs frozen commands in a fresh workspace without agent credentials or conversation', async () => {
    const execute = vi.fn(async (options: DockerWorkspaceOptions) => ({
      ...candidate,
      id: options.id!,
      sourceTree: source,
      inputTree: tree,
      outputTree: tree,
      stepResults: [{ exitCode: 0, durationMs: 12, output: '1 test passed' }],
    }));
    const result = await verifyAutomationPatch(
      job,
      candidate,
      new AbortController().signal,
      execute,
    );
    expect(result.validation.status).toBe('passed');
    expect(result.validation.workspaceTree).toBe(tree);
    expect(result.validation.checks?.[0]).toMatchObject({
      exitCode: 0,
      binding: { executionClass: 'trusted_deterministic' },
    });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      command: 'bun',
      args: ['run', 'test'],
      initialPatch: candidate.patch,
      captureTreeIdentity: true,
      id: candidate.id,
      ownerToken: candidate.ownerToken,
      image: candidate.imageId,
      envNames: [],
    });
    expect(execute.mock.calls[0]?.[0].providerConfigs).toBeUndefined();
    expect(execute.mock.calls[0]?.[0].previousConversationDirectory).toBeUndefined();
  });

  it.each([
    [
      'failed',
      { stepResults: [{ exitCode: 1, durationMs: 1, output: 'test failed' }], exitCode: 1 },
    ],
    ['stale', { sourceTree: 'd'.repeat(40) }],
    ['stale', { inputTree: 'd'.repeat(40) }],
    ['stale', { outputTree: 'd'.repeat(40) }],
    ['stale', { imageId: `sha256:${'d'.repeat(64)}` }],
    ['failed', { stepResults: [] }],
    ['failed', { outputTree: undefined, exitCode: 1, failure: 'Docker command timed out' }],
    ['failed', { outputTree: undefined }],
  ])('never promotes %s evidence to passed', async (status, changes) => {
    const execute = async () => ({
      ...candidate,
      sourceTree: source,
      inputTree: tree,
      outputTree: tree,
      stepResults: [{ exitCode: 0, durationMs: 1, output: '' }],
      ...changes,
    });
    const result = await verifyAutomationPatch(
      job,
      candidate,
      new AbortController().signal,
      execute,
    );
    expect(result.validation.status).toBe(status);
  });

  it('does not trust agent prose or run a verifier without source identity', async () => {
    const execute = vi.fn();
    const result = await verifyAutomationPatch(
      job,
      { ...candidate, outputTree: undefined },
      new AbortController().signal,
      execute,
    );
    expect(result.validation.status).toBe('not-verified');
    expect(execute).not.toHaveBeenCalled();
  });
  it('reports cancellation without promoting successful agent text', async () => {
    const abort = new AbortController();
    const execute = vi.fn(async () => {
      abort.abort();
      return candidate;
    });
    const result = await verifyAutomationPatch(job, candidate, abort.signal, execute);
    expect(result.validation.status).toBe('cancelled');
  });
  it('rejects invalid or excessive command plans', async () => {
    for (const commands of [[], [[]], [['-bad']], [['bun', 'bad\narg']], Array(17).fill(['bun'])]) {
      await expect(
        verifyAutomationPatch(
          { ...job, verification: { ...job.verification, commands } },
          candidate,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    }
  });
  it('bounds the aggregate command plan before persisting or executing it', async () => {
    await expect(
      verifyAutomationPatch(
        {
          ...job,
          verification: {
            commands: [['command', ...Array(9).fill('x'.repeat(8192))]],
            timeoutMs: 1000,
          },
        },
        candidate,
        new AbortController().signal,
      ),
    ).rejects.toThrow('64 KiB');
  });
});
