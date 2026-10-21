/** Browser-safe management projection. The runtime validates the persisted job contract. */
export interface AutomationVerificationSpec {
  commands: string[][];
  timeoutMs: number;
}
export interface AutomationValidation {
  status: 'not-verified' | 'passed' | 'failed' | 'stale' | 'cancelled';
  evidence: Array<'output.log' | 'changes.patch' | 'verification.json' | 'verification.log'>;
  workspaceTree?: string | undefined;
  imageId?: string | undefined;
  planFingerprint?: string | undefined;
  reason?: string | undefined;
  checks?:
    | Array<{
        argv: string[];
        exitCode: number;
        durationMs: number;
        outputSha256: string;
        binding: {
          schemaVersion: 1;
          registryFingerprint: string;
          checkId: string;
          evidenceKind: 'test' | 'typecheck' | 'lint' | 'build' | 'static_analysis';
          handlerVersion: string;
          executionClass: 'trusted_deterministic';
          handlerFingerprint: string;
        };
      }>
    | undefined;
}
export interface AutomationJobInput {
  name: string;
  image: string;
  prompt: string;
  template?: { id: string; version: 1 } | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  envNames: string[];
  credentials?:
    | { profile: string; provider: string; keyLabel: string; envName: string }[]
    | undefined;
  yolo: boolean;
  enabled: boolean;
  timeoutMs: number;
  maxIterations?: number | undefined;
  verification?: AutomationVerificationSpec | undefined;
  intervalMs?: number | undefined;
  schedule?: { type: 'cron'; expression: string; timezone: string } | undefined;
  github?:
    | {
        repository: string;
        events: string[];
        secretEnv: string;
        filters?:
          | {
              mention?: string | undefined;
              label?: string | undefined;
              branch?: string | undefined;
              draft?: boolean | undefined;
              conclusion?: string | undefined;
              excludeBots?: boolean | undefined;
            }
          | undefined;
      }
    | undefined;
}

/** Fresh defaults shared by the two management screens; arrays are never shared. */
export function createAutomationJobInput(): AutomationJobInput {
  return {
    name: '',
    image: '',
    prompt: '',
    envNames: [],
    enabled: true,
    yolo: false,
    timeoutMs: 600_000,
    maxIterations: 40,
  };
}
export interface AutomationJobRecord extends AutomationJobInput {
  id: string;
  projectRoot: string;
  revision?: number | undefined;
  createdAt: number;
  nextRunAt: number | null;
}
export interface AutomationRunRecord {
  continuationRunId?: string | undefined;
  id: string;
  jobId: string;
  subjectKey: string;
  trigger: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: number;
  error?: string | undefined;
  exitCode?: number | undefined;
  result?: AutomationResultView | undefined;
}
export interface AutomationResultView {
  version: 1;
  agentStatus: string | null;
  sessionId: string | null;
  finalText: string | null;
  durationMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    iterations: number | null;
    costUsd: number | null;
    costSource: 'catalog-estimate' | 'unknown';
  };
  changedFiles: string[];
  changedFilesTruncated: boolean;
  validation: AutomationValidation;
}
export interface AutomationStateView {
  jobs: AutomationJobRecord[];
  runs: AutomationRunRecord[];
  workerOnline: boolean;
}
export interface AutomationPreview {
  args: string[];
  nextRunTimes: number[];
  missingReferences: string[];
  filterPreview?: { matches: boolean; reasons: string[] } | undefined;
}
export { VERSIONED_AUTOMATION_TEMPLATES as AUTOMATION_TEMPLATES } from './automation-templates.js';

export function editableAutomationJob(job: AutomationJobInput): AutomationJobInput {
  const {
    name,
    image,
    prompt,
    provider,
    model,
    envNames,
    credentials,
    yolo,
    enabled,
    timeoutMs,
    maxIterations,
    verification,
    intervalMs,
    schedule,
    github,
    template,
  } = job;
  return {
    name,
    image,
    prompt,
    provider,
    model,
    envNames: [...envNames],
    credentials: structuredClone(credentials),
    yolo,
    enabled,
    timeoutMs,
    maxIterations,
    verification: structuredClone(verification),
    intervalMs,
    schedule: structuredClone(schedule),
    github: structuredClone(github),
    template: structuredClone(template),
  };
}

export async function automationRequest<T>(
  route: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<T> {
  const resource = `/api/automation/${route}${sessionId ? `${route.includes('?') ? '&' : '?'}sessionId=${encodeURIComponent(sessionId)}` : ''}`;
  const response = await fetch(resource, {
    method,
    credentials: 'include',
    ...(signal ? { signal } : {}),
    headers: {
      'content-type': 'application/json',
      ...(route.endsWith('/run') ? { 'idempotency-key': crypto.randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Parse defensively: `response.json()` would reject with a bare SyntaxError
  // on a non-JSON body (a reverse-proxy HTML error page, a truncated
  // response) and defeat the status contract below just when it matters —
  // transport-level failures. Read text, tolerate an unparseable body, and
  // let the !response.ok branch report the status; only a SUCCESS response
  // with a non-JSON body is an error, and it says so.
  const text = await response.text();
  let value: (T & { error?: string }) | undefined;
  try {
    value = text ? (JSON.parse(text) as T & { error?: string }) : undefined;
  } catch {
    value = undefined;
  }
  if (!response.ok)
    throw new Error(value?.error ?? `Automation request failed (${response.status})`);
  if (value === undefined)
    throw new Error(`Automation request failed (${response.status}): non-JSON response body`);
  return value;
}
