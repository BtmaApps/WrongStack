import type { FormDraftCodec } from './durable-form-draft';
import type { RosterRecord } from './roster-model';

/** Unsaved runtime override and the stored config it was edited against. */
export interface RosterRuntimeDraft {
  base: RosterRecord;
  draft: RosterRecord;
}
const MAX_JSON = 256 * 1024;
const plain = (value: unknown): value is RosterRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export async function rosterRuntimeDraftKey(role: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(['roster-runtime', role])),
  );
  return `roster-runtime:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export function rosterRuntimeCodec(role: string): FormDraftCodec<RosterRuntimeDraft> {
  return {
    serialize: (value) => ({ version: 1, role, base: value.base, draft: value.draft }),
    parse: (value) => {
      if (value === null) return null;
      const saved = (value ?? {}) as Record<string, unknown>;
      if (
        saved['version'] !== 1 ||
        saved['role'] !== role ||
        !plain(saved['base']) ||
        !plain(saved['draft']) ||
        JSON.stringify(saved).length > MAX_JSON
      )
        throw Error(
          'The saved runtime draft has an unsupported format or belongs to another role.',
        );
      return { base: structuredClone(saved['base']), draft: structuredClone(saved['draft']) };
    },
  };
}
