/**
 * System One relevance check for turn-context recall.
 *
 * The turn middleware already gates recall on lexical/vector relevance and a
 * metadata score, and the bar is deliberately high: an injected memory that
 * does not help the turn is noise the model has to read past, and noise it
 * sometimes follows. Surface relevance still admits the classic false
 * positive — a memory that shares the query's words or embedding
 * neighbourhood but says nothing about what the user is asking for.
 *
 * This asks one Noul per surviving candidate, in a single request, "would
 * this memory help respond to this message?", and DROPS the ones that clearly
 * would not. It can only remove candidates, never admit one the existing gate
 * refused, so the worst a wrong judgment can do is withhold a memory — the
 * same outcome as the gate being slightly stricter.
 *
 * Cost control: the middleware runs on every provider request, including
 * each tool-loop iteration of one turn, but the user message does not change
 * inside a turn. Judgments are cached per (message, memory), so a turn pays
 * for at most one request, and only for memories it has not judged yet. A
 * tight deadline keeps a slow host from delaying the turn: on timeout, a
 * resting host or any failure, nothing is dropped.
 */

import { createHash } from 'node:crypto';
import type { TypeSafeJudge, TypeSafeQuestion } from '@wrongstack/core/typesafe';
import type { Sage } from '../types.js';

export interface SystemOneRecallFilterOptions {
  getJudge: () => TypeSafeJudge | undefined;
  /** Drop a memory whose "helps" probability is below this. Default 0.2. */
  dropBelow?: number | undefined;
  /** Whole-request deadline. Default 1500ms — this is on the turn's hot path. */
  timeoutMs?: number | undefined;
  /** Cached (message, memory) judgments. Default 512. */
  cacheSize?: number | undefined;
}

/** Returns ids to drop. Never throws; an empty set means "keep everything". */
export type SystemOneRecallFilter = (query: string, memories: Sage[]) => Promise<Set<string>>;

const MAX_QUERY_CHARS = 4_000;
const MAX_MEMORY_CHARS = 800;

export function createSystemOneRecallFilter(
  opts: SystemOneRecallFilterOptions,
): SystemOneRecallFilter {
  const dropBelow = opts.dropBelow ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 1_500;
  const cacheSize = Math.max(16, opts.cacheSize ?? 512);
  const cache = new Map<string, number>();

  const remember = (key: string, value: number): void => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  return async (query, memories) => {
    const drop = new Set<string>();
    if (memories.length === 0 || !query.trim()) return drop;
    const queryKey = createHash('sha256').update(query).digest('hex').slice(0, 20);
    const keyFor = (m: Sage) => `${queryKey}\0${m.id}\0${m.revision}`;

    const unjudged = memories.filter((m) => !cache.has(keyFor(m)));
    if (unjudged.length > 0) {
      const judge = opts.getJudge();
      if (judge) {
        const questions: Record<string, TypeSafeQuestion> = {};
        unjudged.forEach((_, i) => {
          questions[`m${i}`] = {
            type: 'noul',
            instructions:
              `Would \`memories[${i}]\` help an assistant respond to \`userMessage\` — ` +
              'is it about what the user is asking for, not merely about the same words?',
            criteria: {
              true: 'The memory states a fact, rule or decision relevant to this request.',
              false: 'The memory is about something else; the request does not need it.',
            },
          };
        });
        try {
          const result = await judge.client.systemOne(
            {
              state: {
                userMessage: query.slice(0, MAX_QUERY_CHARS),
                memories: unjudged.map((m) => m.text.slice(0, MAX_MEMORY_CHARS)),
              },
              questions,
              model: judge.model,
            },
            AbortSignal.timeout(timeoutMs),
          );
          unjudged.forEach((m, i) => {
            const answer = result.answers[`m${i}`];
            if (answer?.type === 'noul') remember(keyFor(m), answer.noul);
          });
        } catch {
          // Resting host, timeout, rejected key: keep every candidate.
        }
      }
    }

    for (const m of memories) {
      const helps = cache.get(keyFor(m));
      if (helps !== undefined && helps < dropBelow) drop.add(m.id);
    }
    return drop;
  };
}
