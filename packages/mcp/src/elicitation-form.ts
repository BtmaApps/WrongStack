import { randomUUID } from 'node:crypto';
import type { UserInputAnswer, UserInputQuestion, UserInputRequest } from '@wrongstack/core/types';
import {
  type ElicitationField,
  type ElicitationRequester,
  type MCPElicitationRequest,
  type MCPElicitationResult,
  validateElicitationContent,
} from './elicitation.js';

/** Re-asks after an answer the schema rejects, before giving up. */
const MAX_ATTEMPTS = 3;
const CONFIRM_QUESTION = 'confirm';

function questionId(index: number): string {
  return `f${index}`;
}

function optionId(index: number): string {
  return `o${index}`;
}

function bounds(min: number | undefined, max: number | undefined, unit = ''): string | undefined {
  if (min !== undefined && max !== undefined) return `Between ${min} and ${max}${unit}.`;
  if (min !== undefined) return `At least ${min}${unit}.`;
  if (max !== undefined) return `At most ${max}${unit}.`;
  return undefined;
}

function describe(field: ElicitationField): string | undefined {
  const notes: (string | undefined)[] = [field.description];
  if (field.kind === 'string') {
    notes.push(field.format ? `Format: ${field.format}.` : undefined);
    notes.push(bounds(field.minLength, field.maxLength, ' characters'));
  } else if (field.kind === 'number' || field.kind === 'integer') {
    notes.push(field.kind === 'integer' ? 'A whole number.' : 'A number.');
    notes.push(bounds(field.minimum, field.maximum));
  } else if (field.kind === 'multi-enum') {
    notes.push(bounds(field.minItems, field.maxItems, ' choices'));
  }
  const text = notes.filter(Boolean).join(' ');
  return text || undefined;
}

function toQuestion(field: ElicitationField, index: number): UserInputQuestion {
  const base = {
    id: questionId(index),
    prompt: field.title ?? field.name,
    description: describe(field),
    required: field.required,
  };
  switch (field.kind) {
    case 'string':
      return { ...base, kind: 'text', recommendedText: field.default, placeholder: field.format };
    case 'number':
    case 'integer':
      return {
        ...base,
        kind: 'text',
        recommendedText: field.default === undefined ? undefined : String(field.default),
      };
    case 'boolean':
      return {
        ...base,
        kind: 'single_select',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        recommendedOptionIds:
          field.default === undefined ? undefined : [field.default ? 'yes' : 'no'],
      };
    case 'enum':
    case 'multi-enum': {
      const defaults = field.kind === 'enum' ? [field.default] : (field.default ?? []);
      const recommended = field.options
        .map((option, i) => (defaults.includes(option.value) ? optionId(i) : undefined))
        .filter((id): id is string => id !== undefined);
      return {
        ...base,
        kind: field.kind === 'enum' ? 'single_select' : 'multi_select',
        options: field.options.map((option, i) => ({ id: optionId(i), label: option.label })),
        recommendedOptionIds: recommended.length > 0 ? recommended : undefined,
      };
    }
  }
}

function toUserInputRequest(request: MCPElicitationRequest, problem?: string): UserInputRequest {
  const questions: UserInputQuestion[] =
    request.fields.length > 0
      ? request.fields.map(toQuestion)
      : [
          {
            id: CONFIRM_QUESTION,
            prompt: 'Go ahead?',
            kind: 'single_select',
            required: true,
            options: [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ],
          },
        ];
  const description = [
    request.message,
    `Only share what you are comfortable sending to "${request.server}".`,
    problem ? `The last answer was not accepted: ${problem}.` : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    id: `mcp-elicitation-${randomUUID()}`,
    title: `MCP server "${request.server}" is asking for input`,
    description,
    submitLabel: `Send to ${request.server}`,
    tabs: [{ id: 'form', label: request.server, questions }],
  };
}

/** The value one answer carries, or undefined when the user left it empty or delegated it. */
function answerValue(field: ElicitationField, answer: UserInputAnswer | undefined): unknown {
  if (!answer || answer.delegated) return undefined;
  switch (field.kind) {
    case 'string':
      return answer.text?.trim() ? answer.text : undefined;
    case 'number':
    case 'integer':
      return answer.text?.trim() || undefined;
    case 'boolean': {
      const picked = answer.selectedOptionIds[0];
      return picked === 'yes' ? true : picked === 'no' ? false : undefined;
    }
    case 'enum':
    case 'multi-enum': {
      const values = answer.selectedOptionIds
        .map((id) => field.options[Number(id.slice(1))]?.value)
        .filter((v): v is string => v !== undefined);
      if (field.kind === 'enum') return values[0];
      return values;
    }
  }
}

/**
 * Put a server's elicitation in front of the user as a `clarify`-style form on
 * the run that made the call (or `fallback` when the server asks outside a
 * call), and turn the answers back into schema-checked content.
 *
 * No surface to show it on answers `cancel`; the user dismissing the form is an
 * explicit `decline`. An answer the schema rejects is asked again with the
 * reason, a few times, before giving up.
 */
export async function elicitViaUserInput(
  request: MCPElicitationRequest,
  fallback?: ElicitationRequester | undefined,
): Promise<MCPElicitationResult> {
  const target = request.requester ?? fallback;
  if (!target) return { action: 'cancel' };
  let problem: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (request.signal.aborted) return { action: 'cancel' };
    const response = await target.requestUserInput(
      toUserInputRequest(request, problem),
      request.signal,
    );
    if (!response || request.signal.aborted) return { action: 'cancel' };
    if (response.status !== 'submitted') return { action: 'decline' };
    const byId = new Map(response.answers.map((answer) => [answer.questionId, answer]));
    if (request.fields.length === 0) {
      return byId.get(CONFIRM_QUESTION)?.selectedOptionIds[0] === 'yes'
        ? { action: 'accept', content: {} }
        : { action: 'decline' };
    }
    const content: Record<string, unknown> = {};
    request.fields.forEach((field, i) => {
      content[field.name] = answerValue(field, byId.get(questionId(i)));
    });
    const checked = validateElicitationContent(request.fields, content);
    if (checked.ok) return { action: 'accept', content: checked.value };
    problem = checked.error;
  }
  return { action: 'cancel' };
}
