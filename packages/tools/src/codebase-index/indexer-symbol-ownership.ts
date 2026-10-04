import { isFrugalPerf } from '@wrongstack/core/utils';
import { resolveWorkerPoolThreshold } from './parser-worker-pool.js';
import {
  type Symbol as IndexSymbol,
  MODULE_OWNER_NAME,
  type Ref,
  type SymbolLang,
} from './schema.js';

/**
 * Pool startup is amortized across the complete index run, not one outer
 * batch. Balanced batches are capped at 40 files, so comparing the per-batch
 * parse count with the 500-file threshold made the worker path unreachable.
 *
 * Threshold is env-configurable (audit T-04): `WRONGSTACK_INDEX_WORKER_THRESHOLD`
 * overrides the default, `0` disables the worker path entirely.
 */
export function shouldUseParserWorkerPool(
  candidateFileCount: number,
  parseBatchCount: number,
  opts: { rebuild?: boolean | undefined } = {},
): boolean {
  const threshold = resolveWorkerPoolThreshold();
  // 0 = explicit opt-out: no candidate count (not even 0 itself, which would
  // satisfy >= 0) may take the worker path.
  if (threshold === 0) return false;
  // Frugal (the project server) keeps parsing on its own thread, except for a
  // rebuild into an empty index: that is the run a user waits on, and it gets
  // a bounded pool of its own (FRUGAL_REBUILD_WORKERS).
  if (isFrugalPerf() && !opts.rebuild) return false;
  return candidateFileCount >= threshold && parseBatchCount > 1;
}

/**
 * Refs hang off symbols, so a file that declares nothing — a test file of
 * `describe`/`it` blocks, a barrel of `export … from`, an entry script — used
 * to lose every import and call it made: a tenth of this repository's files
 * were absent from the dependency graph, and re-export chains broke at every
 * pure barrel. Such a file gets one `mod` symbol at its top instead. Its text
 * is empty, so it stays out of search.
 */
export function moduleOwnerSymbol(file: string, lang: SymbolLang): IndexSymbol {
  return {
    id: 0,
    lang,
    kind: 'mod',
    name: MODULE_OWNER_NAME,
    file,
    line: 1,
    col: 0,
    signature: '',
    docComment: '',
    scope: '',
    text: '',
  };
}

export function assignRefsToSymbols(refs: Ref[], symbols: IndexSymbol[]): Ref[] {
  if (refs.length === 0 || symbols.length === 0) return [];
  const ordered = [...symbols].sort((a, b) => a.line - b.line || a.col - b.col || a.id - b.id);
  const seen = new Set<string>();
  const assigned: Ref[] = [];
  for (const ref of refs) {
    let owner: IndexSymbol | undefined;
    for (const symbol of ordered) {
      if (symbol.line > ref.line) break;
      owner = symbol;
    }
    // Imports usually appear before the first declaration. Attach them to the
    // first real symbol so file/package dependency graphs retain the module
    // edge without inventing an invalid owner id 0.
    if (!owner && ref.callType === 'import') owner = ordered[0];
    if (!owner || owner.id <= 0) continue;
    // The module is part of the identity: same-name imports from different
    // modules are distinct dependencies (mirrors ts-parser's deduplicateRefs).
    const key = `${owner.id}:${ref.toName}:${ref.callType}:${ref.module ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assigned.push({ ...ref, fromId: owner.id });
  }
  return assigned;
}
