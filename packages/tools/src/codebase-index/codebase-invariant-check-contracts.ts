/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { InvariantViolation } from './ast-invariant-engine.js';

export interface CodebaseInvariantCheckOutput {
  valid: boolean;
  /** False when the language has no invariant rules — `valid` then proves nothing. */
  verified: boolean;
  violations: InvariantViolation[];
  summary: string;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
