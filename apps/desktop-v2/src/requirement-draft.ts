import type { RequirementAttachment, RequirementResource } from './RequirementResources';

export const blankRequirementFields = () => ({
  title: '',
  requestType: 'unspecified',
  priority: 'unspecified',
  businessGoal: '',
  expectedOutcome: '',
  scopeNotes: '',
  targetUsers: '',
  constraints: '',
  providedContext: '',
});
export type RequirementFormFields = ReturnType<typeof blankRequirementFields>;
export interface RequirementDraft {
  version: 1;
  original: string;
  fields: RequirementFormFields;
  attachments: RequirementAttachment[];
  resources: RequirementResource[];
  attempt: { fingerprint: string; key: string } | null;
}
export interface RequirementDraftSnapshot {
  revision: number;
  value: unknown;
  updatedAt?: number;
}
export interface ProjectFormDraftStorage<T> {
  get: () => Promise<RequirementDraftSnapshot>;
  save: (value: T | null, expectedRevision: number) => Promise<number>;
}
export type RequirementDraftStorage = ProjectFormDraftStorage<RequirementDraft>;
export function requirementSubmissionFingerprint(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, normalize((input as Record<string, unknown>)[key])]),
      );
    return input;
  };
  return JSON.stringify(normalize(value));
}
export const emptyRequirementDraft = (): RequirementDraft => ({
  version: 1,
  original: '',
  fields: blankRequirementFields(),
  attachments: [],
  resources: [],
  attempt: null,
});
export function parseRequirementDraft(value: unknown): RequirementDraft {
  if (value === null) return emptyRequirementDraft();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Saved requirement draft is invalid.');
  const draft = value as Record<string, unknown>;
  const fields = draft['fields'];
  if (
    draft['version'] !== 1 ||
    typeof draft['original'] !== 'string' ||
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields) ||
    Object.keys(blankRequirementFields()).some(
      (key) => typeof (fields as Record<string, unknown>)[key] !== 'string',
    )
  )
    throw Error('Saved requirement draft has an unsupported format.');
  if (
    !Array.isArray(draft['attachments']) ||
    draft['attachments'].some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.name !== 'string' ||
        typeof item.kind !== 'string' ||
        (typeof item.path === 'string') === (typeof item.url === 'string'),
    )
  )
    throw Error('Saved attachment references are invalid.');
  if (
    !Array.isArray(draft['resources']) ||
    draft['resources'].some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.kind !== 'string' ||
        typeof item.reference !== 'string' ||
        (item.title !== undefined && typeof item.title !== 'string'),
    )
  )
    throw Error('Saved related resources are invalid.');
  const attempt = draft['attempt'];
  if (
    attempt !== null &&
    (!attempt ||
      typeof attempt !== 'object' ||
      typeof (attempt as Record<string, unknown>)['fingerprint'] !== 'string' ||
      typeof (attempt as Record<string, unknown>)['key'] !== 'string')
  )
    throw Error('Saved submission identity is invalid.');
  return draft as unknown as RequirementDraft;
}
export function hasRequirementDraft(draft: RequirementDraft): boolean {
  const defaults = blankRequirementFields();
  return Boolean(
    draft.original ||
      draft.attachments.length ||
      draft.resources.length ||
      draft.attempt ||
      Object.entries(draft.fields).some(
        ([key, value]) => value !== defaults[key as keyof RequirementFormFields],
      ),
  );
}
