/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { ExecutionFlow } from './codebase-flow-trace-contracts.js';
import type { AnchoredSageInsight } from './ecosystem-bridge.js';
import type { FileCommunity } from './louvain.js';

export type TourStage = 'foundation' | 'hub' | 'subsystem' | 'entry-flow';

export type OnboardingPersona = 'junior' | 'experienced' | 'architect' | 'non-technical';

export interface TourStep {
  order: number;
  stage: TourStage;
  title: string;
  file: string;
  lineSpan: { start: number; end: number };
  rank: number;
  inDeg: number;
  outDeg: number;
  symbols: Array<{ name: string; kind: string; line: number; signature: string }>;
  explanation: string;
  /** Detected language/design patterns in the step's declarations (generics, async, inheritance, etc.). */
  languageNotes?: string[] | undefined;
  memories?: AnchoredSageInsight[] | undefined;
}

export interface CodebaseOnboardOutput {
  status: 'ok';
  persona: OnboardingPersona;
  summary: string;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    communities: number;
    entryPoints: number;
  };
  communities: FileCommunity[];
  steps: TourStep[];
  flows: ExecutionFlow[];
  markdown: string;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
