import type {
  UserInputAnswer,
  UserInputQuestion,
  UserInputRequest,
  UserInputResponse,
} from '@wrongstack/contracts/types';
import { entries, record } from './engine-values';

export interface QuestionDraft {
  selectedOptionIds: string[];
  text: string;
  delegated: boolean;
}
export type InputDraft = Record<string, QuestionDraft>;
export function parseInputRequest(value: unknown): UserInputRequest | null {
  const request = record(value);
  const tabs = entries(request['tabs']);
  if (
    typeof request['id'] !== 'string' ||
    !request['id'] ||
    typeof request['title'] !== 'string' ||
    tabs.length < 1 ||
    tabs.length > 8
  )
    return null;
  const seen = new Set<string>();
  const seenTabs = new Set<string>();
  const optionalStrings = (row: Record<string, unknown>, names: string[]) =>
    names.every((key) => row[key] === undefined || typeof row[key] === 'string');
  if (!optionalStrings(request, ['description', 'submitLabel'])) return null;
  for (const tab of tabs) {
    if (
      typeof tab['id'] !== 'string' ||
      seenTabs.has(tab['id']) ||
      typeof tab['label'] !== 'string' ||
      !optionalStrings(tab, ['description'])
    )
      return null;
    seenTabs.add(tab['id']);
    const questions = entries(tab['questions']);
    if (questions.length < 1 || questions.length > 12) return null;
    for (const q of questions) {
      if (
        typeof q['id'] !== 'string' ||
        !q['id'] ||
        seen.has(q['id']) ||
        typeof q['prompt'] !== 'string' ||
        !['text', 'single_select', 'multi_select'].includes(String(q['kind']))
      )
        return null;
      seen.add(q['id']);
      if (
        !optionalStrings(q, [
          'description',
          'recommendedText',
          'recommendationReason',
          'placeholder',
        ]) ||
        ['required', 'allowCustomResponse'].some(
          (key) => q[key] !== undefined && typeof q[key] !== 'boolean',
        )
      )
        return null;
      if (
        q['recommendedOptionIds'] !== undefined &&
        (!Array.isArray(q['recommendedOptionIds']) ||
          q['recommendedOptionIds'].some((id: unknown) => typeof id !== 'string'))
      )
        return null;
      if (q['kind'] !== 'text') {
        const options = entries(q['options']);
        if (
          options.length < 2 ||
          options.length > 8 ||
          new Set(options.map((option) => option['id'])).size !== options.length ||
          options.some(
            (option) =>
              typeof option['id'] !== 'string' ||
              typeof option['label'] !== 'string' ||
              !optionalStrings(option, ['description']),
          )
        )
          return null;
      }
    }
  }
  return request as unknown as UserInputRequest;
}
export function recommendedDraft(request: UserInputRequest): InputDraft {
  return Object.fromEntries(
    request.tabs.flatMap((tab) =>
      tab.questions.map((q) => [
        q.id,
        {
          selectedOptionIds: [...(q.recommendedOptionIds ?? [])],
          text: q.recommendedText ?? '',
          delegated: false,
        },
      ]),
    ),
  );
}
export function answerFor(question: UserInputQuestion, draft: InputDraft): UserInputAnswer {
  const value = Object.hasOwn(draft, question.id)
    ? draft[question.id]!
    : { selectedOptionIds: [], text: '', delegated: false };
  const selected =
    question.kind === 'text' || value.delegated
      ? []
      : [...new Set(value.selectedOptionIds)].filter((id) =>
          question.options?.some((option) => option.id === id),
        );
  const text =
    (question.kind === 'text' || question.allowCustomResponse !== false) && !value.delegated
      ? value.text.trim()
      : '';
  const recommended = question.recommendedOptionIds ?? [];
  return {
    questionId: question.id,
    selectedOptionIds: selected,
    ...(text ? { text } : {}),
    delegated: value.delegated,
    usedRecommendation:
      !value.delegated &&
      (recommended.length > 0 || Boolean(question.recommendedText?.trim())) &&
      selected.length === recommended.length &&
      selected.every((id) => recommended.includes(id)) &&
      text === (question.recommendedText ?? '').trim(),
  };
}
export function unanswered(
  request: UserInputRequest,
  draft: InputDraft,
): UserInputQuestion | undefined {
  return request.tabs
    .flatMap((tab) => tab.questions)
    .find((q) => {
      const answer = answerFor(q, draft);
      return (
        (q.kind === 'single_select' &&
          (answer.selectedOptionIds.length > 1 ||
            (answer.selectedOptionIds.length > 0 && Boolean(answer.text)))) ||
        (q.required !== false &&
          !answer.delegated &&
          !answer.selectedOptionIds.length &&
          !answer.text)
      );
    });
}
export function inputResponse(
  request: UserInputRequest,
  draft: InputDraft,
  status: UserInputResponse['status'],
): UserInputResponse {
  if (status === 'cancelled') return { requestId: request.id, status, answers: [] };
  const missing = unanswered(request, draft);
  if (missing) throw new Error(`Answer "${missing.prompt}" before submitting.`);
  return {
    requestId: request.id,
    status,
    answers: request.tabs.flatMap((tab) => tab.questions.map((q) => answerFor(q, draft))),
  };
}
