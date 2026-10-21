export interface AutomationPullRequestPlan {
  version: 1;
  runId: string;
  repository: string;
  base: string;
  branch: string;
  baseCommit: string;
  sourceTree: string;
  candidateTree: string;
  patchSha256: string;
  verificationSha256: string;
  title: string;
  body: string;
  files: string[];
  createdAt: number;
  fingerprint: string;
  target?: { sourceRunId: string; number: number; headCommit: string } | undefined;
}

export interface AutomationPullRequestReceipt {
  fingerprint: string;
  commit: string;
  number: number;
  url: string;
  draft: true;
}

export interface AutomationCIResult {
  commit: string;
  status: 'unknown' | 'pending' | 'passed' | 'failed' | 'stale';
  checkedAt: number;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    details?: string | undefined;
  }>;
  fingerprint?: string | undefined;
}

export interface AutomationPullRequestView {
  suggestedTarget?: { repository: string; base: string; title: string } | undefined;
  plan: AutomationPullRequestPlan | null;
  receipt: AutomationPullRequestReceipt | null;
  ci: AutomationCIResult | null;
  followUpRunId?: string | undefined;
  publicationCommit?: string | undefined;
}
