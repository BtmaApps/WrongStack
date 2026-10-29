export class PatchError extends Error {}

/**
 * Apply a JSON Patch (RFC 6902 subset) to a document. See the task prompt for the full contract.
 *
 * @param {unknown} doc
 * @param {Array<{ op: string, path: string, from?: string, value?: unknown }>} patch
 * @returns {unknown}
 */
export function applyPatch(doc, patch) {
  throw new PatchError('not implemented');
}
