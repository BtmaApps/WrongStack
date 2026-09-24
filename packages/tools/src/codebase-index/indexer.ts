import { expectDefined } from '@wrongstack/core/utils';

/**
 * Main indexing orchestrator.
 *
 * Given a project root and a list of files:
 * 1. Parse each file with the appropriate parser (TS, Go, Python, Rust, JSON, YAML)
 * 2. Delete old symbols for changed/deleted files
 * 3. Insert new symbols
 * 4. Update file metadata
 * 5. Return index statistics
 */

import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { indexParallelBatchSize, isFrugalPerf } from '@wrongstack/core/utils';
import { xxhash64String as contentHashHex } from './content-hash.js';
import { loadGitignoreMatcher } from './gitignore.js';
import { runGraphRankPass, shouldRefreshRanks } from './graph-rank-pass.js';
import { throwIfAborted, YIELD_EVERY_N, yieldEventLoop } from './index-scheduling.js';
import {
  computeGitSnapshotKey,
  DEFAULT_IGNORE,
  DEFAULT_IGNORE_FILES,
  expandTargetedDirectories,
  findSourceFiles,
  gitBlobStamp,
  IndexSourceChangedError,
  isAtlasProjection,
  isMissingPathError,
  isWithinProject,
  MAX_INDEX_FILE_BYTES,
} from './index-source-files.js';
import { detectLang } from './languages.js';
import { type parseFileContent, parseFilesContent } from './parser-dispatch.js';
import {
  createRebuildParserPool,
  getParserPool,
  type ParserWorkerPool,
  resolveWorkerPoolThreshold,
} from './parser-worker-pool.js';
import { recordFilesystemRead } from './perf-metrics.js';
import { planRefBinding, runRefBinding } from './ref-binding-pass.js';
import {
  MODULE_RESOLUTION_VERSION,
  MODULE_RESOLUTION_VERSION_KEY,
  RELATION_STRUCTURE_KEY,
  resolveProjectRelations,
} from './relation-pass.js';
import {
  type FileMeta,
  type IndexResult,
  type Symbol as IndexSymbol,
  MODULE_OWNER_NAME,
  type Ref,
  type SymbolLang,
} from './schema.js';
import { IndexStore } from './writer.js';

/**
 * Metadata key that changes whenever an index run changed rows or edges —
 * the content stamp for caches derived from the graph.
 */
export const GRAPH_STAMP_KEY = 'graph_stamp';

/**
 * Parallel parse batch size — see {@link indexParallelBatchSize}.
 * Re-resolved at the start of each index run so env profile changes apply.
 */
export function resolveParallelBatch(): number {
  return indexParallelBatchSize(availableParallelism());
}

/** Balanced-profile batch width, used by a frugal process's rebuild. */
const REBUILD_PARALLEL_BATCH = 40;

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
 * Detect AbortError (DOMException with name 'AbortError') thrown by signal-aware
 * fs.promises calls (stat, readFile). We must re-throw these so the cancellation
 * propagates — catching them as ordinary errors would keep the loop running.
 */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

interface IndexerOptions {
  projectRoot: string;
  files?: string[] | undefined;
  force?: boolean | undefined;
  langs?: string[] | undefined;
  ignore?: string[] | undefined;
  /** Override the index directory (default: the global per-project dir). */
  indexDir?: string | undefined;
  /**
   * Signal that cancels indexing cooperatively. Polled at yield points
   * (file walk, per-file loop) so a hung filesystem won't lock up the
   * process. When the tool executor's timeout fires, this signal aborts
   * and `runIndexer` throws, releasing the mutex and resetting flags.
   */
  signal?: AbortSignal | undefined;
  /**
   * Per-file progress callback. Injected by the caller instead of imported
   * from the host's module state so the indexer can run inside a worker
   * thread (worker posts progress messages; inline host updates its state).
   */
  onProgress?: ((current: number, total: number) => void) | undefined;
}

/** Bump to re-parse every symbol-less file once (they may now own refs). */
const MODULE_OWNER_VERSION = '1';
const MODULE_OWNER_VERSION_KEY = 'module_owner_version';

/**
 * Refs hang off symbols, so a file that declares nothing — a test file of
 * `describe`/`it` blocks, a barrel of `export … from`, an entry script — used
 * to lose every import and call it made: a tenth of this repository's files
 * were absent from the dependency graph, and re-export chains broke at every
 * pure barrel. Such a file gets one `mod` symbol at its top instead. Its text
 * is empty, so it stays out of search.
 */
