/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { InvariantViolation } from './ast-invariant-engine.js';
import type { ImpactCallSite } from './codebase-impact-analysis-contracts.js';
import type { AnchoredFileHealth, AnchoredSageInsight } from './ecosystem-bridge.js';
import type { StructuralChangeKind } from './fingerprint.js';

export interface DiffAffectedSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  directCallers: number;
  transitiveCallers: number;
}

export interface DiffChangedFileReport {
  file: string;
  status: 'added' | 'modified' | 'deleted';
  changeKind: StructuralChangeKind;
  modifiedSymbols: string[];
  invariantViolations: InvariantViolation[];
}

export interface CodebaseDiffImpactOutput {
  status: 'ok';
  baseRef: string;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  changedFiles: DiffChangedFileReport[];
  affectedSymbols: DiffAffectedSymbol[];
  totalCallSites: number;
  affectedProductionFiles: string[];
  affectedTestFiles: string[];
  invariantViolations: Array<InvariantViolation & { file: string }>;
  callSites: ImpactCallSite[];
  recommendedActionPlan: string[];
  relatedMemories?: AnchoredSageInsight[] | undefined;
  fileHealthAlerts?: AnchoredFileHealth[] | undefined;
  persistedOverlayPath?: string | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
