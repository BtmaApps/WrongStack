/** Browser-safe management projection. The runtime validates the persisted job contract. */
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
export interface AutomationJobRecord extends AutomationJobInput {
  id: string;
  projectRoot: string;
  revision?: number | undefined;
  createdAt: number;
  nextRunAt: number | null;
}
export interface AutomationRunRecord {
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
  validation: { status: 'not-verified'; evidence: Array<'output.log' | 'changes.patch'> };
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
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(value.error ?? `Automation request failed (${response.status})`);
  return value;
}
