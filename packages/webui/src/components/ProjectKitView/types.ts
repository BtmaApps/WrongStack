export interface KitSchema {
  type?: string;
  description?: string;
  properties?: Record<string, KitSchema>;
  required?: string[];
  default?: unknown;
  [key: string]: unknown;
}
export interface KitSummary {
  name: string;
  description: string;
  effects: 'read' | 'write' | 'external';
  revision: string;
}
export interface KitDetail extends KitSummary {
  guide: string;
  entry: string;
  timeoutMs: number;
  verified: boolean;
  files: string[];
  inputSchema: KitSchema;
  outputSchema: KitSchema;
  tests: Array<{ name: string; input: unknown; expected: unknown }>;
  history: Array<{
    runId: string;
    action: 'verify' | 'run';
    status: 'running' | 'passed' | 'failed';
    revision: string;
    startedAt: string;
    durationMs?: number;
    error?: string;
  }>;
}
export interface KitCatalog {
  projectRoot: string;
  tools: KitSummary[];
  invalid: Array<{ name: string; error: string }>;
}
