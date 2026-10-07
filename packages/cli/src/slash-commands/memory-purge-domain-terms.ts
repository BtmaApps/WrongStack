import { toErrorMessage } from '@wrongstack/core/utils';
import type { getSageSurface } from '@wrongstack/sage';
import { requiresSage } from './memory-formatters.js';

// ── /memory purge-domain-terms — one-off legacy-tag migration ──────────

/**
 * Domain-term persistence was removed: the extractor no longer writes
 * per-term SAGE memories with the `domain-term` tag. Older corpora
 * may still carry such records. The migration command below removes
 * them in one pass. The constant is hard-coded rather than imported
 * from `@wrongstack/sage` to keep the slash-command file decoupled
 * from the (intentionally shrinking) sage public surface.
 */
const DOMAIN_TERM_TAG = 'domain-term';

export async function runPurgeDomainTerms(
  Sage: ReturnType<typeof getSageSurface>,
  rest: readonly string[],
): Promise<{ message: string }> {
  // One-off migration: domain-term persistence was removed.
  // The extractor no longer writes per-term SAGE memories with
  // the `domain-term` tag, but older corpora may still carry
  // such records. This command finds and deletes every memory
  // whose `tags` array carries the canonical lookup tag — the
  // tag every extractor-written entry has. The historical
  // companions `glossary` / `project-jargon` alone must NOT
  // target a memory: modern records use them topically, and a
  // companion-only match deleted unrelated notes (observed
  // live 2026-09-20 — six modern memories purged and
  // recovered). Idempotent — re-running on a clean corpus
  // reports 0 deleted.
  if (!Sage) return requiresSage('purge-domain-terms');
  const force = rest.includes('--force');
  if (!force) {
    return {
      message:
        `Refusing to run /memory purge-domain-terms without --force.\n\n` +
        `This is a one-off migration that permanently removes every SAGE memory tagged \`${DOMAIN_TERM_TAG}\` (and the historical \`glossary\` / \`project-jargon\` companion tags). ` +
        `It cannot be undone. Run /memory purge-domain-terms --force when you are ready.`,
    };
  }
  try {
    // Pull every active + stale memory; the extractor wrote
    // entries with status 'active' in normal flow. We page
    // through `listSagePage` rather than `listSage` to bound
    // memory pressure on large corpora.
    const targets: Array<{ id: string; tags: readonly string[] }> = [];
    const PAGE = 200;
    let cursor: string | undefined;
    // listSagePage is a method on the SAGE service, not the
    // surface; fetch it via the underlying port when present.
    const listPage = (
      Sage as unknown as {
        listSagePage?: (opts?: {
          statuses?: Array<'active' | 'stale' | 'archived' | 'deleted'>;
          limit?: number;
          cursor?: string;
        }) => Promise<{
          memories: Array<{ id: string; tags: readonly string[] }>;
          nextCursor?: string | undefined;
        }>;
      }
    ).listSagePage;
    if (typeof listPage === 'function') {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page: {
          memories: Array<{ id: string; tags: readonly string[] }>;
          nextCursor?: string | undefined;
        } = await listPage({
          statuses: ['active', 'stale'],
          limit: PAGE,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        for (const mem of page.memories) {
          if (Array.isArray(mem.tags) && mem.tags.includes(DOMAIN_TERM_TAG)) {
            targets.push({ id: mem.id, tags: mem.tags });
          }
        }
        if (!page.nextCursor || page.memories.length === 0) break;
        cursor = page.nextCursor;
      }
    } else {
      // Fallback: single-shot listSage. Bounded by whatever
      // listSage defaults to; the surface is expected to
      // expose a sane limit.
      const memories = await Sage.listSage(['active', 'stale']);
      for (const mem of memories) {
        if (Array.isArray(mem.tags) && mem.tags.includes(DOMAIN_TERM_TAG)) {
          targets.push({ id: mem.id, tags: mem.tags });
        }
      }
    }

    if (targets.length === 0) {
      return {
        message: `No SAGE memories matched the legacy domain-term tag trio. ` + `Nothing to purge.`,
      };
    }

    let deleted = 0;
    const failures: string[] = [];
    for (const t of targets) {
      try {
        // `force: true` is appropriate here: the user ran an
        // explicit migration command, which satisfies SAGE's
        // destructive-operation authorization contract.
        await Sage.deleteSage(t.id, 'domain-term persistence removed; pre-migration cleanup', {
          force: true,
        });
        deleted++;
      } catch (err) {
        failures.push(`${t.id}: ${toErrorMessage(err)}`);
      }
    }

    const tagSummary = new Map<string, number>();
    for (const t of targets) {
      for (const tag of t.tags) {
        if (tag === DOMAIN_TERM_TAG || tag === 'glossary' || tag === 'project-jargon') {
          tagSummary.set(tag, (tagSummary.get(tag) ?? 0) + 1);
        }
      }
    }
    const tagBreakdown = [...tagSummary.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `  - ${tag}: ${count}`)
      .join('\n');

    const tail =
      failures.length > 0
        ? `\n\nFailures (${failures.length}):\n${failures
            .slice(0, 10)
            .map((f) => `  - ${f}`)
            .join('\n')}`
        : '';
    return {
      message:
        `Purged ${deleted} of ${targets.length} legacy domain-term memories.\n\n` +
        `Tag breakdown of matched memories:\n${tagBreakdown}\n\n` +
        `The \`${DOMAIN_TERM_TAG}\` tag is now absent from the live corpus. ` +
        `Run \`/memory show\` to confirm.${tail}`,
    };
  } catch (err) {
    return {
      message: `purge-domain-terms failed: ${toErrorMessage(err)}`,
    };
  }
}