function moduleOwnerSymbol(file: string, lang: SymbolLang): IndexSymbol {
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

function assignRefsToSymbols(refs: Ref[], symbols: IndexSymbol[]): Ref[] {
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

/** Run a full or incremental index and return statistics. */
export async function runIndexer(_ctx: Context, opts: IndexerOptions): Promise<IndexResult> {
  const store = new IndexStore(opts.projectRoot, { indexDir: opts.indexDir });
  try {
    return await runIndexerWithStore(store, opts);
  } finally {
    // Always release the synchronous SQLite connection — an abort mid-run
    // (executor timeout, session teardown) previously leaked it.
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
}

export async function runIndexerWithStore(
  store: IndexStore,
  opts: IndexerOptions,
): Promise<IndexResult> {
  let result: IndexResult;
  try {
    result = await store.runAtomicIndexUpdate(() => runIndexerAtomic(store, opts));
  } catch (error) {
    if (!(error instanceof IndexSourceChangedError)) throw error;
    // One bounded retry turns an edit that raced discovery into a coherent
    // generation. A second race fails and preserves the previous generation.
    result = await store.runAtomicIndexUpdate(() => runIndexerAtomic(store, opts));
  }
  // VACUUM cannot run inside a transaction. Publish the completed generation
  // first, then perform best-effort maintenance on full-project runs.
  if (!opts.files) store.compactIfNeeded();
  return result;
}

async function runIndexerAtomic(store: IndexStore, opts: IndexerOptions): Promise<IndexResult> {
  const { projectRoot, langs, ignore = [], signal } = opts;
  // Graph semantics changed without a structural SQLite schema change. Keep a
  // separate data-version marker so older running processes do not downgrade
  // and wipe the same shared DB while a new WebUI is being rolled out.
  const relationGraphVersion = '2';
  const refResolutionVersion = '2';
  const graphVersionStale = store.getMetadata('relation_graph_version') !== relationGraphVersion;
  const force = (opts.force ?? false) || graphVersionStale;
  const needsFullRefResolution =
    force || store.getMetadata('ref_resolution_version') !== refResolutionVersion;
  const startMs = Date.now();
  const errors: string[] = [];
  const langStats: Record<string, number> = {};
  // P5.15: filesIndexed counts ONLY files parsed and committed with symbols
  // (mirrors filesParsed). Skips/empties live in fileOutcomes. Invariant:
  // exactly one counter (filesIndexed/filesParsed, filesSkipped, filesEmpty,
  // filesFailed) bumps per file outcome — filesIndexed is the parsed branch.
  let filesIndexed = 0;
  let filesParsed = 0;
  let filesSkipped = 0;
  let filesEmpty = 0;
  let filesFailed = 0;
  let symbolsIndexed = 0;

  // Honor the project-root .gitignore (skips node_modules, build output, and
  // any project-specific ignored paths) on top of the always-on DEFAULT_IGNORE.
  const isGitIgnored = await loadGitignoreMatcher(projectRoot);

  let files: string[];
  /** Set of all files discovered on disk (before language filtering).
   *  Used for O(1) stale-file detection instead of stat-ing every
   *  previously-indexed file. Null when an explicit file list was given. */
  let discoveredFiles: Set<string> | null = null;
  let discoveryComplete = true;
  let cleanBlobs: Map<string, string> | undefined;
  let discoverySnapshotKey: string | undefined;
  let dirtyHashes: Map<string, string> | undefined;
  if (opts.files && opts.files.length > 0) {
    // Explicit file list (per-edit / watcher path): keep paths inside the
    // project only and apply both always-on and .gitignore exclusions.
    const targeted = await expandTargetedDirectories(
      store,
      projectRoot,
      opts.files.map((f) => path.resolve(projectRoot, f)),
      isGitIgnored,
      signal,
    );
    files = targeted.filter((f) => {
      if (!isWithinProject(projectRoot, f)) return false;
      const rel = path.relative(projectRoot, f).replace(/\\/g, '/');
      return (
        !rel.split('/').some((seg) => DEFAULT_IGNORE.includes(seg)) &&
        !DEFAULT_IGNORE_FILES.has(path.basename(f)) &&
        !isAtlasProjection(rel) &&
        !isGitIgnored(rel, false)
      );
    });
  } else {
    const discovery = await findSourceFiles(projectRoot, ignore, isGitIgnored, signal);
    files = discovery.files;
    errors.push(...discovery.errors);
    discoveryComplete = discovery.complete;
    discoveredFiles = new Set(files);
    cleanBlobs = discovery.cleanBlobs;
    discoverySnapshotKey = discovery.snapshotKey;
    dirtyHashes = discovery.dirtyHashes;
  }

  if (langs && langs.length > 0) {
    const langSet = new Set(langs);
    files = files.filter((f) => {
      const lang = detectLang(f);
      return lang ? langSet.has(lang) : false;
    });
  }

  // A user-forced run limited to some languages or files re-parses exactly
  // that scope. Clearing the WHOLE index first (as a scoped `force` used to)
  // deleted every other language's symbols — `codebase-index({ force: true,
  // langs: ['json'] })` wiped the TypeScript index until the next full run.
  // A relation-graph version bump still clears everything: the old rows are
  // semantically invalid regardless of scope.
  const scopedRun = (langs?.length ?? 0) > 0 || (opts.files?.length ?? 0) > 0;
  const clearedAll = force && (graphVersionStale || !scopedRun);
  if (clearedAll) {
    store.clearAll();
    // Rebuilding into an empty index: bulk-insert without the secondary
    // indexes and build each once after the batch loop. Nothing in the loop
    // may look rows up by those columns — see the `clearedAll` branches.
    store.deferSecondaryIndexes();
  }

  // Collect existing file metadata for incremental check. A targeted run
  // needs only its own files' previous state; a full scan needs every row to
  // find the files that vanished. Loaded even for a forced run, so the
  // relation pass can tell a re-parsed file from a new one.
  const existingMeta: Map<string, FileMeta> = new Map();
  const previousMetas = opts.files ? store.getFileMetas(files) : store.getAllFileMetas();
  for (const meta of previousMetas) existingMeta.set(meta.file, meta);
  // Symbol-less files indexed before they could own refs: forget their
  // content stamps so this run re-parses them (see moduleOwnerSymbol).
  const moduleOwnersStale =
    !clearedAll && store.getMetadata(MODULE_OWNER_VERSION_KEY) !== MODULE_OWNER_VERSION;
  if (moduleOwnersStale) {
    for (const meta of previousMetas) {
      if (meta.symbolCount === 0)
        existingMeta.set(meta.file, { ...meta, contentHash: '', gitBlob: '' });
    }
  }
  // What this run changes, for the relation and rank passes: a run that
  // changed nothing must not redo repository-wide work.
  const rewritten = new Set<string>();
  const added = new Set<string>();
  const deleted = new Set<string>();
  /** Content hash each rewritten file's new rows were built from. */
  const rewrittenHashes = new Map<string, string>();
  /** Files whose read/parse/commit failed; their rows are the last good copy. */
  const failed = new Set<string>();
  const noteRewritten = (file: string, contentHash: string): void => {
    rewritten.add(file);
    rewrittenHashes.set(file, contentHash);
    if (clearedAll || !existingMeta.has(file)) added.add(file);
  };

  // Per-file Git trust. A clean working copy only proves the file matches its
  // staged blob; it says nothing about whether the DB row was built from that
  // blob. `files.git_blob` records exactly that — the blob (and content hash)
  // a completed full run saw this file clean at — so a match means unchanged
  // since, with no stat and no read. Trust used to be one repository-wide
  // snapshot key: any edit anywhere voided it and the run re-read every file.
  const totalFilesForProgress = files.length;
  let filesPreSkipped = 0;
  if (!force && cleanBlobs) {
    files = files.filter((file) => {
      const meta = existingMeta.get(file);
      const blob = cleanBlobs.get(file);
      // An empty stamp vouches for nothing: `gitBlobStamp` of a row with no
      // content hash is '' too, and equality alone trusted such rows forever.
      if (
        !meta?.gitBlob ||
        blob === undefined ||
        meta.gitBlob !== gitBlobStamp(blob, meta.contentHash)
      ) {
        return true;
      }
      langStats[meta.lang] = (langStats[meta.lang] ?? 0) + meta.symbolCount;
      symbolsIndexed += meta.symbolCount;
      // P5.15: skipped files no longer count toward filesIndexed — the
      // headline is files actually parsed this run (see fileOutcomes).
      filesSkipped++;
      filesPreSkipped++;
      return false;
    });
    if (filesPreSkipped > 0) opts.onProgress?.(filesPreSkipped, totalFilesForProgress);
  }

  // Process files in batches for parallel I/O and parsing.
  // SQLite writes remain sequential (they're synchronous and CPU-bound).
  // Batch width follows WRONGSTACK_PERF_PROFILE (frugal ≤4, balanced cores×4).
  // A frugal process rebuilding into an empty index uses the balanced batch
  // width and a small private parser pool; see shouldUseParserWorkerPool.
  const frugalRebuild = clearedAll && isFrugalPerf();
  const parallelBatch = frugalRebuild ? REBUILD_PARALLEL_BATCH : resolveParallelBatch();
  const parserPoolCandidateCount = files.length;
  let rebuildPool: ParserWorkerPool | undefined;
  // Ref names awaiting resolution, resolved once after the batch loop — or
  // not at all when the run ends with a whole-table resolution anyway.
  const deferredRefNames = new Set<string>();
  let filesSinceLastYield = 0;
  try {
    for (let batchStart = 0; batchStart < files.length; batchStart += parallelBatch) {
      const batchEnd = Math.min(batchStart + parallelBatch, files.length);
      const batchFiles = files.slice(batchStart, batchEnd);

      // Report progress to the caller so UIs can show indexing status.
      opts.onProgress?.(filesPreSkipped + batchEnd, totalFilesForProgress);

      // Yield the event loop periodically so the main thread stays responsive
      // (TUI rendering, input handling, etc.) during large index builds.
      // Uses a running counter instead of batchStart % YIELD_EVERY_N which
      // only works when the batch size divides YIELD_EVERY_N evenly — with
      // dynamic batch sizes that invariant no longer holds and the yield would
      // fire far less often than intended.
      // Also check for cancellation — the tool executor's timeout or a
      // session abort propagates through `signal`.
      filesSinceLastYield += batchFiles.length;
      if (filesSinceLastYield >= YIELD_EVERY_N) {
        filesSinceLastYield = 0;
        await yieldEventLoop();
        // Frugal: brief pause so sustained reindex doesn't pin a core.
        if (isFrugalPerf()) {
          await new Promise<void>((r) => setTimeout(r, 8));
        }
        throwIfAborted(signal);
      }

      // Phase 1: Parallel stat + incremental skip + read + parse
      const statOpts = signal ? { signal } : {};
      const statReadParse = await Promise.allSettled(
        batchFiles.map(
          async (
            file,
          ): Promise<{
            file: string;
            stat: Stats;
            lang: string;
            parsed: Awaited<ReturnType<typeof parseFileContent>> | null;
            content?: string;
            contentHash?: string;
            skippedMeta?: FileMeta;
            error?: string;
            missing?: boolean;
          }> => {
            let stat: Stats;
            try {
              stat = await (
                fs.stat as (path: string, opts: { signal?: AbortSignal }) => Promise<Stats>
              )(file, statOpts);
            } catch (e) {
              if (isAbortError(e)) throw e;
              return {
                file,
                stat: null as never as Stats,
                lang: '',
                parsed: null,
                error: `stat error: ${e instanceof Error ? e.message : String(e)}`,
                missing: isMissingPathError(e),
              };
            }
            if (!stat.isFile()) return { file, stat, lang: '', parsed: null };

            const lang = detectLang(file);
            if (!lang) return { file, stat, lang: '', parsed: null };
            if (stat.size > MAX_INDEX_FILE_BYTES) {
              return {
                file,
                stat,
                lang,
                parsed: null,
                error: `file too large (${stat.size} bytes; max ${MAX_INDEX_FILE_BYTES})`,
              };
            }

            const meta = force ? undefined : existingMeta.get(file);

            // Discovery already hashed every dirty file for the Git snapshot. A
            // match with the stored hash needs no second read; had the file
            // changed since, the end-of-run snapshot check retries the run.
            const snapshotHash = dirtyHashes?.get(file);
            if (meta?.contentHash && snapshotHash === meta.contentHash) {
              return {
                file,
                stat,
                lang,
                parsed: null,
                contentHash: snapshotHash,
                skippedMeta: { ...meta, mtimeMs: Math.floor(stat.mtimeMs) },
              };
            }

            let content: string;
            try {
              content = await fs.readFile(file, { encoding: 'utf8', signal });
              recordFilesystemRead(Buffer.byteLength(content, 'utf8'));
            } catch (e) {
              if (isAbortError(e)) throw e;
              return {
                file,
                stat,
                lang,
                parsed: null,
                error: `read error: ${e instanceof Error ? e.message : String(e)}`,
              };
            }

            // Phase 2: content-hash short-circuit. mtime can change without the
            // bytes changing (git checkout, touch, formatter that's a no-op).
            // When the content hash matches what's stored, skip the expensive
            // parse pass entirely — but still update mtime so the next run's
            // fast path (the mtime check above) hits again.
            //
            // Compute the hash once here — it's reused in the return object so
            // the batch-write path doesn't hash the same content a second time.
            // Skip the short-circuit when there's no stored hash yet (first
            // index of this file, or a legacy v4 DB that hasn't been populated).
            // Without this guard, an empty stored hash would match an empty
            // computed hash on every run, skipping parsing forever.
            const contentHash = contentHashHex(content);
            if (!force && meta && meta.contentHash && contentHash === meta.contentHash) {
              return {
                file,
                stat,
                lang,
                parsed: null,
                content,
                contentHash,
                skippedMeta: { ...meta, mtimeMs: Math.floor(stat.mtimeMs) },
              };
            }

            // Phase 5: Parsing is deferred to a post-batch pass to avoid
            // concurrent-mutation races inside Promise.allSettled callbacks.
            // The callback returns the read content; the main thread decides
            // whether to parse inline or delegate to the worker pool after all
            // stat+hash checks have settled.
            return { file, stat, lang, parsed: null, content, contentHash };
          },
        ),
      );

      // Phase 1.5: Post-batch parse pass. Files were stat+hash-checked and
      // content-read in the parallel pass above, but parsing was deferred to
      // avoid the concurrent-mutation race that an inline pool delegation
      // inside each Promise.allSettled callback would create. Here we collect
      // all files that need parsing, then either delegate to the worker pool
      // (when available and the batch is large enough) or parse inline — both
      // single-threaded, no race.
      const toParse: Array<{
        index: number;
        file: string;
        content: string;
        lang: SymbolLang;
      }> = [];
      for (let pi = 0; pi < statReadParse.length; pi++) {
        const s = statReadParse[pi]!;
        if (s.status !== 'fulfilled') continue;
        const r = s.value;
        if (r.error || r.skippedMeta || !r.lang || r.parsed) continue;
        if (r.content === undefined) continue;
        toParse.push({
          index: pi,
          file: batchFiles[pi]!,
          content: r.content,
          lang: r.lang as SymbolLang,
        });
      }

      if (toParse.length > 0) {
        // Try the worker pool for large batches (Phase 5 — threshold-gated).
        // Falls back to inline parsing when the pool isn't available or the
        // batch is too small to justify spawn overhead. Activation is based on
        // files-to-parse count, not total file count, so stat-skipped batches
        // don't waste pool overhead on a tiny workload.
        let pool: ParserWorkerPool | null = null;
        if (
          shouldUseParserWorkerPool(parserPoolCandidateCount, toParse.length, {
            rebuild: clearedAll,
          })
        ) {
          if (frugalRebuild) {
            rebuildPool ??= createRebuildParserPool();
            pool = rebuildPool;
          } else {
            pool = getParserPool();
          }
        }
        if (pool) {
          try {
            await pool.ensureReady();
            const parsedResults = await pool.parseFiles(
              toParse.map((p) => ({ file: p.file, content: p.content, lang: p.lang })),
            );
            // Match by file path — pool results arrive in completion order
            // (worker N may finish before worker M), not positional alignment.
            // Files that errored inside a worker are absent from parsedResults;
            // record them as parse errors so the commit loop doesn't silently
            // index them with zero symbols.
            const byFile = new Map(parsedResults.map((r) => [r.file, r]));
            for (const item of toParse) {
              const parsed = byFile.get(item.file);
              const settled = statReadParse[item.index]!;
              if (settled.status !== 'fulfilled') continue;
              if (parsed) {
                settled.value.parsed = parsed;
              } else {
                settled.value.error = `parse error: worker returned no result for ${item.file}`;
              }
            }
          } catch {
            // Pool failure — fall through to inline parsing for all files.
            pool = null;
          }
        }

        // Inline fallback (or when pool wasn't available). Parse in parallel
        // — this is the same parallelism the pre-refactor code had via the
        // single Promise.allSettled callback. Sequential parsing would
        // regress incremental indexing latency. P3.8: one call for the whole
        // slice, so Go/Python files inside it share one toolchain child
        // process per chunk instead of one spawn per file.
        if (!pool) {
          const parsedAll = await parseFilesContent(
            toParse.map((p) => ({ file: p.file, content: p.content, lang: p.lang })),
          );
          for (let pi2 = 0; pi2 < parsedAll.length && pi2 < toParse.length; pi2++) {
            const settled = statReadParse[toParse[pi2]!.index]!;
            if (settled.status !== 'fulfilled') continue;
            const slot = parsedAll[pi2]!;
            if (slot.result) {
              settled.value.parsed = slot.result;
            } else {
              // A throwing parser no longer aborts the run — parseFilesContent
              // contains it and carries the message (P3.8 fix; P2.5 surfaces it).
              settled.value.error = `parse error: ${slot.error ?? `no result for ${toParse[pi2]!.file}`}`;
            }
          }
        }
      }

      // Phase 2: Sequential SQLite writes — amortized across the whole batch.
      //
      // Each file is still parsed in parallel (Phase 1), but the writes
      // happen in a single `commitBatch` transaction per outer batch
      // (PARALLEL_BATCH = 20 files). This drops the commit count from
      // ~5/file to 1/parallel-batch, which is the difference between
      // 100 fsync round-trips and 5 on a 20-file slice.
      const batchEntries: Array<{
        file: string;
        lang: SymbolLang;
        symbols: IndexSymbol[];
        refs: Ref[];
        mtimeMs: number;
        symbolCount: number;
        contentHash: string;
      }> = [];
      const deleteForFiles: string[] = [];

      for (let fi = 0; fi < statReadParse.length; fi++) {
        const settled = statReadParse[fi]!;
        const file = expectDefined(batchFiles[fi]);

        if (settled.status === 'rejected') {
          const err = settled.reason;
          if (err instanceof Error && isAbortError(err)) throw err;
          errors.push(`batch error: ${file}: ${err instanceof Error ? err.message : String(err)}`);
          failed.add(file);
          filesFailed++;
          continue;
        }

        const result = settled.value;
        if (result.error) {
          // A missing path in a targeted watcher/edit run is authoritative: the
          // source was deleted or renamed, so remove its previous index rows.
          // Read/parse/permission failures are transient and retain the last good
          // snapshot instead of replacing it with an empty one.
          if (result.missing) {
            // A deletion is a successful outcome, not a failure: reporting it as
            // `stat error: ENOENT` made every watcher-observed delete or rename
            // surface as "N error(s)" and count toward `failed`.
            if (existingMeta.has(file)) {
              store.deleteFile(file);
              deleted.add(file);
            }
            continue;
          }
          errors.push(`${file}: ${result.error}`);
          failed.add(file);
          filesFailed++;
          continue;
        }

        const { stat, lang, parsed } = result;
        if (result.skippedMeta) {
          langStats[lang] = (langStats[lang] ?? 0) + result.skippedMeta.symbolCount;
          symbolsIndexed += result.skippedMeta.symbolCount;
          // P5.15: content-hash skips don't count toward filesIndexed.
          filesSkipped++;
          // Content-hash short-circuit (Phase 2): mtime changed but content
          // didn't. Persist the new mtime so the next run's fast path hits
          // without re-reading the file.
          const stored = existingMeta.get(file);
          if (stored && stored.mtimeMs !== result.skippedMeta.mtimeMs) {
            store.upsertFile({
              file,
              lang: lang as SymbolLang,
              mtimeMs: result.skippedMeta.mtimeMs,
              symbolCount: result.skippedMeta.symbolCount,
              lastIndexed: Date.now(),
              contentHash: result.skippedMeta.contentHash,
            });
          }
          continue;
        }

        if (!lang || !parsed) {
          if (lang) {
            noteRewritten(file, result.contentHash ?? '');
            store.upsertFile({
              file,
              lang: lang as SymbolLang,
              mtimeMs: Math.floor(stat.mtimeMs),
              symbolCount: 0,
              lastIndexed: Date.now(),
              contentHash: result.contentHash ?? '',
            });
            // P5.15: empty files don't count toward filesIndexed.
            filesEmpty++;
          }
          continue;
        }

        // Empty symbol files still need their file row updated so future runs
        // know the mtime. Single transaction clears stale rows + upserts meta.
        const parsedRefs = parsed.refs ?? [];
        if (parsed.symbols.length === 0 && parsedRefs.length === 0) {
          noteRewritten(file, result.contentHash ?? '');
          // After a clear there are no old rows to drop, and the drop's lookups
          // would scan the unindexed tables once per empty file.
          const writeEmpty = clearedAll
            ? (meta: FileMeta) => store.upsertFile(meta)
            : (meta: FileMeta) => store.replaceEmptyFile(meta);
          writeEmpty({
            file,
            lang: lang as SymbolLang,
            mtimeMs: Math.floor(stat.mtimeMs),
            symbolCount: 0,
            lastIndexed: Date.now(),
            contentHash: result.contentHash ?? '',
          });
          // P5.15: empty files don't count toward filesIndexed.
          filesEmpty++;
          continue;
        }

        const symbols =
          parsed.symbols.length > 0
            ? parsed.symbols
            : [moduleOwnerSymbol(file, lang as SymbolLang)];
        batchEntries.push({
          file,
          lang: lang as SymbolLang,
          symbols,
          refs: parsedRefs,
          mtimeMs: Math.floor(stat.mtimeMs),
          symbolCount: symbols.length,
          contentHash: result.contentHash ?? '',
        });
        deleteForFiles.push(file);
        noteRewritten(file, result.contentHash ?? '');
      }

      if (batchEntries.length > 0) {
        try {
          store.commitBatch(batchEntries, {
            // Nothing to replace after a clear (and no index to find it by).
            deleteForFiles: clearedAll ? undefined : deleteForFiles,
            deferResolution: deferredRefNames,
          });
          for (const entry of batchEntries) {
            const count = entry.symbols.length;
            symbolsIndexed += count;
            langStats[entry.lang] = (langStats[entry.lang] ?? 0) + count;
            filesIndexed++;
            filesParsed++;
          }
        } catch (err) {
          // If the batch commit fails, fall back to per-file writes so the
          // user still gets a partial index. Per-file writes are slower but
          // isolate failures.
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`commitBatch failed: ${message} — falling back to per-file writes`);
          for (const entry of batchEntries) {
            try {
              store.deleteRefsForFile(entry.file);
              store.deleteSymbolsForFile(entry.file);
              const symbolsWithIds = store.insertSymbols(entry.symbols);
              symbolsIndexed += symbolsWithIds.length;
              langStats[entry.lang] = (langStats[entry.lang] ?? 0) + symbolsWithIds.length;
              filesIndexed++;
              filesParsed++;
              if (entry.refs.length > 0 && symbolsWithIds.length > 0) {
                const fallbackBatch = assignRefsToSymbols(entry.refs, symbolsWithIds);
                if (fallbackBatch.length > 0) store.insertRefsBatch(fallbackBatch);
              }
              store.resolveRefsForNames([
                ...entry.symbols.map((symbol) => symbol.name),
                ...entry.refs.map((ref) => ref.toName),
              ]);
              store.upsertFile({
                file: entry.file,
                lang: entry.lang,
                mtimeMs: entry.mtimeMs,
                symbolCount: entry.symbolCount,
                lastIndexed: Date.now(),
                contentHash: entry.contentHash,
              });
            } catch (innerErr) {
              failed.add(entry.file);
              filesFailed++;
              errors.push(
                `fallback write failed: ${entry.file}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
              );
            }
          }
        }
      }
    }
  } finally {
    // The rebuild's private pool must not outlive the run (each worker holds
    // a TypeScript compiler); shut it down on success, failure and abort alike.
    await rebuildPool?.shutdown();
  }

  if (clearedAll) store.restoreSecondaryIndexes();

  // Remove stale entries for files deleted since last run.
  // Instead of stat-ing every previously-indexed file (O(total indexed)),
  // derive stale files from the discovered set: any existingMeta entry not
  // in the scanned files is stale. Skip entirely for explicit file lists
  // (targeted reindex — can't derive stale from a subset).
  if (discoveredFiles && discoveryComplete && !clearedAll) {
    for (const [file_] of existingMeta) {
      if (!discoveredFiles.has(file_)) {
        store.deleteFile(file_);
        deleted.add(file_);
      }
    }
  }

  // Batch commits resolve only names touched by that batch. Existing databases
  // get one global repair pass when this contract version changes; subsequent
  // single-file watcher runs avoid rebuilding the full symbol-name map.
  if (needsFullRefResolution) store.resolveRefs();
  else if (deferredRefNames.size > 0) store.resolveRefsForNames(deferredRefNames);
  // Import-aware binding runs after module resolution, but what it must
  // revisit is read before: the relation pass clears the targets it keys on.
  const bindingPlan = planRefBinding(store, {
    changes: { rewritten, deleted },
    full: clearedAll || needsFullRefResolution,
    structureKey: RELATION_STRUCTURE_KEY,
    moduleVersionCurrent:
      store.getMetadata(MODULE_RESOLUTION_VERSION_KEY) === MODULE_RESOLUTION_VERSION,
  });
  // Proportional to what changed: a watcher echo of an already-indexed edit,
  // or a full scan over an unchanged checkout, re-resolves nothing.
  const relationsResolved = await resolveProjectRelations(store, projectRoot, {
    changes: { rewritten, added, deleted },
    full: needsFullRefResolution,
    projectScan: !opts.files,
    errors,
    signal,
  });
  const bindingsChanged = runRefBinding(store, bindingPlan, {
    added,
    structureKey: RELATION_STRUCTURE_KEY,
    errors,
    signal,
  });
  const relationsChanged = relationsResolved || bindingsChanged;
  store.setMetadata('ref_resolution_version', refResolutionVersion);
  // Only a run that saw every file has re-parsed every symbol-less one.
  if (clearedAll || (!opts.files && !langs?.length && discoveryComplete)) {
    store.setMetadata(MODULE_OWNER_VERSION_KEY, MODULE_OWNER_VERSION);
  }
  store.setMetadata('relation_graph_version', relationGraphVersion);
  const changedFiles = rewritten.size + deleted.size;
  // Centrality last: every ref now has its final to_id/to_file, so this is the
  // first point at which the wiring graph is the graph the generation will
  // publish. Failure is recorded in `errors` and never fails the run.
  let ranksChanged = false;
  if (shouldRefreshRanks(store, { changedFiles, force })) {
    ranksChanged = runGraphRankPass(store, errors).computed;
  }
  const completeProjectScope =
    !opts.files && (!langs || langs.length === 0) && (!opts.ignore || opts.ignore.length === 0);
  if (completeProjectScope && discoverySnapshotKey !== undefined && cleanBlobs && discoveredFiles) {
    // Every file Git reports clean now has rows built from its staged blob.
    // Record that per file; a failed file keeps whatever it had (its rows are
    // an older copy).
    const blobUpdates = new Map<string, string>();
    let blesses = false;
    for (const file of discoveredFiles) {
      if (failed.has(file)) continue;
      const wasRewritten = rewrittenHashes.has(file);
      const previous = existingMeta.get(file);
      const hash = wasRewritten ? rewrittenHashes.get(file) : previous?.contentHash;
      if (hash === undefined) continue;
      const blob = cleanBlobs.get(file);
      const desired = blob === undefined ? '' : gitBlobStamp(blob, hash);
      // Rewrites already cleared the column; skipped rows kept theirs.
      const current = wasRewritten ? '' : (previous?.gitBlob ?? '');
      if (desired === current) continue;
      blobUpdates.set(file, desired);
      if (desired !== '') blesses = true;
    }
    // A new stamp vouches that the rows match the blob, which only holds if
    // nothing moved between discovery and the reads — so re-list and compare
    // before writing one. A run that stamps nothing (the steady state: every
    // clean file already trusted) has nothing to vouch for and skips the
    // extra git process.
    if (blesses) {
      const finalSnapshotKey = await computeGitSnapshotKey(projectRoot, discoveredFiles, signal);
      if (finalSnapshotKey !== discoverySnapshotKey) {
        throw new IndexSourceChangedError(
          'Project files changed during indexing; retrying before publishing the generation.',
        );
      }
    }
    store.setGitBlobs(blobUpdates);
  }
  // Planner refresh belongs to bulk runs that moved real data, not the edit
  // watcher hot path — nor a full scan that found nothing to do.
  // P5.15: gate on actual work (parsed files), not the inflated legacy count.
  if ((!opts.files && changedFiles > 0) || filesIndexed >= 50) store.optimize();

  // `graph_stamp` is what content caches key on (the wiring-graph cache): it
  // moves only when rows or edges did. `last_indexed` still records every
  // full scan — it answers "when was this verified" — but a targeted run that
  // changed nothing (the watcher's echo of an edit a tool already indexed)
  // touches neither.
  if (changedFiles > 0 || relationsChanged) {
    store.setMetadata(GRAPH_STAMP_KEY, `${Date.now()}:${changedFiles}`);
  }
  if (changedFiles > 0 || !opts.files) store.setLastIndexed(Date.now());
  const durationMs = Date.now() - startMs;

  return {
    filesIndexed,
    fileOutcomes: {
      parsed: filesParsed,
      skipped: filesSkipped,
      empty: filesEmpty,
      failed: filesFailed,
    },
    symbolsIndexed,
    langStats,
    durationMs,
    errors,
    changedFiles,
    contentChanged: changedFiles > 0 || relationsChanged || ranksChanged || clearedAll,
  };
}
