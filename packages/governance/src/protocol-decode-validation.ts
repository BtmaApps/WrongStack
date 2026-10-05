import { AUTONOMY_TIERS, GOVERNED_OPERATIONS } from './autonomy-envelope.js';
import {
  GOVERNANCE_OBSERVATION_CATEGORIES,
  GOVERNANCE_OBSERVATION_MAX_PAGE_SIZE,
} from './event-store.js';
import { PLAN_VERSION_SCHEMA_VERSION } from './plan-version.js';
import {
  BASELINE_POLICIES,
  CONTRACT_ASSUMPTION_STATUSES,
  CONTRACT_SOURCES,
  EVIDENCE_KINDS,
  REVIEW_DIMENSIONS,
  ROLLBACK_CLASSES,
  TASK_CONTRACT_SCHEMA_VERSION,
  type TaskContractV1,
  validateTaskContractV1,
} from './task-contract.js';
import { GOVERNANCE_ACTORS } from './transition-engine.js';
import { WORKFLOW_STATES } from './workflow-state.js';

export const MAX_NESTING_DEPTH = 32;

export const MAX_ARRAY_ITEMS = 10_000;

export const MAX_OBJECT_KEYS = 1_000;

export const MAX_STRING_LENGTH = 1_000_000;

/**
 * Hard ceiling on reported issues. The decoder runs on the untrusted side of
 * the IPC boundary and its issue list is serialized straight into the error
 * response, so an input that is *wrong in many places at once* used to cost
 * far more memory than the input itself: one 8 MB frame carrying a two-million
 * entry `capabilities` array produced roughly four million issue objects (an
 * `invalid_value` and a duplicate report per entry), each holding its own path
 * and message string.
 *
 * A caller only ever acts on the first few issues, so the list is truncated
 * with an explicit marker instead of being allowed to outgrow its input. Every
 * issue is created through `issue()`, which makes this the single choke point.
 */
export const MAX_ISSUES = 100;

export type GovernanceProtocolDecodeIssueCode =
  | 'expected_object'
  | 'expected_array'
  | 'unknown_field'
  | 'invalid_value'
  | 'semantic_invalid'
  | 'resource_limit';

export interface GovernanceProtocolDecodeIssue {
  readonly code: GovernanceProtocolDecodeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type MutableIssues = GovernanceProtocolDecodeIssue[];

export type JsonRecord = Record<string, unknown>;

export function issue(
  issues: MutableIssues,
  code: GovernanceProtocolDecodeIssueCode,
  path: string,
  message: string,
): void {
  if (issues.length >= MAX_ISSUES) {
    if (issues.length === MAX_ISSUES) {
      issues.push({
        code: 'resource_limit',
        path: '$',
        message: `Validation stopped after ${MAX_ISSUES} issues.`,
      });
    }
    return;
  }
  issues.push({ code, path, message });
}

export function plainRecord(
  value: unknown,
  path: string,
  issues: MutableIssues,
): JsonRecord | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    issue(issues, 'expected_object', path, `${path} must be a plain JSON object.`);
    return undefined;
  }
  const record = value as JsonRecord;
  if (Object.keys(record).length > MAX_OBJECT_KEYS) {
    issue(issues, 'resource_limit', path, `${path} exceeds the ${MAX_OBJECT_KEYS}-field limit.`);
  }
  return record;
}

export function exactKeys(
  record: JsonRecord,
  allowed: readonly string[],
  path: string,
  issues: MutableIssues,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      issue(issues, 'unknown_field', `${path}.${key}`, `${path}.${key} is not allowed.`);
    }
  }
}

export function stringValue(
  value: unknown,
  path: string,
  issues: MutableIssues,
  allowEmpty = false,
): void {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    issue(issues, 'invalid_value', path, `${path} must be a non-empty string.`);
    return;
  }
  if (value.length > MAX_STRING_LENGTH) {
    issue(
      issues,
      'resource_limit',
      path,
      `${path} exceeds the ${MAX_STRING_LENGTH}-character limit.`,
    );
  }
}

