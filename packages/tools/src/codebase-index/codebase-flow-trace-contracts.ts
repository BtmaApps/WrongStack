/** Leaf contracts shared by the tool implementation and its result guidance. */

export type EntryPointKind =
  | 'http'
  | 'cli'
  | 'tool'
  | 'handler'
  | 'worker'
  | 'main'
  | 'orchestrator';

export interface DiscoveredEntryPoint {
  symbol: string;
  kind: string;
  entryKind: EntryPointKind;
  domain: string;
  file: string;
  line: number;
  score: number;
}

export interface ExecutionFlowStep {
  step: number;
  depth: number;
  symbol: string;
  kind: string;
  file: string;
  line: number;
  signature: string;
  calledFrom?: string | undefined;
  fileSummary?: string | undefined;
}

export interface ExecutionFlow {
  id: string;
  title: string;
  domain: string;
  entryKind: EntryPointKind;
  entrySymbol: string;
  entryFile: string;
  entryLine: number;
  steps: ExecutionFlowStep[];
}

export interface CodebaseFlowTraceInput {
  /** Optional starting symbol name. When omitted, auto-discovers top project entry points. */
  symbol?: string | undefined;
  /** Optional file filter to disambiguate `symbol` or scope entry-point discovery. */
  file?: string | undefined;
  /** Maximum call depth to trace from each entry point (1..10, default 4). */
  maxDepth?: number | undefined;
  /** Maximum number of execution flows to return (1..20, default 5). */
  maxFlows?: number | undefined;
  /** Maximum steps per execution flow (3..50, default 15). */
  maxSteps?: number | undefined;
  /** When true, persist the execution flows to `.wrongstack/atlas/{flows.json,FLOWS.md}`. */
  persist?: boolean | undefined;
}

export interface CodebaseFlowTraceOutput {
  status: 'ok';
  summary: string;
  entryPoints: DiscoveredEntryPoint[];
  flows: ExecutionFlow[];
  persistedPaths?: { jsonPath: string; markdownPath: string } | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
