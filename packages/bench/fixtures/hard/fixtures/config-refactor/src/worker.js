import { loadConfig } from './config.js';

export const WORKER_DEFAULTS = {
  queue: 'jobs',
  concurrency: 2,
  retry: { attempts: 3, backoffMs: 250 },
  label: null,
};

/** Resolve the settings a background worker runs with. */
export function workerSettings(env) {
  const config = loadConfig(env, WORKER_DEFAULTS, 'WORKER_');
  return {
    queue: config.queue,
    concurrency: config.concurrency,
    attempts: config.retry.attempts,
    backoffMs: config.retry.backoffMs,
    label: config.label ?? `${config.queue}-worker`,
  };
}