export function timestamp(value: unknown, path: string, issues: MutableIssues): void {
  stringValue(value, path, issues);
  if (typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    issue(issues, 'invalid_value', path, `${path} must be a valid timestamp.`);
  }
}

export function booleanValue(value: unknown, path: string, issues: MutableIssues): void {
  if (typeof value !== 'boolean') {
    issue(issues, 'invalid_value', path, `${path} must be a boolean.`);
  }
}

export function integerValue(
  value: unknown,
  path: string,
  issues: MutableIssues,
  minimum = 0,
): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    issue(
      issues,
      'invalid_value',
      path,
      `${path} must be a safe integer greater than or equal to ${minimum}.`,
    );
  }
}

export function enumValue(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: MutableIssues,
): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    issue(issues, 'invalid_value', path, `${path} has an unsupported value.`);
  }
}

export function arrayValue(
  value: unknown,
  path: string,
  issues: MutableIssues,
  validate: (entry: unknown, entryPath: string, issues: MutableIssues) => void,
): void {
  if (!Array.isArray(value)) {
    issue(issues, 'expected_array', path, `${path} must be an array.`);
    return;
  }
  if (value.length > MAX_ARRAY_ITEMS) {
    issue(issues, 'resource_limit', path, `${path} exceeds the ${MAX_ARRAY_ITEMS}-item limit.`);
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    validate(value[index], `${path}[${index}]`, issues);
  }
}

export function stringArray(value: unknown, path: string, issues: MutableIssues): void {
  arrayValue(value, path, issues, stringValue);
}

export function enumArray(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: MutableIssues,
): void {
  arrayValue(value, path, issues, (entry, entryPath, target) =>
    enumValue(entry, allowed, entryPath, target),
  );
}

