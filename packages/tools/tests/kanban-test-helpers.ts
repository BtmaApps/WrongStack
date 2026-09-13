import { expect } from 'vitest';
import type { KanbanToolErrorCode, KanbanToolFailure } from '../src/kanban-tool-results.js';

/**
 * Assert that a kanban tool call (or handler) rejected with the tool's error
 * contract: a thrown error whose `kanbanCode` is `code`, optionally carrying
 * `messagePart` in its message. Returns the error for further assertions.
 */
export async function expectKanbanError(
  promise: Promise<unknown>,
  code: KanbanToolErrorCode,
  messagePart?: string | RegExp,
): Promise<KanbanToolFailure> {
  let caught: unknown;
  let resolved: unknown;
  try {
    resolved = await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected a ${code} rejection, got ${JSON.stringify(resolved)}`).toBeInstanceOf(
    Error,
  );
  const error = caught as KanbanToolFailure;
  expect(error.kanbanCode, error.message).toBe(code);
  if (typeof messagePart === 'string') expect(error.message).toContain(messagePart);
  else if (messagePart) expect(error.message).toMatch(messagePart);
  return error;
}
