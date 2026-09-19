import type { KanbanCheckType } from './task-policy-types.js';

/** Expected file operation for a task's verification scope. */
export interface KanbanExpectedFileChange {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  /** Optional: human-readable note about why this change is expected. */
  note?: string | undefined;
}

/**
 * Immutable snapshot of a completed verification run.
 * Written atomically into the authoritative board record inside the owner transaction.
 */
export interface KanbanVerificationReport {
  taskId: string;
  taskTitle: string;
  boardId: string;
  startedAt: string;
  completedAt: string;
  /** Overall verdict. */
  verdict: 'passed' | 'failed' | 'needs_human' | 'incomplete';
  /** Every check evaluated, in order. */
  checks: KanbanVerificationCheckResult[];
  /** File-scope analysis. */
  fileScope?: KanbanVerificationFileScope | undefined;
  /** Sub-task aggregation (only when task.atomic === true). */
  subtasks?: KanbanVerificationSubtasks | undefined;
  /** Human-readable Markdown summary. */
  markdownSummary: string;
  /** Raw evidence attachments. */
  attachments: KanbanVerificationAttachment[];
  /**
   * Attempt counter from the assignment that produced the verified work.
   * Lets a reviewer tell apart "re-verified attempt 3" from "first attempt
   * that was never run." Optional and backwards-compatible: older reports
   * simply omit it.
   */
  attempt?: number | undefined;
  /**
   * Lease id of the assignment that owned the work. Ties the report to a
   * specific claim so a stale owner's evidence cannot be confused with the
   * current owner's.
   */
  leaseId?: string | undefined;
  /**
   * Board revision at the moment verification ran. Binds the report to a
   * specific version of the task contract so a later edit cannot silently
   * re-frame an old verdict.
   */
  taskRevision?: number | undefined;
  /**
   * Git baseline captured for the file-scope diff. The eventual goal is to
   * capture this at dispatch/claim time (before the worker touches files)
   * rather than at verification time; for now it records whichever snapshot
   * the VerificationContext held when the report was built, preserving the
   * prior behaviour while making the binding explicit and queryable.
   */
  baseline?: KanbanVerificationBaseline | undefined;
  /**
   * Criterion ids the verifier actually exercised with a passing result. Used
   * by `validateDefinitionOfDone` to skip the per-check `passed` gate when
   * the verifier is already authoritative — without this list the agent has
   * to duplicate bookkeeping by calling `update_check` after a successful
   * `verify_completion` run.
   *
   * Backwards-compatible: absent on older reports and on reports produced by
   * the empty-check fast path; both behave exactly as before.
   */
  coveredCheckIds?: string[] | undefined;
}

export interface KanbanVerificationBaseline {
  /** Snapshot id (randomUUID assigned by VerificationContext.captureSnapshot). */
  id: string;
  /** `git rev-parse HEAD` at capture time (empty for an unborn repo). */
  commitHash: string;
  /** `git write-tree` of the full tracked+untracked worktree at capture time. */
  treeHash: string;
  /** ISO timestamp of the capture. */
  capturedAt: string;
}

export interface KanbanBackingRef {
  kind: 'file' | 'test' | 'command' | 'diff';
  path: string;
  summary: string;
}

export interface KanbanVerificationCheckResult {
  checkId: string;
  description: string;
  type: KanbanCheckType;
  /**
   * Post-execution snapshot status. Unlike `KanbanCheckStatus` (which includes
   * 'pending'), this report is always the result of a completed verification
   * run so 'pending' is inapplicable and 'error' captures runtime failures.
   */
  status: 'passed' | 'failed' | 'skipped' | 'error';
  /** Structured evidence payload (depends on check type). */
  evidence: Record<string, unknown>;
  error?: string | undefined;
  /** For agent/council checks: concrete proof references. */
  backingRefs?: KanbanBackingRef[] | undefined;
}

export interface KanbanVerificationFileScope {
  expectedChanges: number;
  actualChanges: number;
  scopeMatches: boolean;
  files: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete';
    expected: boolean;
    linesChanged: number;
  }>;
}

export interface KanbanVerificationSubtasks {
  total: number;
  completed: number;
  failed: number;
  children: Array<{
    taskId: string;
    title: string;
    verdict: 'passed' | 'failed' | 'needs_human' | 'incomplete';
  }>;
}

export interface KanbanVerificationAttachment {
  kind: 'file' | 'test_output' | 'command_output' | 'diff';
  label: string;
  /** Truncated content or path reference. */
  content: string;
  /** Full path when the attachment references a file on disk. */
  path?: string | undefined;
}

