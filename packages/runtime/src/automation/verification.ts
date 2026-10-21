import { createHash } from 'node:crypto';
import {
  calculateVerificationCheckRegistryFingerprint,
  createVerificationCheckBinding,
  type VerificationCheckDescriptor,
} from '@wrongstack/governance';
import type { AutomationValidation, AutomationVerificationSpec } from '@wrongstack/webui-protocol';
import {
  type DockerWorkspaceOptions,
  type DockerWorkspaceResult,
  runDockerWorkspace,
} from '../docker-workspace.js';

export function validateAutomationVerification(raw: AutomationVerificationSpec): void {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((key) => !['commands', 'timeoutMs'].includes(key)) ||
    !Number.isSafeInteger(raw.timeoutMs) ||
    raw.timeoutMs < 1000 ||
    raw.timeoutMs > 3_600_000 ||
    !Array.isArray(raw.commands) ||
    !raw.commands.length ||
    raw.commands.length > 16
  )
    throw new Error(
      'Verification requires 1 to 16 argv commands and a timeout of 1 to 3600 seconds',
    );
  for (const argv of raw.commands) {
    if (
      !Array.isArray(argv) ||
      !argv.length ||
      argv.length > 64 ||
      argv.some((arg) => typeof arg !== 'string' || arg.length > 8192 || /[\x00-\x1f]/.test(arg)) ||
      !argv[0]?.trim() ||
      argv[0].startsWith('-')
    )
      throw new Error('Invalid verification command argv');
  }
  if (Buffer.byteLength(JSON.stringify(raw.commands)) > 64 * 1024)
    throw new Error('Verification commands must fit within 64 KiB');
}

/** The host authors the plan; agent text is never accepted as check evidence. */
export async function verifyAutomationPatch(
  job: {
    projectRoot: string;
    image: string;
    verification?: AutomationVerificationSpec | undefined;
  },
  candidate: DockerWorkspaceResult,
  signal: AbortSignal,
  execute: (options: DockerWorkspaceOptions) => Promise<DockerWorkspaceResult> = runDockerWorkspace,
): Promise<{ validation: AutomationValidation; output: string }> {
  const validation: AutomationValidation = { status: 'not-verified', evidence: [] };
  const spec = job.verification;
  if (!spec) return { validation, output: '' };
  validateAutomationVerification(spec);
  if (
    candidate.exitCode !== 0 ||
    candidate.patch === null ||
    !candidate.sourceTree ||
    !candidate.outputTree ||
    !candidate.imageId ||
    candidate.cleanup !== 'removed'
  ) {
    validation.reason =
      'Successful execution, removed candidate container and captured source/tree/image identities are required.';
    return { validation, output: '' };
  }
  const commands = structuredClone(spec.commands);
  const descriptors: VerificationCheckDescriptor[] = commands.map((argv, index) => ({
    id: `automation.check-${index + 1}`,
    evidenceKind: 'static_analysis',
    handlerVersion: `v1-${createHash('sha256').update(JSON.stringify(argv)).digest('hex')}`,
    executionClass: 'trusted_deterministic',
  }));
  const planFingerprint = calculateVerificationCheckRegistryFingerprint(descriptors);
  validation.planFingerprint = planFingerprint;
  validation.workspaceTree = candidate.outputTree;
  validation.imageId = candidate.imageId;
  try {
    signal.throwIfAborted();
    const [first, ...rest] = commands;
    const checked = await execute({
      id: candidate.id,
      ownerToken: candidate.ownerToken,
      projectRoot: job.projectRoot,
      image: candidate.imageId,
      command: first![0]!,
      args: first!.slice(1),
      followupCommands: rest,
      initialPatch: candidate.patch,
      envNames: [],
      captureTreeIdentity: true,
      timeoutMs: spec.timeoutMs,
      signal,
    });
    signal.throwIfAborted();
    validation.checks = (checked.stepResults ?? [])
      .slice(0, commands.length)
      .map((step, index) => ({
        argv: commands[index]!,
        exitCode: step.exitCode,
        durationMs: step.durationMs,
        outputSha256: step.outputSha256 ?? createHash('sha256').update(step.output).digest('hex'),
        binding: createVerificationCheckBinding(
          planFingerprint,
          descriptors[index]!,
        ) as NonNullable<AutomationValidation['checks']>[number]['binding'],
      }));
    if (
      (checked.sourceTree !== undefined && checked.sourceTree !== candidate.sourceTree) ||
      (checked.imageId !== undefined && checked.imageId !== candidate.imageId) ||
      (checked.inputTree !== undefined && checked.inputTree !== candidate.outputTree) ||
      (checked.outputTree !== undefined && checked.outputTree !== candidate.outputTree)
    ) {
      validation.status = 'stale';
      validation.reason = 'Source, image or candidate tree changed before or during verification.';
    } else if (
      checked.exitCode !== 0 ||
      checked.failure ||
      !checked.sourceTree ||
      !checked.inputTree ||
      !checked.outputTree ||
      !checked.imageId ||
      validation.checks.length !== commands.length ||
      validation.checks.some((check) => check.exitCode !== 0) ||
      checked.stepResults?.some((step) => step.outputTruncated && !step.outputSha256)
    ) {
      validation.status = 'failed';
      validation.reason = checked.failure ?? 'A required check failed or did not execute.';
    } else validation.status = 'passed';
    validation.evidence = ['verification.json', 'verification.log'];
    return { validation, output: checked.output.slice(0, 1_000_000) };
  } catch (error) {
    validation.status = signal.aborted ? 'cancelled' : 'failed';
    validation.reason =
      error instanceof Error ? error.message.slice(0, 1000) : 'Verification failed';
    return { validation, output: '' };
  }
}
