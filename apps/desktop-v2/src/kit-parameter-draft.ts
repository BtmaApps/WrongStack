import type { FormDraftCodec } from './durable-form-draft';
import type { KitSchema } from './project-kit-model';

/** Unsent Project Kit parameters, bound to the input contract they were typed against. */
export interface KitParameterDraft {
  kit: string;
  /** SHA-256 of the canonical input schema the values were entered for. */
  schema: string;
  input: unknown;
}
type Path = Array<string | number>;
type Special = 'NaN' | 'Infinity' | '-Infinity';
const specials: Record<Special, number> = {
  NaN: Number.NaN,
  Infinity: Number.POSITIVE_INFINITY,
  '-Infinity': Number.NEGATIVE_INFINITY,
};

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
async function sha256(text: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const kitSchemaFingerprint = (schema: KitSchema) => sha256(canonical(schema));
export async function kitParameterKey(kit: string) {
  return `kit-parameters:${await sha256(kit)}`;
}

/**
 * JSON cannot carry an unfinished numeric field (NaN) or an overflowed one, so
 * their exact positions travel beside the value instead of becoming `null`.
 */
function encode(value: unknown, path: Path, found: Array<{ path: Path; value: Special }>): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    found.push({
      path,
      value: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity',
    });
    return null;
  }
  if (Array.isArray(value))
    return value.map((item, index) => encode(item, [...path, index], found));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encode(item, [...path, key], found)]),
    );
  return value;
}
function restore(input: unknown, special: Array<{ path: Path; value: Special }>) {
  const root = { input: structuredClone(input) };
  for (const entry of special) {
    let parent: unknown = root;
    const path: Path = ['input', ...entry.path];
    for (const step of path.slice(0, -1))
      parent = (parent as Record<string | number, unknown>)?.[step];
    const last = path.at(-1)!;
    if (
      !parent ||
      typeof parent !== 'object' ||
      !Object.hasOwn(parent, last) ||
      (parent as Record<string | number, unknown>)[last] !== null
    )
      throw Error('Saved kit parameters have an unsupported format.');
    (parent as Record<string | number, unknown>)[last] = specials[entry.value];
  }
  return root.input;
}

export function kitParameterCodec(kit: string): FormDraftCodec<KitParameterDraft> {
  return {
    serialize: (draft) => {
      const special: Array<{ path: Path; value: Special }> = [];
      const input = encode(draft.input, [], special);
      return { version: 1, kit: draft.kit, schema: draft.schema, input, special };
    },
    parse: (value) => {
      if (value === null) return null;
      const saved = value as Record<string, unknown>;
      if (
        !saved ||
        typeof saved !== 'object' ||
        saved['version'] !== 1 ||
        saved['kit'] !== kit ||
        typeof saved['schema'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(saved['schema']) ||
        !Object.hasOwn(saved, 'input') ||
        !Array.isArray(saved['special']) ||
        !saved['special'].every((entry) => {
          const row = entry as Record<string, unknown>;
          return (
            Array.isArray(row?.['path']) &&
            row['path'].every(
              (step) =>
                (typeof step === 'string' &&
                  !['__proto__', 'constructor', 'prototype'].includes(step)) ||
                (Number.isInteger(step) && (step as number) >= 0),
            ) &&
            typeof row['value'] === 'string' &&
            Object.hasOwn(specials, row['value'])
          );
        })
      )
        throw Error('Saved kit parameters have an unsupported format or belong to another kit.');
      return {
        kit,
        schema: saved['schema'],
        input: restore(saved['input'], saved['special'] as Array<{ path: Path; value: Special }>),
      };
    },
  };
}
