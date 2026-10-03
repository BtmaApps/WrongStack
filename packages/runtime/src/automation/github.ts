import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DefaultSecretScrubber } from '@wrongstack/core/security';
import type { AutomationRun } from './contracts.js';
import { evaluateGitHubFilters } from './github-filters.js';
import type { AutomationStore } from './store.js';

export function verifyGitHubSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const provided = Buffer.from(signature.slice(7), 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function ingestGitHubEvent(
  store: AutomationStore,
  jobId: string,
  body: Buffer,
  headers: {
    signature?: string | undefined;
    delivery?: string | undefined;
    event?: string | undefined;
  },
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AutomationRun | null> {
  if (body.byteLength > 128 * 1024) throw new Error('GitHub event exceeds 128 KB');
  const job = (await store.snapshot()).jobs.find((item) => item.id === jobId);
  if (!job?.enabled || !job.github) throw new Error('GitHub trigger is unavailable');
  if (!verifyGitHubSignature(body, headers.signature, env[job.github.secretEnv] ?? ''))
    throw new Error('Invalid GitHub signature');
  if (
    !headers.delivery ||
    !/^[\w-]{1,128}$/.test(headers.delivery) ||
    !headers.event ||
    !/^[a-z_]{1,64}$/.test(headers.event)
  )
    throw new Error('GitHub delivery identity is required');
  const payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid GitHub event');
  const repository = payload['repository'] as { full_name?: unknown } | undefined;
  if (repository?.full_name !== job.github.repository)
    throw new Error('GitHub repository does not match this job');
  const action = typeof payload['action'] === 'string' ? payload['action'] : '';
  const event = action ? `${headers.event}.${action}` : headers.event;
  if (!job.github.events.includes(event) && !job.github.events.includes(headers.event)) return null;
  if (!evaluateGitHubFilters(job.github.filters, payload).matches) return null;
  const issue = payload['pull_request'] ?? payload['issue'];
  let number =
    typeof issue === 'object' && issue !== null
      ? (issue as { number?: unknown }).number
      : payload['number'];
  const checks = (payload['check_run'] ?? payload['check_suite']) as
    | { pull_requests?: Array<{ number?: unknown }> }
    | undefined;
  if (
    number === undefined &&
    Array.isArray(checks?.pull_requests) &&
    checks.pull_requests.length === 1
  )
    number = checks.pull_requests[0]?.number;
  const subject =
    typeof number === 'number' && Number.isSafeInteger(number) && number > 0
      ? `${job.github.repository}#${number}`
      : typeof payload['ref'] === 'string'
        ? `${job.github.repository}:ref:${payload['ref']}`
        : `${job.github.repository}:delivery:${headers.delivery}`;
  // Keep only task-relevant fields. Credentials, headers and transport data
  // never become prompt data or stored job configuration.
  const context = new DefaultSecretScrubber().scrub(
    JSON.stringify({
      event,
      repository: job.github.repository,
      number,
      issue,
      comment: payload['comment'],
      ref: payload['ref'],
      check_run: payload['check_run'],
    }),
  );
  if (context.length > 16_384) throw new Error('GitHub task context exceeds 16 KB');
  return store.enqueue(
    jobId,
    'github',
    `github:${headers.delivery}`,
    subject,
    context,
    Date.now(),
    createHash('sha256').update(body).digest('hex'),
    undefined,
    job.revision ?? 1,
  );
}
