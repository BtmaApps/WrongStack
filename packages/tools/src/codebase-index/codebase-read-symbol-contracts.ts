/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { AnchoredSageInsight } from './ecosystem-bridge.js';

export interface CodebaseReadSymbolOutput {
  file: string;
  symbol: string;
  kind: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  /** Numbered source code in standard `N→content` display format. */
  text: string;
  /** Active SAGE memories anchored to this symbol or file, when present. */
  relatedMemories?: AnchoredSageInsight[] | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
