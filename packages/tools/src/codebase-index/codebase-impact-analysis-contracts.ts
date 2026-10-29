/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { AnchoredFileHealth, AnchoredSageInsight } from './ecosystem-bridge.js';

export interface ImpactCallSite {
  file: string;
  line: number;
  callerName: string;
  callerKind: string;
  callType: string;
  isTest: boolean;
  /** A caller of a caller: reached through the transitive tree, not a direct use. */
  indirect?: boolean | undefined;
}

export interface ImpactAnalysisOutput {
  status: 'ok';
  symbol: string;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  totalCallSites: number;
  affectedProductionFiles: string[];
  affectedTestFiles: string[];
  callSites: ImpactCallSite[];
  recommendedActionPlan: string[];
  /** False when the symbol could not be resolved in the index. */
  symbolFound?: boolean;
  /** True when a previous generation's cached answer was served during a refresh. */
  stale?: boolean | undefined;
  /** Active SAGE memories anchored to this symbol or its affected files. */
  relatedMemories?: AnchoredSageInsight[] | undefined;
  /** WrongTrace file fragility / thrashing / lock alerts for affected files. */
  fileHealthAlerts?: AnchoredFileHealth[] | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
