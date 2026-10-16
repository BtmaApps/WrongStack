// ─── Types (mirror of ProjectAgentLearnStats from project-agent-identity.ts) ──

export interface ProjectAgentLearnStats {
  role: string;
  exists: boolean;
  entryCount: number;
  totalBytes: number;
  lastCapture: string | null;
  cooldownRemainingMs: number;
  sessionCaptureCount: number;
  needsSummarization: boolean;
  hasIdentity: boolean;
  hasConfig: boolean;
  hasKnowledge: boolean;
  conflictCount?: number;
  sharedLearnedExists?: boolean;
  sharedIdentityExists?: boolean;
}
