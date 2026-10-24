/** Runtime guards for the structured collaboration events carried by FleetBus. */

const ROLE_BY_EVENT = {
  'bug.found': 'bug-hunter',
  'refactor.plan': 'refactor-planner',
  'critic.evaluation': 'critic',
} as const;

type KnownFleetEventType = keyof typeof ROLE_BY_EVENT;

export function validateFleetEventEmission(
  type: string,
  payload: unknown,
  role?: string | undefined,
): string | undefined {
  if (!(type in ROLE_BY_EVENT)) return undefined;
  const knownType = type as KnownFleetEventType;
  const expectedRole = ROLE_BY_EVENT[knownType];
  if (role !== expectedRole) {
    return `${knownType} may only be emitted by role ${expectedRole}; caller role is ${role ?? 'unknown'}`;
  }
  if (!isRecord(payload)) return `${knownType} payload must be an object`;

  switch (knownType) {
    case 'bug.found':
      return validateBugFound(payload);
    case 'refactor.plan':
      return validateRefactorPlan(payload);
    case 'critic.evaluation':
      return validateCriticEvaluation(payload);
  }
}

function validateBugFound(payload: Record<string, unknown>): string | undefined {
  const finding = payload['finding'];
  if (!isRecord(finding)) return 'bug.found payload.finding must be an object';
  if (!isNonEmptyString(finding['id'])) return 'bug.found finding.id must be a non-empty string';
  if (!isNonEmptyString(finding['type']))
    return 'bug.found finding.type must be a non-empty string';
  if (!isOneOf(finding['severity'], ['critical', 'high', 'medium', 'low'])) {
    return 'bug.found finding.severity must be critical|high|medium|low';
  }
  const location = finding['location'];
  if (
    !isRecord(location) ||
    !isNonEmptyString(location['file']) ||
    !isPositiveInteger(location['line'])
  ) {
    return 'bug.found finding.location must contain file and a positive integer line';
  }
  if (!isNonEmptyString(finding['description'])) {
    return 'bug.found finding.description must be a non-empty string';
  }
  if (finding['suggestedFix'] !== undefined && typeof finding['suggestedFix'] !== 'string') {
    return 'bug.found finding.suggestedFix must be a string when provided';
  }
  return undefined;
}

function validateRefactorPlan(payload: Record<string, unknown>): string | undefined {
  const plan = payload['plan'];
  if (!isRecord(plan)) return 'refactor.plan payload.plan must be an object';
  if (!isNonEmptyString(plan['id'])) return 'refactor.plan plan.id must be a non-empty string';
  if (!isStringArray(plan['basedOnBugIds'])) {
    return 'refactor.plan plan.basedOnBugIds must be a string array';
  }
  if (!Array.isArray(plan['phases']) || !plan['phases'].every(isValidPhase)) {
    return 'refactor.plan plan.phases must contain valid numbered phases';
  }
  if (!isOneOf(plan['riskScore'], ['low', 'medium', 'high'])) {
    return 'refactor.plan plan.riskScore must be low|medium|high';
  }
  if (!isNonNegativeInteger(plan['estimatedChangeCount'])) {
    return 'refactor.plan plan.estimatedChangeCount must be a non-negative integer';
  }
  if (!isNonEmptyString(plan['rollbackStrategy'])) {
    return 'refactor.plan plan.rollbackStrategy must be a non-empty string';
  }
  return undefined;
}

function validateCriticEvaluation(payload: Record<string, unknown>): string | undefined {
  const evaluation = payload['evaluation'];
  if (!isRecord(evaluation)) {
    return 'critic.evaluation payload.evaluation must be an object';
  }
  if (!isNonEmptyString(evaluation['id'])) {
    return 'critic.evaluation evaluation.id must be a non-empty string';
  }
  if (!isOneOf(evaluation['subjectType'], ['bug_finding', 'refactor_plan'])) {
    return 'critic.evaluation evaluation.subjectType must be bug_finding|refactor_plan';
  }
  if (!isNonEmptyString(evaluation['subjectId'])) {
    return 'critic.evaluation evaluation.subjectId must be a non-empty string';
  }
  if (
    typeof evaluation['score'] !== 'number' ||
    !Number.isFinite(evaluation['score']) ||
    evaluation['score'] < 0 ||
    evaluation['score'] > 10
  ) {
    return 'critic.evaluation evaluation.score must be between 0 and 10';
  }
  if (!isOneOf(evaluation['verdict'], ['approve', 'needs_revision', 'reject'])) {
    return 'critic.evaluation evaluation.verdict must be approve|needs_revision|reject';
  }
  if (!isStringArray(evaluation['strengths']) || !isStringArray(evaluation['weaknesses'])) {
    return 'critic.evaluation strengths and weaknesses must be string arrays';
  }
  if (!Array.isArray(evaluation['concerns']) || !evaluation['concerns'].every(isValidConcern)) {
    return 'critic.evaluation concerns must contain valid concern objects';
  }
  return undefined;
}

function isValidPhase(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPositiveInteger(value['number']) &&
    isNonEmptyString(value['title']) &&
    isStringArray(value['tasks']) &&
    isOneOf(value['risk'], ['low', 'medium', 'high'])
  );
}

function isValidConcern(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['description'])) return false;
  if (!isOneOf(value['severity'], ['blocking', 'advisory'])) return false;
  const location = value['location'];
  return (
    location === undefined ||
    (isRecord(location) &&
      (location['file'] === undefined || typeof location['file'] === 'string') &&
      isPositiveInteger(location['line']))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && allowed.includes(value);
}
