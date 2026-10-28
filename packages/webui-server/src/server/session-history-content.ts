import type { SessionStore } from '@wrongstack/contracts/types';
import type { SessionHistoryWireEntry } from './session-history.js';

/** An absent/failed emptiness check is unknown, never permission to hide a journal. */
export async function withSessionContentState(
  rows: SessionHistoryWireEntry[],
  store: Pick<SessionStore, 'isEmpty'>,
) {
  const result: Array<SessionHistoryWireEntry & { isEmpty?: boolean }> = rows.map((row) => ({
    ...row,
  }));
  if (!store.isEmpty) return result;
  for (let offset = 0; offset < result.length; offset += 8) {
    await Promise.all(
      result.slice(offset, offset + 8).map(async (row) => {
        try {
          row.isEmpty = await store.isEmpty!(row.id);
        } catch {
          /* Unknown content remains visible. */
        }
      }),
    );
  }
  return result;
}
