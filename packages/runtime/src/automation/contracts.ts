export interface AutomationJobSpec {
  name: string;
  projectRoot: string;
  image: string;
  prompt: string;
  template?: { id: string; version: 1 } | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  envNames: string[];
  credentials?: CredentialReference[] | undefined;
  yolo: boolean;
  intervalMs?: number | undefined;
  schedule?: CronSchedule | undefined;
  enabled: boolean;
  timeoutMs: number;
  maxIterations?: number | undefined;
  github?:
    | {
        repository: string;
        events: string[];
        secretEnv: string;
        filters?: GitHubFilters | undefined;
      }
    | undefined;
}
export interface AutomationJob extends AutomationJobSpec {
  id: string;
  createdAt: number;
  nextRunAt: number | null;
  /** Legacy records without a revision are revision 1. */
  revision?: number | undefined;
}
export interface AutomationRun {
  id: string;
  jobId: string;
  job: AutomationJob;
  subjectKey: string;
  trigger: 'manual' | 'schedule' | 'github';
  deliveryKey: string;
  payloadHash?: string | undefined;
  context: string;
  createdAt: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  leaseId?: string | undefined;
  workerId?: string | undefined;
  leaseExpiresAt?: number | undefined;
  startedAt?: number | undefined;
  completedAt?: number | undefined;
  exitCode?: number | undefined;
  artifactDirectory?: string | undefined;
  error?: string | undefined;
  result?: import('./result.js').AutomationResult | undefined;
}
export interface AutomationState {
  version: 1;
  jobs: AutomationJob[];
  runs: AutomationRun[];
}

export function validateJobSpec(spec: AutomationJobSpec): void {
  if (!spec || typeof spec !== 'object') throw new Error('Invalid automation definition');
  const fields = new Set([
    'maxIterations',
    'template',
    'name',
    'projectRoot',
    'image',
    'prompt',
    'provider',
    'model',
    'envNames',
    'credentials',
    'yolo',
    'intervalMs',
    'schedule',
    'revision',
    'enabled',
    'timeoutMs',
    'github',
    'id',
    'createdAt',
    'nextRunAt',
  ]);
  if (Object.keys(spec).some((key) => !fields.has(key)))
    throw new Error('Unknown automation definition field');
  for (const [field, limit] of [
    ['name', 128],
    ['projectRoot', 4096],
    ['image', 256],
    ['prompt', 16_384],
  ] as const) {
    const value = spec?.[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0'))
      throw new Error(`Invalid automation ${field}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(spec.image))
    throw new Error('Invalid automation image');
  if (
    !Array.isArray(spec.envNames) ||
    spec.envNames.length > 32 ||
    spec.envNames.some((name) => typeof name !== 'string' || !isCredentialEnvName(name))
  )
    throw new Error('Invalid automation environment references');
  if (typeof spec.yolo !== 'boolean') throw new Error('Invalid automation permission mode');
  if (
    spec.template !== undefined &&
    (!spec.template ||
      typeof spec.template !== 'object' ||
      Array.isArray(spec.template) ||
      Object.keys(spec.template).some((key) => !['id', 'version'].includes(key)) ||
      spec.template.version !== 1 ||
      !VERSIONED_AUTOMATION_TEMPLATES.some((template) => template.id === spec.template!.id))
  )
    throw new Error('Unknown automation template version');
  if (
    spec.maxIterations !== undefined &&
    (!Number.isSafeInteger(spec.maxIterations) ||
      spec.maxIterations < 1 ||
      spec.maxIterations > 1000)
  )
    throw new Error('Automation iterations must be 1 to 1000');
  if (spec.credentials !== undefined) {
    if (!Array.isArray(spec.credentials) || spec.credentials.length > 16)
      throw new Error('Invalid automation credential references');
    const names = new Set(spec.envNames);
    const providers = new Set<string>();
    for (const ref of spec.credentials) {
      if (
        !ref ||
        typeof ref !== 'object' ||
        Array.isArray(ref) ||
        Object.keys(ref).some(
          (key) => !['profile', 'provider', 'keyLabel', 'envName'].includes(key),
        ) ||
        typeof ref.envName !== 'string' ||
        typeof ref.profile !== 'string' ||
        typeof ref.provider !== 'string' ||
        !isCredentialEnvName(ref.envName) ||
        names.has(ref.envName) ||
        providers.has(ref.provider) ||
        !/^[\w-]{1,64}$/.test(ref.profile) ||
        !/^[\w.-]{1,128}$/.test(ref.provider) ||
        typeof ref.keyLabel !== 'string' ||
        !ref.keyLabel.trim() ||
        ref.keyLabel.length > 128
      )
        throw new Error('Invalid automation credential reference');
      names.add(ref.envName);
      providers.add(ref.provider);
    }
  }
  if (typeof spec.enabled !== 'boolean') throw new Error('Invalid automation enabled flag');
  if (spec.schedule !== undefined) {
    if (spec.intervalMs !== undefined) throw new Error('Choose cron or interval, not both');
    validateCronSchedule(spec.schedule);
  }
  const revision = (spec as AutomationJob).revision;
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1))
    throw new Error('Invalid automation revision');
  if (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs < 1000 || spec.timeoutMs > 86_400_000)
    throw new Error('Invalid automation timeout');
  if (
    spec.intervalMs !== undefined &&
    (!Number.isSafeInteger(spec.intervalMs) ||
      spec.intervalMs < 60_000 ||
      spec.intervalMs > 365 * 86_400_000)
  )
    throw new Error('Automation interval must be between one minute and one year');
  for (const value of [spec.provider, spec.model])
    if (
      value !== undefined &&
      (typeof value !== 'string' ||
        !value.trim() ||
        value.length > 256 ||
        /[\x00-\x1f]/.test(value))
    )
      throw new Error('Invalid automation model reference');
  if (spec.github !== undefined) {
    if (
      Object.keys(spec.github).some(
        (key) => !['repository', 'events', 'secretEnv', 'filters'].includes(key),
      )
    )
      throw new Error('Unknown GitHub trigger field');
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(spec.github.repository) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec.github.secretEnv) ||
      !Array.isArray(spec.github.events) ||
      !spec.github.events.length ||
      spec.github.events.length > 16 ||
      spec.github.events.some(
        (event) => typeof event !== 'string' || !/^[a-z_]+(?:\.[a-z_]+)?$/.test(event),
      )
    )
      throw new Error('Invalid GitHub automation trigger');
    if (spec.github.filters !== undefined) validateGitHubFilters(spec.github.filters);
  }
}

import { VERSIONED_AUTOMATION_TEMPLATES } from '@wrongstack/webui-protocol';
import type { CredentialReference } from '../credential-reference.js';
import { isCredentialEnvName } from '../credential-reference.js';
import { type GitHubFilters, validateGitHubFilters } from './github-filters.js';
import { type CronSchedule, validateCronSchedule } from './schedule.js';
