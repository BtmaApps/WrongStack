import type { Sage } from '../types.js';
import { snapshotMemoryEvidence } from './source-evidence.js';

export interface ValidityReview {
  observedRevision: number;
  checkedAt: string;
  applicability: 'unknown';
  checks: Array<{
    path: string;
    text: string;
    status: 'satisfied' | 'not_satisfied' | 'unknown';
    sourceHash?: string | undefined;
  }>;
}

/** Ephemeral evidence, never persisted as truth. Bound injection waiting to 250ms. */
export async function checkInjectionValidity(
  memories: Sage[],
  root?: string,
): Promise<Map<string, ValidityReview>> {
  return new Map(
    await Promise.all(
      memories
        .filter((m) => m.validity)
        .map(async (memory) => {
          const review: ValidityReview = {
            observedRevision: memory.revision,
            checkedAt: new Date().toISOString(),
            applicability: 'unknown',
            checks: (memory.validity?.checks ?? []).map(({ path, text }) => ({
              path,
              text,
              status: 'unknown',
            })),
          };
          if (!root || !review.checks.length) return [memory.id, review] as const;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const snapshot = await Promise.race([
              snapshotMemoryEvidence(root, memory),
              new Promise<undefined>((resolve) => {
                timer = setTimeout(() => resolve(undefined), 250);
                timer.unref?.();
              }),
            ]);
            if (snapshot)
              review.checks = (snapshot.validityChecks ?? []).map((check) => ({
                ...check,
                sourceHash: snapshot.files.find((f) => f.path === check.path)?.hash,
              }));
          } catch {
            /* Unreadable evidence stays unknown. */
          } finally {
            if (timer) clearTimeout(timer);
          }
          return [memory.id, review] as const;
        }),
    ),
  );
}
