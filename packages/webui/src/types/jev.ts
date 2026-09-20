export interface JevSettings {
  status: string;
  reason?: string;
  route: string;
  endpoint: string;
  model: string;
  requestTimeoutMs: number;
  keySource: string;
  features: Record<string, boolean>;
}
export interface JevState {
  requestId?: string;
  settings?: JevSettings;
  message?: string;
  error?: string;
  activity?: {
    scope: 'process';
    path?: string;
    writeError?: string;
    entries: Array<{
      id: string;
      at: number;
      feature: string;
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
