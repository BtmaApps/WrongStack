import type { KanbanBoard, KanbanTask, KanbanVerificationReport } from '../../types.js';
import type {
  KanbanLifecycleValidationIssue,
  KanbanTaskTransitionCheckInput,
  KanbanTaskTransitionInput,
} from '../../types-operations.js';
import { subtaskInputFingerprint, taskInputFingerprint } from '../../verification/task-inputs.js';
import { nowIso } from '../basic-helpers.js';

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function requireDetail(
  issues: KanbanLifecycleValidationIssue[],
  field: string,
  valid: boolean,
  message: string,
): void {
  if (!valid) issues.push({ code: 'task-detail-missing', field, message });
}

export function validateDefinitionOfDone(
  task: KanbanTask,
  report?: KanbanVerificationReport,
  options: { requireCriteria?: boolean | undefined; board?: KanbanBoard | undefined } = {},
): KanbanLifecycleValidationIssue[] {
  const issues: KanbanLifecycleValidationIssue[] = [];
  const requireCriteria = options.requireCriteria !== false;
  const checks = task.successCriteria ?? [];
  const effectiveReport = report ?? task.verificationReport;
  if (effectiveReport) {
    const ownershipMismatch =
      effectiveReport.taskId !== task.id ||
      (options.board !== undefined && effectiveReport.boardId !== options.board.id) ||
      (effectiveReport.leaseId !== undefined &&
        effectiveReport.leaseId !== task.assignment?.leaseId) ||
      (effectiveReport.attempt !== undefined &&
        effectiveReport.attempt !== task.assignment?.attempt);
    if (ownershipMismatch) {
      issues.push({
        code: 'review-evidence-missing',
        field: 'verificationReport',
        message:
          'Verification belongs to a different task, board, lease or attempt. Re-run verification for the current card.',
      });
    }
    if (
      effectiveReport.inputFingerprint !== undefined &&
      effectiveReport.inputFingerprint !== taskInputFingerprint(task)
    ) {
      issues.push({
        code: 'review-evidence-missing',
        field: 'verificationReport',
        message:
          'The task or executable acceptance criteria changed after verification. Re-run verification for the current definition.',
      });
    }
    if (effectiveReport.verdict !== 'passed') {
      issues.push({
        code: 'acceptance-criteria-incomplete',
        field: 'verificationReport',
        message: `Task verification verdict is "${effectiveReport.verdict}". Only "passed" allows Done.`,
      });
    }
    if (
      effectiveReport.subtaskInputFingerprint !== undefined &&
      (!options.board ||
        effectiveReport.subtaskInputFingerprint !== subtaskInputFingerprint(options.board, task))
    ) {
      issues.push({
        code: 'review-evidence-missing',
        field: 'verificationReport',
        message:
          'Descendant task definitions, ownership or acceptance changed after parent verification. Re-run parent verification against the current board.',
      });
    }
  }

  const coveredByVerifier = new Set(effectiveReport?.coveredCheckIds ?? []);
  const currentCriterionIds = new Set(checks.map((check) => check.id));

  const checkFingerprint = (check: { description: string; type?: string | undefined }) =>
    `${check.description}\u0001${check.type ?? ''}`;
  const reportFingerprint = new Map<string, string>();
  const reportedChecks =
    (
      effectiveReport as
        | { checks?: Array<{ checkId?: string; description: string; type?: string }> }
        | undefined
    )?.checks ?? [];
  for (const reported of reportedChecks) {
    if (reported.checkId) {
      reportFingerprint.set(reported.checkId, checkFingerprint(reported));
    }
  }
  const fingerprintMatches = checks.every(
    (check) => reportFingerprint.get(check.id) === checkFingerprint(check),
  );
  const coveredAllCurrent =
    coveredByVerifier.size === checks.length &&
    fingerprintMatches &&
    checks.every((check) => coveredByVerifier.has(check.id));
  const noCurrentFailures = checks.every((check) => check.status !== 'failed');
  const verifierPassedAll =
    coveredByVerifier.size > 0 &&
    effectiveReport?.verdict === 'passed' &&
    coveredAllCurrent &&
    noCurrentFailures &&
    checks.every((check) => currentCriterionIds.has(check.id));

  const unverifiedExecutable = checks.filter((check) => {
    const needsVerifier =
      (check.type !== 'manual' && check.type !== 'review') ||
      (check.escalation !== undefined && check.escalation !== 'none');
    if (!needsVerifier) return false;
    return (
      effectiveReport?.verdict !== 'passed' ||
      !fingerprintMatches ||
      !effectiveReport.checks.some(
        (result) => result.checkId === check.id && result.status === 'passed',
      ) ||
      (effectiveReport.coveredCheckIds !== undefined && !coveredByVerifier.has(check.id))
    );
  });
  if (unverifiedExecutable.length) {
    issues.push({
      code: 'acceptance-criteria-incomplete',
      field: 'successCriteria',
      message: `Executable acceptance criteria need passing verifier evidence for their current inputs (${unverifiedExecutable.map((check) => check.id).join(', ')}). Run verify_completion; manually setting a passed flag does not execute a check.`,
    });
  }
  if (
    task.expectedFileChanges?.length &&
    (!effectiveReport?.fileScope?.scopeMatches ||
      !task.expectedFileChanges.every((expected) =>
        effectiveReport.fileScope!.files.some(
          (actual) =>
            actual.expected &&
            actual.path.replaceAll('\\', '/') === expected.path.replaceAll('\\', '/') &&
            actual.operation === expected.operation,
        ),
      ))
  ) {
    issues.push({
      code: 'review-evidence-missing',
      field: 'verificationReport',
      message:
        'The declared file contract requires a matching file-scope verification report. Run verify_completion with the pre-work baseline.',
    });
  }

  if (requireCriteria && !checks.length) {
    issues.push({
      code: 'acceptance-criteria-incomplete',
      field: 'successCriteria',
      message:
        'Done requires at least one acceptance criterion, and this card has none. ' +
        'Call kanban add_check with what would prove the work correct, then pass it.',
    });
  } else if (!verifierPassedAll && checks.some((check) => check.status !== 'passed')) {
    const unmet = checks.filter((check) => check.status !== 'passed');
    issues.push({
      code: 'acceptance-criteria-incomplete',
      field: 'successCriteria',
      message:
        `Done requires every acceptance criterion to be explicitly passed; ${unmet.length} of ` +
        `${checks.length} still ${unmet.length === 1 ? 'is' : 'are'} not ` +
        `(${unmet.map((check) => `"${check.description}" [${check.status}] (id=${check.id.slice(0, 8)})`).join(', ')}). ` +
        'Re-call transition_task with `tickChecks: [{checkId, checkStatus: "passed"}]` per failing id, ' +
        'or call kanban update_check with checkStatus: "passed" for each. ' +
        'If a criterion no longer applies, kanban remove_check drops it — ' +
        'never pass one that did not actually hold.',
    });
  }

  if (task.atomic && !effectiveReport) {
    issues.push({
      code: 'review-evidence-missing',
      field: 'verificationReport',
      message:
        'Atomic tasks require a completed verification report (run verify_completion) before Done.',
    });
  }
  return issues;
}

