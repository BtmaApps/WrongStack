import type {
  ChronicleFileLineageReader,
  ChronicleFileLineageRow,
} from '@wrongstack/contracts/types/chronicle-metrics';
import { createChronicleProjectAccess } from './project-access.js';

/**
 * The Chronicle-backed {@link ChronicleFileLineageReader}: the latest lineage
 * row per path, read from the derived SQLite projection in one indexed query.
 * The composition root binds it to `CHRONICLE_FILE_LINEAGE` so the review
 * context builder in core never imports Chronicle.
 *
 * Obtaining the gateway is itself a failure point (Chronicle raises rather
 * than handing back a process-local journal); that throw propagates and the
 * caller treats it as "no provenance".
 */
export const readChronicleFileLineage: ChronicleFileLineageReader = async (projectRoot, paths) => {
  if (paths.length === 0) return [];
  const access = createChronicleProjectAccess({ projectRoot });
  try {
    // One indexed query over the lineage projection. The old loop performed
    // one full reverse scan of every raw Chronicle partition per file — an
    // 80-file review over a multi-GB journal could pin a CPU core and allocate
    // Buffers/strings inside the TUI process for minutes.
    const uniquePaths = [...new Set(paths)];
    const result = await access.call('metrics', {
      view: 'files',
      refresh: false,
      files: {
        paths: uniquePaths,
        latestPerPath: true,
        limit: Math.min(10_000, uniquePaths.length),
      },
    });
    return result.data as ChronicleFileLineageRow[];
  } finally {
    await access.close();
  }
};
