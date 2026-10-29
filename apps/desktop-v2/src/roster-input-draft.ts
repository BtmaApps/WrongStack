import type { FormDraftCodec } from './durable-form-draft';

/** Unsent per-role roster text inputs for one project. */
export type RosterInputText = {
  teach: string;
  improve: string;
  instruction: string;
  capture: string;
};
export type RosterInputDraft = Record<string, RosterInputText>;
const FIELDS = ['teach', 'improve', 'instruction', 'capture'] as const;
const MAX_ROLES = 200;
const MAX_TEXT = 100_000;

/** Only roles with some typed text are kept; results such as capture outcomes are not inputs. */
export function rosterInputsToKeep(
  inputs: Record<string, Partial<RosterInputText>>,
): RosterInputDraft | null {
  const kept = Object.entries(inputs)
    .map(
      ([role, value]) =>
        [
          role,
          Object.fromEntries(
            FIELDS.map((field) => [field, String(value[field] ?? '')]),
          ) as RosterInputText,
        ] as const,
    )
    .filter(([, value]) => FIELDS.some((field) => value[field].trim()));
  return kept.length ? Object.fromEntries(kept) : null;
}

export const rosterInputCodec: FormDraftCodec<RosterInputDraft> = {
  serialize: (inputs) => ({ version: 1, inputs }),
  parse: (value) => {
    if (value === null) return null;
    const saved = (value ?? {}) as Record<string, unknown>;
    const inputs = saved['inputs'];
    if (
      saved['version'] !== 1 ||
      !inputs ||
      typeof inputs !== 'object' ||
      Array.isArray(inputs) ||
      Object.keys(inputs).length > MAX_ROLES ||
      !Object.entries(inputs).every(([role, row]) => {
        const text = row as Record<string, unknown>;
        return (
          role.length > 0 &&
          role.length <= 100 &&
          !['__proto__', 'constructor', 'prototype'].includes(role) &&
          !!text &&
          typeof text === 'object' &&
          Object.keys(text).every((field) => (FIELDS as readonly string[]).includes(field)) &&
          FIELDS.every(
            (field) =>
              typeof text[field] === 'string' && (text[field] as string).length <= MAX_TEXT,
          )
        );
      })
    )
      throw Error('Saved roster inputs have an unsupported format.');
    return structuredClone(inputs as RosterInputDraft);
  },
};
