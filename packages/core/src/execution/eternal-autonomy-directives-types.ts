import { execFile } from 'node:child_process';

import { promisify } from 'node:util';

export const execFileP = promisify(execFile);

/**
 * Sentinel returned by `brainstormTask` when the LLM declares the goal
 * fully accomplished. Distinct from `null` (which means "brainstorm
 * failed / no actionable task right now") so the engine can count
 * consecutive DONE answers toward a real stop.
 */
export const BRAINSTORM_DONE = Symbol('brainstorm-done');