export function validateDoneEvidence(
  board: KanbanBoard,
  task: KanbanTask,
  input: KanbanTaskTransitionCheckInput,
  issues: KanbanLifecycleValidationIssue[],
): void {
  issues.push(...validateDefinitionOfDone(task, task.verificationReport, { board }));
  if (!hasText(input.action)) {
    issues.push({
      code: 'review-evidence-missing',
      message:
        'Done requires reviewer action text. Pass `transitionAction` on this transition_task ' +
        'call describing what was accepted (an evidence URL via `attachmentUrl` is optional).',
    });
  }
}

export function validateTickChecks(
  task: KanbanTask,
  tickChecks: readonly { checkId: string; checkStatus: 'passed' | 'failed' | 'skipped' }[],
): KanbanLifecycleValidationIssue[] {
  const checks = task.successCriteria ?? [];
  const issues: KanbanLifecycleValidationIssue[] = [];
  for (const tick of tickChecks) {
    const existing = checks.find((check) => check.id === tick.checkId);
    if (!existing) {
      issues.push({
        code: 'tickChecks-unknown-id',
        field: 'tickChecks',
        message:
          `tickChecks references unknown checkId "${tick.checkId}". ` +
          'Read the ids from kanban get_task and retry.',
      });
      continue;
    }
    if (existing.type !== 'manual') {
      issues.push({
        code: 'acceptance-criteria-incomplete',
        field: 'tickChecks',
        message:
          `tickChecks may only flip manual criteria; "${existing.description}" ` +
          `is type "${existing.type}" — the verifier owns it. ` +
          'Use kanban remove_check to drop a criterion that no longer applies.',
      });
    }
  }
  return issues;
}

