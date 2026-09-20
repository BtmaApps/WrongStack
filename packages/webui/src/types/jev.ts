export interface JevSettings {
  status: string;
  reason?: string;
  route: string;
  endpoint: string;
  model: string;
  requestTimeoutMs: number;
  keySource: string;
  features: Record<string, boolean>;
  contextStrategy?: 'hybrid' | 'intelligent' | 'selective';
  recallTurnContext?: boolean;
  readiness?: Record<
    string,
    { state: 'disabled' | 'account-required' | 'blocked' | 'conditional'; reason: string }
  >;
}
export interface JevState {
  requestId?: string;
  settings?: JevSettings;
  message?: string;
  error?: string;
  checks?: {
    running: boolean;
    report?: {
      at: number;
      route: string;
      model: string;
      passed: number;
      total: number;
      cases: Array<{
        feature: string;
        name: string;
        expected: string;
        actual: string;
        ok: boolean;
        ms: number;
        note?: string;
      }>;
    };
  };
  activity?: {
    scope: 'process';
    path?: string;
    writeError?: string;
    entries: Array<{
      id: string;
      at: number;
      feature: string;
      purpose?: 'runtime' | 'self-test';
      project: string;
      route: string;
      model: string;
      durationMs: number;
      outcome: 'answered' | 'incomplete' | 'fallback';
      reason?: string;
      inputTokens?: number;
      outputTokens?: number;
      answers?: Record<string, string | number>;
    }>;
  };
}
