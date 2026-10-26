/**
 * Requirements Intake — question selection.
 *
 * Deterministic rules decide which intake questions to ask:
 *  - questions whose field was already provided at creation are skipped;
 *  - questions whose field is already answerable from existing project data
 *    (passed as `knownFields`) are skipped;
 *  - `description_scope` is always skipped because the original request
 *    itself answers "what should be changed or created?".
 *
 * Never re-ask for information that is already present on the record.
 */
import { ulid } from '@wrongstack/core/utils';
import {
  DEFAULT_INTAKE_QUESTIONS,
  type IntakeQuestionTemplate,
  QUESTION_ID_PREFIX,
} from './constants.js';
import type { CreateIntakeInput, IntakeQuestion, RequirementIntakeRecord } from './types.js';

/** Catalog fields that map to a create-input property directly. */
const FIELD_TO_INPUT_PROPERTY: Readonly<Record<string, (input: CreateIntakeInput) => boolean>> = {
  description_scope: () => true, // always answered by the original request
  business_goal: (input) =>
    input.businessGoal !== undefined && input.businessGoal.trim().length > 0,
  target_users: (input) => (input.targetUsers?.length ?? 0) > 0,
  expected_outcome: (input) =>
    input.expectedOutcome !== undefined && input.expectedOutcome.trim().length > 0,
  project_component: (input) => (input.providedContext?.length ?? 0) > 0,
  constraints: (input) => (input.constraints?.length ?? 0) > 0,
  related_resources: (input) => (input.relatedResources?.length ?? 0) > 0,
  priority: (input) => input.priority !== undefined && input.priority !== 'unspecified',
  attachments: (input) => (input.attachments?.length ?? 0) > 0,
};

function makeQuestion(
  template: IntakeQuestionTemplate,
  order: number,
  skipped: boolean,
): IntakeQuestion {
  return {
    id: `${QUESTION_ID_PREFIX}${ulid()}`,
    field: template.field,
    question: template.question,
    required: typeof template.required === 'boolean' ? template.required : false,
    status: skipped ? 'skipped' : 'unanswered',
    order,
  };
}

/**
 * Build the initial question set for a new record. Skipped questions are
 * retained with status `skipped` so the record documents why they were never
 * asked; `pendingQuestions()` only surfaces unanswered ones.
 */
export function buildInitialQuestions(
  input: CreateIntakeInput,
  catalog: readonly IntakeQuestionTemplate[] = DEFAULT_INTAKE_QUESTIONS,
): IntakeQuestion[] {
  const known = new Set((input.knownFields ?? []).map((field) => field.trim()));
  return catalog.map((template, index) => {
    const answeredByInput = Object.hasOwn(FIELD_TO_INPUT_PROPERTY, template.field)
      ? (FIELD_TO_INPUT_PROPERTY[template.field]?.(input) ?? false)
      : false;
    const skipped = answeredByInput || known.has(template.field);
    return makeQuestion(template, index, skipped);
  });
}

/** Questions still awaiting an answer on a record. */
export function pendingQuestions(record: RequirementIntakeRecord): IntakeQuestion[] {
  return record.questions
    .filter((question) => question.status === 'unanswered')
    .sort((a, b) => a.order - b.order);
}

/** Catalog fields that map to a record property directly. */
const FIELD_TO_RECORD_PROPERTY: Readonly<
  Record<string, (record: RequirementIntakeRecord) => boolean>
> = {
  description_scope: () => true, // always answered by the original request
  business_goal: (record) =>
    record.businessGoal !== undefined && record.businessGoal.trim().length > 0,
  target_users: (record) => (record.targetUsers?.length ?? 0) > 0,
  expected_outcome: (record) =>
    record.expectedOutcome !== undefined && record.expectedOutcome.trim().length > 0,
  scope_notes: (record) => record.scopeNotes !== undefined && record.scopeNotes.trim().length > 0,
  project_component: (record) => (record.providedContext?.length ?? 0) > 0,
  provided_context: (record) => (record.providedContext?.length ?? 0) > 0,
  constraints: (record) => (record.constraints?.length ?? 0) > 0,
  related_resources: (record) => (record.relatedResources?.length ?? 0) > 0,
  priority: (record) => record.priority !== undefined && record.priority !== 'unspecified',
  attachments: (record) => (record.attachments?.length ?? 0) > 0,
};

export function isFieldPresentOnRecord(record: RequirementIntakeRecord, field: string): boolean {
  if (Object.hasOwn(FIELD_TO_RECORD_PROPERTY, field)) {
    if (FIELD_TO_RECORD_PROPERTY[field]?.(record)) return true;
  }
  return record.answers?.some((answer) => answer.field === field) ?? false;
}

/** Merge a question template into a record's question list (no duplicates). */
export function upsertQuestion(
  record: RequirementIntakeRecord,
  template: IntakeQuestionTemplate,
): boolean {
  const existing = record.questions.find((question) => question.field === template.field);
  if (existing) return false;
  const skipped = isFieldPresentOnRecord(record, template.field);
  record.questions.push(makeQuestion(template, record.questions.length, skipped));
  return !skipped;
}
