/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { MutateSymbolOptions } from './ast-symbol-mutator.js';

export interface CodebaseAstReplaceInput extends MutateSymbolOptions {}

export interface CodebaseAstReplaceOutput {
  status: 'ok';
  file: string;
  symbol: string;
  originalRange: { startLine: number; endLine: number };
  newRange: { startLine: number; endLine: number };
  violations?: string[] | undefined;
  /** Mode actually applied: a complete declaration given as `body` is promoted to `full`. */
  appliedTarget?: 'body' | 'full' | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