export function applyTickChecksToSnapshot(
  task: KanbanTask,
  tickChecks: KanbanTaskTransitionInput['tickChecks'],
): KanbanTask {
  if (!tickChecks?.length) return task;
  const issues = validateTickChecks(task, tickChecks);
  if (issues.length > 0) return task;
  const now = nowIso();
  const tickById = new Map(tickChecks.map((tick) => [tick.checkId, tick]));
  return {
    ...task,
    successCriteria: (task.successCriteria ?? []).map((check) => {
      const tick = tickById.get(check.id);
      if (!tick || check.type !== 'manual') return check;
      return {
        ...check,
        status: tick.checkStatus,
        checkedBy: 'agent',
        checkedAt: now,
      };
    }),
  };
}

export function preflightManagedTransition(
  board: KanbanBoard,
  task: KanbanTask,
  input: KanbanTaskTransitionCheckInput,
): KanbanLifecycleValidationIssue[] {
  const issues: KanbanLifecycleValidationIssue[] = [];

  if (input.to === 'running') {
    const assignment = task.assignment;
    const hasLease =
      assignment?.status === 'running' &&
      [
        assignment.leaseId,
        assignment.claimedAt,
        assignment.heartbeatAt,
        assignment.leaseExpiresAt,
      ].every((value) => typeof value === 'string' && value.trim().length > 0);
    if (!hasLease) {
      issues.push({
        code: 'running-lease-missing',
        field: 'assignment',
        message:
          'The Running gate requires the card to carry leaseId, claimedAt, heartbeatAt, and leaseExpiresAt. Move it into Running first via /kanban task assign or /kanban task dispatch.',
      });
    }
  }

  if (input.to === 'review' || input.to === 'done') {
    if (!task.assignment?.lastResult) {
      issues.push({
        code: 'review-evidence-missing',
        field: 'assignment.lastResult',
        message:
          'Review/Done evidence requires the card to carry an assignment.lastResult. Dispatch the worker through the agentic supervisor so it records implementation output.',
      });
    }
  }

  if (input.to === 'done') {
    const effectiveTask = applyTickChecksToSnapshot(task, input.tickChecks);
    issues.push(
      ...validateDefinitionOfDone(effectiveTask, effectiveTask.verificationReport, {
        requireCriteria: true,
        board,
      }),
    );
    if (task.atomic && task.childTaskIds && task.childTaskIds.length > 0) {
      const missingChildren = task.childTaskIds.filter(
        (childId) => !board.tasks.some((entry) => entry.id === childId),
      );
      if (missingChildren.length > 0) {
        issues.push({
          code: 'atomic-children-unresolved',
          field: 'childTaskIds',
          message: `Atomic parent references unresolved children (${missingChildren.join(', ')}). Resolve them via the kanban tool before retrying.`,
        });
      }
      const incompleteChildren = board.tasks.filter(
        (entry) => task.childTaskIds!.includes(entry.id) && entry.status !== 'completed',
      );
      if (incompleteChildren.length > 0) {
        const ids = incompleteChildren.map((entry) => entry.id).join(', ');
        issues.push({
          code: 'atomic-children-incomplete',
          field: 'childTaskIds',
          message: `Atomic parent's children must be completed before Done (pending: ${ids}).`,
        });
      }
    }
  }

  if (input.tickChecks?.length) {
    const tickIssues = validateTickChecks(task, input.tickChecks);
    for (const issue of tickIssues) {
      issues.push(issue);
    }
  }

  return issues;
}
