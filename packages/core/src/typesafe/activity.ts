import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FetchError } from '../types/errors.js';
import { resolveWstackPaths } from '../utils/wstack-paths.js';
import type { TypeSafeBreaker } from './breaker.js';

export interface JevActivity {
  id: string;
  at: number;
  feature: string;
  project: string;
  route: string;
  model: string;
  durationMs: number;
  outcome: 'answered' | 'incomplete' | 'fallback';
  reason?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  answers?: Record<string, number | string> | undefined;
}

const entries: JevActivity[] = [];
let pending = Promise.resolve();
let writeError: string | undefined;
let file: string | undefined;

/** Process-scoped live tail; disk files survive restarts. No request state or raw errors. */
export function jevActivitySnapshot() {
  return { entries: entries.slice().reverse(), path: file, writeError, scope: 'process' as const };
}

/** Serialized by recordJevActivity; split for filesystem regression coverage. */
export async function appendJevActivity(target: string, entry: JevActivity): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const size = await stat(target).then(
    (s) => s.size,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 0;
      throw error;
    },
  );
  if (size > 5 * 1024 * 1024) await rename(target, `${target}.1`);
  await appendFile(target, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

export function recordJevActivity(entry: JevActivity): void {
  entries.push(entry);
  if (entries.length > 300) entries.shift();
  // Tests must not write into the developer's actual profile.
  if (process.env['VITEST']) return;
  try {
    file ??= join(
      resolveWstackPaths({ projectRoot: process.cwd() }).globalRoot,
      'logs',
      `jev-${process.pid}.jsonl`,
    );
  } catch {
    writeError = 'Could not resolve Jev activity log path';
    return;
  }
  const target = file;
  pending = pending
    .then(async () => {
      await appendJevActivity(target, entry);
      writeError = undefined;
    })
    .catch(() => {
      writeError = 'Could not write Jev activity log';
    });
}

export function observeJevClient(
  client: TypeSafeBreaker,
  route: string,
  model: string,
): TypeSafeBreaker {
  return {
    get open() {
      return client.open;
    },
    async systemOne(req, signal) {
      const start = Date.now();
      const base = {
        id: randomUUID(),
        at: start,
        feature: req.activityFeature ?? 'evaluation',
        project: process.cwd(),
        route,
        model: req.model ?? model,
      };
      try {
        const result = await client.systemOne(req, signal);
        // Only bounded option identifiers and numeric judgments, never criteria/state/legend.
        const answers: Record<string, number | string> = {};
        for (const [id, answer] of Object.entries(result.answers).slice(0, 32)) {
          if (!/^[\w.-]{1,80}$/.test(id)) continue;
          if (answer.type === 'noul') answers[id] = answer.noul;
          else if (answer.type === 'score') answers[id] = answer.score;
          else answers[id] = /^[\w.-]{1,80}$/.test(answer.choice) ? answer.choice : '[choice]';
        }
        const incomplete = Object.keys(req.questions).some((id) => !result.answers[id]);
        recordJevActivity({
          ...base,
          model: result.model ?? base.model,
          durationMs: Date.now() - start,
          outcome: incomplete ? 'incomplete' : 'answered',
          ...(incomplete ? { reason: 'missing_or_malformed_answers' } : {}),
          ...result.usage,
          answers,
        });
        return result;
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        const reason =
          cause instanceof Error && ['AbortError', 'TimeoutError'].includes(cause.name)
            ? cause.name
            : error instanceof FetchError
              ? error.status === 0
                ? 'network_error'
                : error.status < 400
                  ? 'invalid_response_body'
                  : `HTTP ${error.status}`
              : error instanceof Error &&
                  [
                    'TypeSafeRestingError',
                    'TypeSafeDisabledError',
                    'AbortError',
                    'TimeoutError',
                  ].includes(error.name)
                ? error.name
                : 'transport_or_response_error';
        recordJevActivity({ ...base, durationMs: Date.now() - start, outcome: 'fallback', reason });
        throw error;
      }
    },
  };
}