export function jsonValue(value: unknown, path: string, issues: MutableIssues, depth = 0): void {
  if (depth > MAX_NESTING_DEPTH) {
    issue(
      issues,
      'resource_limit',
      path,
      `${path} exceeds the ${MAX_NESTING_DEPTH}-level nesting limit.`,
    );
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    stringValue(value, path, issues, true);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issue(issues, 'invalid_value', path, `${path} must contain a finite JSON number.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    arrayValue(value, path, issues, (entry, entryPath, target) =>
      jsonValue(entry, entryPath, target, depth + 1),
    );
    return;
  }
  const record = plainRecord(value, path, issues);
  if (!record) return;
  for (const [key, entry] of Object.entries(record)) {
    jsonValue(entry, `${path}.${key}`, issues, depth + 1);
  }
}

export function objectArray(
  value: unknown,
  path: string,
  issues: MutableIssues,
  validate: (record: JsonRecord, entryPath: string, issues: MutableIssues) => void,
): void {
  arrayValue(value, path, issues, (entry, entryPath, target) => {
    const record = plainRecord(entry, entryPath, target);
    if (record) validate(record, entryPath, target);
  });
}

export function validateAutonomy(value: unknown, path: string, issues: MutableIssues): void {
  const record = plainRecord(value, path, issues);
  if (!record) return;
  exactKeys(
    record,
    [
      'tier',
      'allowedOperations',
      'humanApprovalRequiredFor',
      'allowedPaths',
      'deniedPaths',
      'budget',
      'autoAuthorizePlan',
      'autoReplanLimit',
      'autoResolveReviewFixes',
    ],
    path,
    issues,
  );
  enumValue(record.tier, AUTONOMY_TIERS, `${path}.tier`, issues);
  enumArray(record.allowedOperations, GOVERNED_OPERATIONS, `${path}.allowedOperations`, issues);
  enumArray(
    record.humanApprovalRequiredFor,
    GOVERNED_OPERATIONS,
    `${path}.humanApprovalRequiredFor`,
    issues,
  );
  stringArray(record.allowedPaths, `${path}.allowedPaths`, issues);
  stringArray(record.deniedPaths, `${path}.deniedPaths`, issues);
  const budget = plainRecord(record.budget, `${path}.budget`, issues);
  const budgetFields = [
    'maxChangedFiles',
    'maxChangedLines',
    'maxNewDependencies',
    'maxRetries',
    'maxReplans',
    'maxSubagents',
    'maxWallClockMs',
  ] as const;
  if (budget) {
    exactKeys(budget, budgetFields, `${path}.budget`, issues);
    for (const field of budgetFields) {
      integerValue(budget[field], `${path}.budget.${field}`, issues);
    }
  }
  booleanValue(record.autoAuthorizePlan, `${path}.autoAuthorizePlan`, issues);
  integerValue(record.autoReplanLimit, `${path}.autoReplanLimit`, issues);
  booleanValue(record.autoResolveReviewFixes, `${path}.autoResolveReviewFixes`, issues);
}

export function validateTaskContract(value: unknown, path: string, issues: MutableIssues): void {
  const issueCount = issues.length;
  const record = plainRecord(value, path, issues);
  if (!record) return;
  exactKeys(
    record,
    [
      'schemaVersion',
      'taskId',
      'contractVersion',
      'projectId',
      'sourceRequest',
      'policyVersion',
      'repository',
      'requirements',
      'acceptanceCriteria',
      'autonomy',
      'requiredChecks',
      'requiredReviewDimensions',
      'rollbackClass',
      'assumptions',
      'sources',
    ],
    path,
    issues,
  );
  if (record.schemaVersion !== TASK_CONTRACT_SCHEMA_VERSION) {
    issue(issues, 'invalid_value', `${path}.schemaVersion`, 'Unsupported task contract schema.');
  }
  stringValue(record.taskId, `${path}.taskId`, issues);
  integerValue(record.contractVersion, `${path}.contractVersion`, issues, 1);
  stringValue(record.projectId, `${path}.projectId`, issues);
  stringValue(record.sourceRequest, `${path}.sourceRequest`, issues);
  stringValue(record.policyVersion, `${path}.policyVersion`, issues);

  const repository = plainRecord(record.repository, `${path}.repository`, issues);
  if (repository) {
    exactKeys(repository, ['rootIdentity', 'baselinePolicy'], `${path}.repository`, issues);
    stringValue(repository.rootIdentity, `${path}.repository.rootIdentity`, issues);
    enumValue(
      repository.baselinePolicy,
      BASELINE_POLICIES,
      `${path}.repository.baselinePolicy`,
      issues,
    );
  }
  objectArray(record.requirements, `${path}.requirements`, issues, (entry, entryPath, target) => {
    exactKeys(entry, ['id', 'text', 'acceptanceCriteriaIds'], entryPath, target);
    stringValue(entry.id, `${entryPath}.id`, target);
    stringValue(entry.text, `${entryPath}.text`, target);
    stringArray(entry.acceptanceCriteriaIds, `${entryPath}.acceptanceCriteriaIds`, target);
  });
  objectArray(
    record.acceptanceCriteria,
    `${path}.acceptanceCriteria`,
    issues,
    (entry, entryPath, target) => {
      exactKeys(entry, ['id', 'statement', 'evidenceKinds'], entryPath, target);
      stringValue(entry.id, `${entryPath}.id`, target);
      stringValue(entry.statement, `${entryPath}.statement`, target);
      enumArray(entry.evidenceKinds, EVIDENCE_KINDS, `${entryPath}.evidenceKinds`, target);
    },
  );
  validateAutonomy(record.autonomy, `${path}.autonomy`, issues);
  objectArray(
    record.requiredChecks,
    `${path}.requiredChecks`,
    issues,
    (entry, entryPath, target) => {
      exactKeys(entry, ['id', 'kind', 'required', 'requirementIds'], entryPath, target);
      stringValue(entry.id, `${entryPath}.id`, target);
      enumValue(entry.kind, EVIDENCE_KINDS, `${entryPath}.kind`, target);
      booleanValue(entry.required, `${entryPath}.required`, target);
      stringArray(entry.requirementIds, `${entryPath}.requirementIds`, target);
    },
  );
  enumArray(
    record.requiredReviewDimensions,
    REVIEW_DIMENSIONS,
    `${path}.requiredReviewDimensions`,
    issues,
  );
  enumValue(record.rollbackClass, ROLLBACK_CLASSES, `${path}.rollbackClass`, issues);
  objectArray(record.assumptions, `${path}.assumptions`, issues, (entry, entryPath, target) => {
    exactKeys(entry, ['id', 'statement', 'source', 'status'], entryPath, target);
    stringValue(entry.id, `${entryPath}.id`, target);
    stringValue(entry.statement, `${entryPath}.statement`, target);
    enumValue(entry.source, CONTRACT_SOURCES, `${entryPath}.source`, target);
    enumValue(entry.status, CONTRACT_ASSUMPTION_STATUSES, `${entryPath}.status`, target);
  });
  const sources = plainRecord(record.sources, `${path}.sources`, issues);
  if (sources) {
    exactKeys(sources, ['requirements', 'scope', 'checks', 'autonomy'], `${path}.sources`, issues);
    for (const field of ['requirements', 'scope', 'checks', 'autonomy'] as const) {
      enumValue(sources[field], CONTRACT_SOURCES, `${path}.sources.${field}`, issues);
    }
  }

  if (issues.length === issueCount) {
    const semantic = validateTaskContractV1(record as unknown as TaskContractV1);
    if (!semantic.valid) {
      for (const contractIssue of semantic.issues) {
        issue(issues, 'semantic_invalid', `${path}.${contractIssue.path}`, contractIssue.message);
      }
    }
  }
}

export function validatePlan(value: unknown, path: string, issues: MutableIssues): void {
  const record = plainRecord(value, path, issues);
  if (!record) return;
  exactKeys(
    record,
    [
      'schemaVersion',
      'planId',
      'taskId',
      'planVersion',
      'parentPlanVersion',
      'contractVersion',
      'createdBy',
      'createdAt',
      'changeReason',
      'steps',
      'edges',
    ],
    path,
    issues,
  );
  if (record.schemaVersion !== PLAN_VERSION_SCHEMA_VERSION) {
    issue(issues, 'invalid_value', `${path}.schemaVersion`, 'Unsupported plan schema.');
  }
  stringValue(record.planId, `${path}.planId`, issues);
  stringValue(record.taskId, `${path}.taskId`, issues);
  integerValue(record.planVersion, `${path}.planVersion`, issues, 1);
  if (record.parentPlanVersion !== null) {
    integerValue(record.parentPlanVersion, `${path}.parentPlanVersion`, issues, 1);
  }
  integerValue(record.contractVersion, `${path}.contractVersion`, issues, 1);
  enumValue(record.createdBy, GOVERNANCE_ACTORS, `${path}.createdBy`, issues);
  timestamp(record.createdAt, `${path}.createdAt`, issues);
  stringValue(record.changeReason, `${path}.changeReason`, issues);
  objectArray(record.steps, `${path}.steps`, issues, (entry, entryPath, target) => {
    exactKeys(
      entry,
      [
        'id',
        'title',
        'description',
        'operations',
        'expectedPaths',
        'requirementIds',
        'acceptanceCriteriaIds',
        'requiredCheckIds',
      ],
      entryPath,
      target,
    );
    stringValue(entry.id, `${entryPath}.id`, target);
    stringValue(entry.title, `${entryPath}.title`, target);
    stringValue(entry.description, `${entryPath}.description`, target);
    enumArray(entry.operations, GOVERNED_OPERATIONS, `${entryPath}.operations`, target);
    stringArray(entry.expectedPaths, `${entryPath}.expectedPaths`, target);
    stringArray(entry.requirementIds, `${entryPath}.requirementIds`, target);
    stringArray(entry.acceptanceCriteriaIds, `${entryPath}.acceptanceCriteriaIds`, target);
    stringArray(entry.requiredCheckIds, `${entryPath}.requiredCheckIds`, target);
  });
  objectArray(record.edges, `${path}.edges`, issues, (entry, entryPath, target) => {
    exactKeys(entry, ['fromStepId', 'toStepId'], entryPath, target);
    stringValue(entry.fromStepId, `${entryPath}.fromStepId`, target);
    stringValue(entry.toStepId, `${entryPath}.toStepId`, target);
  });
}

export function validateCommand(value: unknown, path: string, issues: MutableIssues): void {
  const record = plainRecord(value, path, issues);
  if (!record) return;
  const type = record.type;
  const commonKeys = ['type', 'commandId', 'taskId', 'expectedRevision', 'actor', 'issuedAt'];
  if (type === 'create_task') {
    exactKeys(record, [...commonKeys, 'projectId', 'contract'], path, issues);
  } else if (type === 'attach_plan_version') {
    exactKeys(record, [...commonKeys, 'plan'], path, issues);
  } else if (type === 'transition_task') {
    exactKeys(record, [...commonKeys, 'to'], path, issues);
  } else {
    issue(issues, 'invalid_value', `${path}.type`, `${path}.type is not a supported command.`);
    return;
  }
  stringValue(record.commandId, `${path}.commandId`, issues);
  stringValue(record.taskId, `${path}.taskId`, issues);
  integerValue(record.expectedRevision, `${path}.expectedRevision`, issues);
  enumValue(record.actor, GOVERNANCE_ACTORS, `${path}.actor`, issues);
  timestamp(record.issuedAt, `${path}.issuedAt`, issues);
  if (type === 'create_task') {
    stringValue(record.projectId, `${path}.projectId`, issues);
    validateTaskContract(record.contract, `${path}.contract`, issues);
  } else if (type === 'attach_plan_version') {
    validatePlan(record.plan, `${path}.plan`, issues);
  } else {
    enumValue(record.to, WORKFLOW_STATES, `${path}.to`, issues);
  }
}

export function validateObservation(value: unknown, path: string, issues: MutableIssues): void {
  const record = plainRecord(value, path, issues);
  if (!record) return;
  exactKeys(
    record,
    ['observationId', 'projectId', 'taskId', 'source', 'category', 'observedAt', 'payload'],
    path,
    issues,
  );
  stringValue(record.observationId, `${path}.observationId`, issues);
  stringValue(record.projectId, `${path}.projectId`, issues);
  if (record.taskId !== null) stringValue(record.taskId, `${path}.taskId`, issues);
  stringValue(record.source, `${path}.source`, issues);
  enumValue(record.category, GOVERNANCE_OBSERVATION_CATEGORIES, `${path}.category`, issues);
  timestamp(record.observedAt, `${path}.observedAt`, issues);
  const payload = plainRecord(record.payload, `${path}.payload`, issues);
  if (payload) jsonValue(payload, `${path}.payload`, issues);
}

/**
 * Shared cursor/page validation for the two observation reads. Same shape and
 * bounds as `read_evidence_candidates`, so every paginated read on this
 * protocol accepts the same window.
 */
export function observationPageWindow(record: JsonRecord, issues: MutableIssues): void {
  if (record.afterSequence !== undefined) {
    integerValue(record.afterSequence, '$.afterSequence', issues);
  }
  if (record.limit === undefined) return;
  integerValue(record.limit, '$.limit', issues, 1);
  if (typeof record.limit === 'number' && record.limit > GOVERNANCE_OBSERVATION_MAX_PAGE_SIZE) {
    issue(
      issues,
      'resource_limit',
      '$.limit',
      `$.limit must not exceed ${GOVERNANCE_OBSERVATION_MAX_PAGE_SIZE}.`,
    );
  }
}