/**
 * Verdict produced by the deterministic atomicity rule set.
 *   - 'atomic': small enough to work directly; no decomposition needed.
 *   - 'borderline': between thresholds; treated as atomic unless enforced.
 *   - 'needs_decomposition': too large/vague; should be split before dispatch.
 *   - 'composite': already has children; verified via subtask aggregation,
 *     never worked directly.
 */
export type AtomicityVerdict = 'atomic' | 'borderline' | 'needs_decomposition' | 'composite';

/** Per-criterion outcome inside an atomicity assessment. Score 1 = fully atomic on this axis. */
export interface KanbanAtomicityCriterionResult {
  id: string;
  score: number;
  weight: number;
  reason: string;
}

/**
 * Result of scoring a task against the atomicity rule set.
 * Stamped by addTask/splitTask (board policy mode !== 'off') and by the
 * assess_atomicity tool action; purely advisory unless board mode is 'enforce'.
 */
export interface KanbanAtomicityAssessment {
  verdict: AtomicityVerdict;
  /** Weighted aggregate in [0, 1]; 1 = clearly atomic. */
  score: number;
  criteria: KanbanAtomicityCriterionResult[];
  assessedAt: string;
  assessedBy: 'rules' | 'agent' | 'human';
  /** Hash of the rule-set config so stale assessments are detectable after config changes. */
  configHash?: string | undefined;
}

/** Thresholds and weights for the deterministic atomicity rule set. */
export interface AtomicityRuleSetConfig {
  /** A task estimated above this is penalized on the effort axis. Default 4. */
  maxEstimatedHours?: number | undefined;
  /** Expected file changes above this count are penalized. Default 5. */
  maxExpectedFileChanges?: number | undefined;
  /** Dependency fan-in above this count is penalized. Default 3. */
  maxDependencies?: number | undefined;
  /** Conjunction/enumeration markers in title+description above this are penalized. Default 2. */
  maxScopeMarkers?: number | undefined;
  /** Aggregate score at or above this is 'atomic'. Default 0.7. */
  atomicThreshold?: number | undefined;
  /** Aggregate score below this is 'needs_decomposition'. Default 0.45. */
  decomposeThreshold?: number | undefined;
  /** Per-criterion weight overrides; unknown ids are ignored. */
  weights?: Partial<Record<string, number>> | undefined;
}

/**
 * Completion-gate enforcement for a board.
 *   - 'strict': completion is blocked unless verification passes (managed default).
 *   - 'soft': verification runs and its report/warning events persist, but
 *     completion is never blocked (legacy default).
 *   - 'off': the gate is skipped entirely (mirror boards whose source system
 *     already verified, e.g. SDD runs).
 */
export type KanbanCompletionGateEnforcement = 'strict' | 'soft' | 'off';

export interface KanbanCompletionGatePolicy {
  enforcement: KanbanCompletionGateEnforcement;
  /**
   * How many times the gate may refuse one card before it is parked.
   * Defaults to `DEFAULT_MAX_VERIFICATION_ATTEMPTS` (2) — the task-level form
   * of "two failures in the same place means the model is wrong". A value
   * below 1 is treated as 1; parking cannot be disabled by setting 0, because
   * a card that can never park is the wedge this policy exists to prevent.
   */
  maxVerificationAttempts?: number | undefined;
}

/**
 * Why a card stopped being retried.
 *
 * A parked card is deliberately NOT a third status: it stays `blocked`, which
 * every existing readiness, queue, and projection path already understands.
 * This record is the part those paths could not express — that the block came
 * from an exhausted verification budget rather than an unmet dependency, so
 * the next reader knows retrying it unchanged is pointless.
 *
 * Parked is honest, durable, and reversible: clearing it is what `update_task`
 * and a passing verification already do. It is never a completion state.
 */
export interface KanbanTaskPark {
  /** One sentence: what the gate refused, in the words the gate used. */
  reason: string;
  parkedAt: string;
  /** Refusals counted when the budget ran out. */
  attempts: number;
  /** The refusal's validation issues, so the card carries its own evidence. */
  issues?: string[] | undefined;
}

/** Board-level atomicity policy: whether/how tasks are assessed and decomposed. */
export interface KanbanBoardAtomicityPolicy {
  /**
   * 'off' = never assess; 'assess' (default) = annotate only;
   * 'enforce' = additionally, childless needs_decomposition leaves are not
   * ready for claim/dispatch until split.
   */
  mode: 'off' | 'assess' | 'enforce';
  /** 'auto' = apply proposed splits immediately; 'propose' = park for approval. */
  decomposition: 'auto' | 'propose';
  config?: AtomicityRuleSetConfig | undefined;
}
