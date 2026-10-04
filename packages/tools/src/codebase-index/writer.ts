import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { type Bm25Index, buildBm25Index } from './bm25.js';
import type { FileRankRow, SymbolRankRow } from './graph-rank.js';
import {
  commitBatch,
  type IndexStoreBatchesHost,
  replaceEmptyFile,
} from './index-store-batches.js';
import type { IndexStoreMaintenanceHost } from './index-store-maintenance.js';
import * as indexStoreMaintenance from './index-store-maintenance.js';
import {
  bindRefsByImports,
  type RefBindingResult,
  type RefBindingScope,
} from './ref-binding-pass.js';
import type {
  CallSite,
  CodeMapGraph,
  FileMeta,
  IndexStats,
  Symbol as IndexSymbol,
  Ref,
  SearchResult,
  SymbolKind,
  SymbolLang,
} from './schema.js';
import { loadDatabaseSync, runSqliteWithRetry } from './sqlite-runtime.js';
import type { IndexSummary } from './writer-admin.js';
import * as writerAdmin from './writer-admin.js';
import { bulkInsertRefsWithStatement } from './writer-bulk-insert.js';
import type { ConceptCoverage, ConceptEdge, FileConcept, Subsystem } from './writer-concepts.js';
import * as writerConcepts from './writer-concepts.js';
import type { IndexDeletionHost } from './writer-deletion.js';
import * as writerDeletion from './writer-deletion.js';
import * as writerGraphReader from './writer-graph-reader.js';
import { resolveIndexDir } from './writer-helpers.js';
import { allocateSymbolIds, initIndexSchema } from './writer-init.js';
import { optimizeStore } from './writer-maintenance.js';
import * as writerMutations from './writer-mutations.js';
import { applyIndexStorePragmas } from './writer-pragmas.js';
import type { RankedFileRow } from './writer-rank.js';
import * as writerRank from './writer-rank.js';
import * as writerRefs from './writer-refs.js';
import { REFS_INDEX_SQL, SYMBOL_INDEX_SQL } from './writer-schema.js';
import * as writerSearch from './writer-search.js';
import type { WriterSearchFilter } from './writer-search-helpers.js';
import { StorePool } from './writer-store-pool.js';
import type { WriterSymbolQueriesHost } from './writer-symbol-queries.js';
import * as writerSymbolQueries from './writer-symbol-queries.js';
import type { IndexTransactionHost } from './writer-transactions.js';
import * as writerTransactions from './writer-transactions.js';
import type { FileVectorRow, VectorHit } from './writer-vectors.js';
import * as writerVectors from './writer-vectors.js';

export { codebaseIndexDirOverride, resolveIndexDir } from './writer-helpers.js';

/** Index names declared by the symbols/refs index DDL. */
function secondaryIndexNames(): string[] {
  const names: string[] = [];
  for (const sql of [...SYMBOL_INDEX_SQL, ...REFS_INDEX_SQL]) {
    const match = /CREATE INDEX IF NOT EXISTS (\w+)/.exec(sql);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

export { StorePool } from './writer-store-pool.js';

const DB_FILE = 'index.db';

const MAX_STATEMENT_CACHE = 128;

export class IndexStore {
  private db: DatabaseSync;
  private atomicIndexUpdateActive = false;
  private writeSavepointSequence = 0;
  private readonly indexDir: string;
  private ftsAvailable = false;
  private vectorsAvailable = false;
  private readonly stmtCache = new Map<string, ReturnType<DatabaseSync['prepare']>>();
  private bm25Cache: Bm25Index | null = null;
  private bm25Dirty = true;
  /** `PRAGMA data_version` the BM25 cache was built at. */
  private bm25DataVersion = -1;

  private stmt(sql: string): ReturnType<DatabaseSync['prepare']> {
    const cached = this.stmtCache.get(sql);
    if (cached !== undefined) {
      this.stmtCache.delete(sql);
      this.stmtCache.set(sql, cached);
      return cached;
    }
    const s = this.db.prepare(sql);
    this.stmtCache.set(sql, s);
    if (this.stmtCache.size > MAX_STATEMENT_CACHE) {
      const oldest = this.stmtCache.keys().next();
      if (!oldest.done) this.stmtCache.delete(oldest.value);
    }
    return s;
  }

  constructor(projectRoot: string, opts: { indexDir?: string | undefined } = {}) {
    this.indexDir = resolveIndexDir(projectRoot, opts.indexDir);
    fs.mkdirSync(this.indexDir, { recursive: true });
    const Database = loadDatabaseSync();
    this.db = new Database(path.join(this.indexDir, DB_FILE));
    applyIndexStorePragmas(this.db);
    this.initSchema();
  }

  runWithRetry<T>(fn: () => T): T {
    return runSqliteWithRetry(fn);
  }

  async runAtomicIndexUpdate<T>(job: () => Promise<T>): Promise<T> {
    return writerTransactions.runAtomicUpdate(this.indexTransactionHost(), job);
  }

  private beginWriteTransaction(): string | null {
    return writerTransactions.beginIndexWrite(this.indexTransactionHost());
  }

  private commitWriteTransaction(savepoint: string | null): void {
    writerTransactions.commitIndexWrite(this.indexTransactionHost(), savepoint);
  }

  /**
   * Never throws: every caller is already propagating the failure that caused
   * the rollback. When SQLite has rolled the transaction back itself (disk
   * full, I/O error) the ROLLBACK fails with "no transaction is active", and
   * that message used to replace the real error.
   */
  private rollbackWriteTransaction(savepoint: string | null): void {
    writerTransactions.rollbackIndexWrite(this.indexTransactionHost(), savepoint);
  }

  private initSchema(): void {
    const { ftsAvailable, vectorsAvailable } = initIndexSchema(
      this.db,
      (sql) => this.stmt(sql),
      (key) => this.getMetadata(key),
      (key, value) => this.setMetadata(key, value),
      IndexStore.MAX_SQL_VARS,
      () => this.invalidateBm25(),
    );
    this.ftsAvailable = ftsAvailable;
    this.vectorsAvailable = vectorsAvailable;
  }

  private static readonly MAX_SQL_VARS = 900;

  private runWriteTransaction<T>(operation: () => T): T {
    return writerTransactions.runIndexWrite(this.indexTransactionHost(), operation);
  }

  private allocateSymbolIds(count: number): number {
    return allocateSymbolIds(
      (sql) => this.stmt(sql),
      count,
      () => this.getMaxSymbolId(),
    );
  }

  private invalidateIncomingRefsForFiles(files: readonly string[]): Set<string> {
    return writerDeletion.invalidateIncomingIndexRefs(this.indexDeletionHost(), files);
  }

  private resolveRefsForNamesUnsafe(names: Iterable<string>): number {
    return writerRefs.resolveRefsForNamesUnsafe(
      (sql) => this.stmt(sql),
      IndexStore.MAX_SQL_VARS,
      names,
    );
  }

  insertSymbols(symbols: IndexSymbol[]): IndexSymbol[] {
    this.invalidateBm25();
    return this.runWriteTransaction(() => {
      const result = writerMutations.insertSymbolsWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        this.ftsAvailable,
        this.vectorsAvailable,
        this.allocateSymbolIds.bind(this),
        symbols,
      );
      this.recordFtsChurn(symbols.length);
      return result;
    });
  }

  deleteSymbolsForFile(file: string): void {
    writerDeletion.deleteFileSymbols(this.indexDeletionHost(), file);
  }

  deleteFile(file: string): void {
    writerDeletion.deleteIndexedFile(this.indexDeletionHost(), file);
  }

  upsertFile(meta: FileMeta): void {
    this.runWithRetry(() => writerMutations.upsertFileWithStatement((sql) => this.stmt(sql), meta));
  }

  getFileMeta(file: string): FileMeta | null {
    return writerAdmin.getFileMetaWithStatement((sql) => this.stmt(sql), file);
  }

  getAllFileMetas(): FileMeta[] {
    return writerAdmin.getAllFileMetasWithStatement((sql) => this.stmt(sql));
  }

  /** Metadata for just `files`; absent ones are missing from the result. */
  getFileMetas(files: readonly string[]): FileMeta[] {
    if (files.length === 0) return [];
    return writerAdmin.getFileMetasWithStatement(
      (sql) => this.stmt(sql),
      IndexStore.MAX_SQL_VARS,
      files,
    );
  }

  setFilePackages(entries: ReadonlyMap<string, string>): void {
    this.runWithRetry(() =>
      writerMutations.setFilePackagesWithStatement((sql) => this.stmt(sql), entries),
    );
  }

  /** Record the Git blob each file's rows were built from ('' clears it). */
  setGitBlobs(entries: ReadonlyMap<string, string>): void {
    this.runWithRetry(() =>
      writerMutations.setGitBlobsWithStatement((sql) => this.stmt(sql), entries),
    );
  }

  getNamespaceDeclarations(): Array<{ name: string; file: string }> {
    return writerRefs.getNamespaceDeclarationsWithStatement((sql) => this.stmt(sql));
  }

  getFilePackages(): Map<string, string> {
    return writerRefs.getFilePackagesWithStatement((sql) => this.stmt(sql));
  }

  getUnresolvedImports(onlyFiles?: readonly string[]): Array<{
    fromFile: string;
    lang: string;
    module: string;
  }> {
    return writerRefs.getUnresolvedImportsWithStatement(
      (sql) => this.stmt(sql),
      IndexStore.MAX_SQL_VARS,
      onlyFiles,
    );
  }

  getFilesWithDanglingImports(): string[] {
    return writerRefs.getFilesWithDanglingImportsWithStatement((sql) => this.stmt(sql));
  }

  /** Imports whose `to_file` is unset — the ones a newly added file can satisfy. */
  getImportsWithoutTarget(): Array<{ fromFile: string; lang: string; module: string }> {
    return writerRefs.getImportsWithoutTargetWithStatement((sql) => this.stmt(sql));
  }

  /** Files holding an import resolved to one of `targets`. */
  getImportersOfFiles(targets: readonly string[]): string[] {
    if (targets.length === 0) return [];
    return writerRefs.getImportersOfFilesWithStatement(
      (sql) => this.stmt(sql),
      IndexStore.MAX_SQL_VARS,
      targets,
    );
  }

  /**
   * [owner file, to_name] of every ref whose `to_file` is one of `targets` —
   * imports resolved to them and names the binding pass bound into them.
   */
  getRefNamesTargeting(targets: readonly string[]): Array<[string, string]> {
    if (targets.length === 0) return [];
    return writerRefs.getRefNamesTargetingWithStatement(
      (sql) => this.stmt(sql),
      IndexStore.MAX_SQL_VARS,
      targets,
    );
  }

  /** Import-aware rebinding of JS-family refs; see ref-binding-pass.ts. */
  bindRefsByImports(scope: RefBindingScope | 'all'): RefBindingResult {
    return bindRefsByImports(
      {
        stmt: (sql) => this.stmt(sql) as never,
        maxSqlVars: IndexStore.MAX_SQL_VARS,
        write: (operation) => this.runWriteTransaction(operation),
      },
      scope,
    );
  }

  applyImportResolutions(
    resolutions: ReadonlyArray<{
      fromFile: string;
      lang: string;
      module: string;
      toFile: string | null;
    }>,
  ): number {
    return writerRefs.applyImportResolutionsWithStatement(
      this.db,
      (sql) => this.stmt(sql),
      this.runWithRetry.bind(this),
      IndexStore.MAX_SQL_VARS,
      resolutions,
    );
  }

  search(
    query: string,
    filter?: WriterSearchFilter,
    opts?: { limit?: number | undefined },
  ): SearchResult[] {
    return writerSearch.searchWithStatement((sql) => this.stmt(sql), query, filter, opts);
  }

  countSearch(query: string, filter?: WriterSearchFilter | undefined): number {
    return writerSearch.countSearchWithStatement((sql) => this.stmt(sql), query, filter);
  }

  searchRanked(
    query: string,
    filter: WriterSearchFilter | undefined,
    limit: number,
  ): { results: SearchResult[]; total: number } {
    return writerSearch.searchRankedWithStatement(
      (sql) => this.stmt(sql),
      this.search.bind(this),
      this.ftsAvailable,
      this.vectorsAvailable,
      this.getOrBuildBm25.bind(this),
      query,
      filter,
      limit,
    );
  }

  private invalidateBm25(): void {
    this.bm25Dirty = true;
    this.bm25Cache = null;
  }

  /**
   * The corpus is rebuilt when this connection wrote (bm25Dirty) OR another
   * connection committed since it was built. Pooled stores stay open for the
   * life of the host while the project daemon, an inline indexer or another
   * process writes the same database; the dirty flag alone never saw those
   * writes, so short-query results silently dropped every symbol added since.
   */
  private getOrBuildBm25(): Bm25Index {
    const version = this.dataVersion();
    if (this.bm25Cache && !this.bm25Dirty && version === this.bm25DataVersion) {
      return this.bm25Cache;
    }
    const docs = this.getAllIndexable();
    this.bm25Cache = buildBm25Index(docs);
    this.bm25Dirty = false;
    this.bm25DataVersion = version;
    return this.bm25Cache;
  }

  /** Changes whenever ANOTHER connection commits to this database. */
  private dataVersion(): number {
    try {
      const row = this.stmt('PRAGMA data_version').get() as { data_version?: number } | undefined;
      return Number(row?.data_version ?? -1);
    } catch {
      return -1;
    }
  }

  getAllIndexable(): Array<{ id: number; text: string }> {
    return writerAdmin.getAllIndexableWithStatement((sql) => this.stmt(sql));
  }

  getMaxSymbolId(): number {
    return writerAdmin.getMaxSymbolIdWithStatement((sql) => this.stmt(sql));
  }

  getStats(): IndexStats {
    return writerAdmin.getStatsWithStatement((sql) => this.stmt(sql), this.indexDir);
  }

  /** P2.5: minimal summary for search-response piggyback (see writer-admin). */
  getIndexSummary(): IndexSummary {
    return writerAdmin.getIndexSummaryWithStatement((sql) => this.stmt(sql));
  }

  setLastIndexed(ts: number): void {
    this.runWithRetry(() => {
      this.stmt("INSERT OR REPLACE INTO metadata(key, value) VALUES('last_indexed', ?)").run(
        String(ts),
      );
    });
  }

  getMetadata(key: string): string | undefined {
    return writerAdmin.getMetadataWithStatement((sql) => this.stmt(sql), key);
  }

  setMetadata(key: string, value: string): void {
    // Every index run re-asserts its data-version markers. Rewriting an equal
    // value still appends WAL frames and moves the database's mtime, which
    // made a run that changed nothing look like a new database to every
    // file-fingerprint cache (the WebUI Code Map's among them).
    if (this.getMetadata(key) === value) return;
    this.runWithRetry(() => {
      this.stmt('INSERT OR REPLACE INTO metadata(key, value) VALUES(?, ?)').run(key, value);
    });
  }

  clearAll(): void {
    writerDeletion.clearIndex(this.indexDeletionHost());
  }

  /**
   * Drop the secondary indexes of `symbols` and `refs` for a rebuild into an
   * empty index, so the bulk inserts maintain one b-tree per table instead of
   * eight; {@link restoreSecondaryIndexes} builds them once, sorted, at the
   * end. Only for a run that has just cleared everything and issues no
   * lookups by those columns until it restores them. Inside the atomic
   * update a failure rolls the drop back with everything else.
   */
  deferSecondaryIndexes(): void {
    this.runWithRetry(() => {
      for (const name of secondaryIndexNames()) this.db.exec(`DROP INDEX IF EXISTS ${name}`);
    });
  }

  /** Recreate what {@link deferSecondaryIndexes} dropped (idempotent). */
  restoreSecondaryIndexes(): void {
    this.runWithRetry(() => {
      for (const sql of [...SYMBOL_INDEX_SQL, ...REFS_INDEX_SQL]) this.db.exec(sql);
    });
  }

  insertRefs(fromId: number, refs: Ref[]): void {
    this.runWithRetry(() => {
      this.stmt('DELETE FROM refs WHERE from_id = ?').run(fromId);
      if (refs.length === 0) return;
      bulkInsertRefsWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        refs.map((ref) => ({ ...ref, fromId })),
      );
    });
  }

  insertRefsBatch(refs: Ref[]): void {
    if (refs.length === 0) return;
    this.runWithRetry(() => {
      bulkInsertRefsWithStatement((sql) => this.stmt(sql), IndexStore.MAX_SQL_VARS, refs);
    });
  }

  commitBatch(
    entries: Array<{
      file: string;
      lang: SymbolLang;
      symbols: IndexSymbol[];
      refs: Ref[];
      mtimeMs: number;
      symbolCount: number;
      contentHash?: string | undefined;
    }>,
    options: {
      deleteForFiles?: string[] | undefined;
      /** See {@link commitBatchWithStatement}. */
      deferResolution?: Set<string> | undefined;
    } = {},
  ): IndexSymbol[] {
    return commitBatch(this.indexStoreBatchesHost(), entries, options);
  }

  deleteRefsForFile(file: string): void {
    this.runWithRetry(() => {
      this.stmt('DELETE FROM refs WHERE from_id IN (SELECT id FROM symbols WHERE file = ?)').run(
        file,
      );
    });
  }

  resolveRefs(): number {
    return this.runWithRetry(() => writerRefs.resolveRefsWithStatement((sql) => this.stmt(sql)));
  }

  resolveRefsForNames(names: Iterable<string>): number {
    return this.runWithRetry(() => this.resolveRefsForNamesUnsafe(names));
  }

  replaceEmptyFile(meta: FileMeta): void {
    replaceEmptyFile(this.indexStoreBatchesHost(), meta);
  }

  optimize(): void {
    optimizeStore(this.db);
  }

  /**
   * P2: churn-gated FTS5 segment maintenance.
   *
   * FTS5 postings only compact when FTS5 itself merges them: every delete
   * leaves tombstone postings in the segments, and neither VACUUM nor
   * `PRAGMA optimize` reclaims them. Measured on the live index (2026-08-30):
   * one delete+reinsert cycle grew symbols_fts_data 174.9→212.8 MB, while the
   * FTS5 'optimize'/'rebuild' merge resets it (rebuild: 212.9→28.2 MB in
   * 1.26 s for 131k rows). 'optimize' is the recurring command — an
   * incremental merge that discards deleted docs — and only runs once churn
   * crosses the gate, so a clean index never pays for it.
   *
   * Follows the {@link checkpointWal} contract: best-effort, returns whether
   * it ran, safe to call from the daemon's single-threaded idle path.
   */
  optimizeFtsIfNeeded(options: { minChurnRatio?: number; minChurnRows?: number } = {}): boolean {
    return indexStoreMaintenance.optimizeFtsIfNeeded(this.indexStoreMaintenanceHost(), options);
  }

  /**
   * Best-effort churn bookkeeping for {@link optimizeFtsIfNeeded}. Counts the
   * FTS rows a mutation inserts or deletes so the maintenance gate can fire
   * after real churn, not on a timer. Persisted in metadata so the counter
   * survives store open/close cycles in the daemon pool.
   */
  private recordFtsChurn(rows: number): void {
    indexStoreMaintenance.recordFtsChurn(this.indexStoreMaintenanceHost(), rows);
  }

  /**
   * P4.14: best-effort WAL checkpoint for idle-time maintenance.
   *
   * `wal_autocheckpoint` is PASSIVE and only attempts work after a COMMIT —
   * once writes stop, nothing fires again, so the WAL keeps whatever frames
   * the last burst left. This probes with PASSIVE first (never blocks; busy=1
   * means readers still hold WAL snapshots) and only issues the TRUNCATE —
   * which resets index.db-wal to zero bytes — when the checkpointer can
   * proceed immediately. Callers run this on the daemon's single thread, so
   * never wait on readers here: busy means "retry at the next idle window".
   */
  checkpointWal(): boolean {
    return indexStoreMaintenance.checkpointWal(this.indexStoreMaintenanceHost());
  }

  compactIfNeeded(options: { minBytes?: number; minFreeRatio?: number } = {}): boolean {
    return indexStoreMaintenance.compactIfNeeded(this.indexStoreMaintenanceHost(), options);
  }

  findIncomingCallsByName(
    symbolName: string,
    file?: string,
    limit = 100,
  ): { calls: CallSite[]; symbolFound: boolean; ambiguous: boolean; totalMatches: number } {
    return writerSymbolQueries.findIncomingCallsByNameFromStore.call(
      this.writerSymbolQueriesHost(),
      symbolName,
      file,
      limit,
    );
  }

  findOutgoingCallsByName(
    symbolName: string,
    file?: string,
    limit = 100,
  ): { calls: CallSite[]; symbolFound: boolean; unresolvedCount: number; totalMatches: number } {
    return writerSymbolQueries.findOutgoingCallsByNameFromStore.call(
      this.writerSymbolQueriesHost(),
      symbolName,
      file,
      limit,
    );
  }

  findTransitiveIncomingCallsByName(
    symbolName: string,
    file?: string,
    limit = 200,
  ): { calls: CallSite[]; symbolFound: boolean; ambiguous: boolean; totalMatches: number } {
    return writerSymbolQueries.findTransitiveIncomingCallsByNameFromStore.call(
      this.writerSymbolQueriesHost(),
      symbolName,
      file,
      limit,
    );
  }

  findTransitiveOutgoingCallsByName(
    symbolName: string,
    file?: string,
    limit = 200,
  ): { calls: CallSite[]; symbolFound: boolean; unresolvedCount: number; totalMatches: number } {
    return writerSymbolQueries.findTransitiveOutgoingCallsByNameFromStore.call(
      this.writerSymbolQueriesHost(),
      symbolName,
      file,
      limit,
    );
  }

  findReachableSymbolIds(seedIds: number[]): Set<number> {
    return writerGraphReader.findReachableSymbolIds((sql) => this.stmt(sql), seedIds);
  }

  findRefsTo(symbolId: number): Ref[] {
    return writerGraphReader.findRefsToWithStatement((sql) => this.stmt(sql), symbolId);
  }

  findRefsFrom(symbolId: number): Ref[] {
    return writerGraphReader.findRefsFromWithStatement((sql) => this.stmt(sql), symbolId);
  }

  getPackageGraph(): CodeMapGraph {
    return writerGraphReader.getPackageGraphWithStatement((sql) => this.stmt(sql));
  }

  getFileGraph(packageFilter: string): CodeMapGraph {
    return writerGraphReader.getFileGraphWithStatement((sql) => this.stmt(sql), packageFilter);
  }

  getSymbolGraph(fileFilter: string): CodeMapGraph {
    return writerGraphReader.getSymbolGraphWithStatement((sql) => this.stmt(sql), fileFilter);
  }

  getAllSymbols(): Array<{
    id: number;
    name: string;
    file: string;
    kind: SymbolKind;
    line: number;
    scope: string;
  }> {
    return writerSymbolQueries.getAllSymbols.call(this.writerSymbolQueriesHost());
  }

  /** Declarations in one file, in source order. */
  getFileSymbols(
    file: string,
    limit: number,
  ): Array<{ id: number; name: string; kind: string; line: number; signature: string }> {
    return writerSymbolQueries.getFileSymbols.call(this.writerSymbolQueriesHost(), file, limit);
  }

  /** Declarations behind an arbitrary id list, for the retrieval walk. */
  getSymbolsByIds(ids: readonly number[]): Array<{
    id: number;
    name: string;
    kind: string;
    lang: string;
    file: string;
    line: number;
    signature: string;
    scope: string;
  }> {
    return writerSymbolQueries.getSymbolsByIds.call(this.writerSymbolQueriesHost(), ids);
  }

  getAllResolvedRefs(): Array<{
    fromId: number;
    toId: number;
    callType: string;
  }> {
    return writerSymbolQueries.getAllResolvedRefs.call(this.writerSymbolQueriesHost());
  }

  /**
   * Replace both rank tables in one write. Called once per index run, after
   * ref resolution has settled — a rank computed against half-resolved refs
   * would describe a graph that never existed.
   */
  replaceRanks(symbols: readonly SymbolRankRow[], files: readonly FileRankRow[]): void {
    this.runWriteTransaction(() => {
      writerRank.replaceSymbolRanksWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        symbols,
      );
      writerRank.replaceFileRanksWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        files,
      );
    });
  }

  // ── Semantic file vectors ────────────────────────────────────────────────

  /** Wipe stored vectors when the embedding model changed. */
  reconcileVectorProvider(provider: string): boolean {
    return this.runWithRetry(() =>
      writerVectors.reconcileVectorProviderWithStatement(
        (sql) => this.stmt(sql),
        (key) => this.getMetadata(key),
        (key, value) => this.setMetadata(key, value),
        provider,
      ),
    );
  }

  getFileVectorStates(provider: string): Map<string, string> {
    return writerVectors.getFileVectorStatesWithStatement((sql) => this.stmt(sql), provider);
  }

  upsertFileVectors(rows: readonly FileVectorRow[]): void {
    this.runWriteTransaction(() => {
      writerVectors.upsertFileVectorsWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        rows,
      );
    });
  }

  pruneOrphanFileVectors(): number {
    return this.runWithRetry(() =>
      writerVectors.pruneOrphanFileVectorsWithStatement((sql) => this.stmt(sql)),
    );
  }

  countFileVectors(): number {
    return writerVectors.countFileVectorsWithStatement((sql) => this.stmt(sql));
  }

  searchFileVectors(query: Float32Array, limit: number, minScore: number): VectorHit[] {
    return writerVectors.searchFileVectorsWithStatement(
      (sql) => this.stmt(sql),
      query,
      limit,
      minScore,
    );
  }

  // ── Concept layer ────────────────────────────────────────────────────────

  upsertFileConcept(concept: FileConcept): void {
    this.runWriteTransaction(() => {
      writerConcepts.upsertFileConceptWithStatement((sql) => this.stmt(sql), concept);
    });
  }

  getFileConcept(file: string): FileConcept | undefined {
    return writerConcepts.getFileConceptWithStatement((sql) => this.stmt(sql), file);
  }

  getAllFileConcepts(): FileConcept[] {
    return writerConcepts.getAllFileConceptsWithStatement((sql) => this.stmt(sql));
  }

  getReadyConceptSummaries(): Map<string, string> {
    return writerConcepts.getReadyConceptSummariesWithStatement((sql) => this.stmt(sql));
  }

  getConceptCoverage(): ConceptCoverage {
    return writerConcepts.getConceptCoverageWithStatement((sql) => this.stmt(sql));
  }

  /** Flag summaries whose file has changed since they were written. */
  markStaleConcepts(): number {
    return this.runWithRetry(() =>
      writerConcepts.markStaleConceptsWithStatement((sql) => this.stmt(sql)),
    );
  }

  /** Drop summaries for files that are no longer indexed. */
  pruneOrphanConcepts(): number {
    return this.runWithRetry(() =>
      writerConcepts.pruneOrphanConceptsWithStatement((sql) => this.stmt(sql)),
    );
  }

  replaceSubsystems(subsystems: readonly Subsystem[], edges: readonly ConceptEdge[]): void {
    this.runWriteTransaction(() => {
      writerConcepts.replaceSubsystemsWithStatement(
        (sql) => this.stmt(sql),
        IndexStore.MAX_SQL_VARS,
        subsystems,
        edges,
      );
    });
  }

  getSubsystems(): Subsystem[] {
    return writerConcepts.getSubsystemsWithStatement((sql) => this.stmt(sql));
  }

  getConceptEdges(): ConceptEdge[] {
    return writerConcepts.getConceptEdgesWithStatement((sql) => this.stmt(sql));
  }

  getPackageFileCounts(): Map<string, number> {
    return writerRank.getPackageFileCountsWithStatement((sql) => this.stmt(sql));
  }

  getRankedFiles(limit: number): RankedFileRow[] {
    return writerRank.getRankedFilesWithStatement((sql) => this.stmt(sql), limit);
  }

  getTopFileRanks(limit: number): FileRankRow[] {
    return writerRank.getTopFileRanksWithStatement((sql) => this.stmt(sql), limit);
  }

  getTopSymbolRanks(limit: number): SymbolRankRow[] {
    return writerRank.getTopSymbolRanksWithStatement((sql) => this.stmt(sql), limit);
  }

  getFileRankMap(): Map<string, number> {
    return writerRank.getFileRankMapWithStatement((sql) => this.stmt(sql));
  }

  getRankCounts(): { symbols: number; files: number } {
    return writerRank.getRankCountsWithStatement((sql) => this.stmt(sql));
  }

  getSymbolNameCandidates(): Map<number, number> {
    return writerRank.getSymbolNameCandidatesWithStatement((sql) => this.stmt(sql));
  }

  /** Declaring file and homonym count per symbol, from one scan. */
  getSymbolGraphFacts(): { fileOf: Map<number, string>; candidates: Map<number, number> } {
    return writerSymbolQueries.getSymbolGraphFacts.call(this.writerSymbolQueriesHost());
  }

  getImportVisibility(): Map<string, Set<string>> {
    return writerSymbolQueries.getImportVisibility.call(this.writerSymbolQueriesHost());
  }

  getAllImportRefs(): Array<{
    sourceFile: string | null;
    toName: string;
    toId: number | null;
    callType: string;
    line: number;
  }> {
    return writerSymbolQueries.getAllImportRefs.call(this.writerSymbolQueriesHost());
  }

  close(): void {
    this.stmtCache.clear();
    this.bm25Dirty = true;
    this.bm25Cache = null;
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  private indexStoreMaintenanceHost(): IndexStoreMaintenanceHost {
    const self = this;
    return {
      stmt: (...args) => this.stmt(...args),
      get ftsAvailable() {
        return self.ftsAvailable;
      },
      getMetadata: (...args) => this.getMetadata(...args),
      setMetadata: (...args) => this.setMetadata(...args),
      runWithRetry: (...args) => this.runWithRetry(...args),
      get db() {
        return self.db;
      },
    };
  }

  private indexStoreBatchesHost(): IndexStoreBatchesHost {
    const self = this;
    return {
      maxSqlVars: IndexStore.MAX_SQL_VARS,
      invalidateBm25: (...args) => this.invalidateBm25(...args),
      runWriteTransaction: (...args) => this.runWriteTransaction(...args),
      stmt: (...args) => this.stmt(...args),
      get ftsAvailable() {
        return self.ftsAvailable;
      },
      set ftsAvailable(value) {
        self.ftsAvailable = value;
      },
      get vectorsAvailable() {
        return self.vectorsAvailable;
      },
      set vectorsAvailable(value) {
        self.vectorsAvailable = value;
      },
      allocateSymbolIds: (...args) => this.allocateSymbolIds(...args),
      invalidateIncomingRefsForFiles: (...args) => this.invalidateIncomingRefsForFiles(...args),
      resolveRefsForNamesUnsafe: (...args) => this.resolveRefsForNamesUnsafe(...args),
      recordFtsChurn: (...args) => this.recordFtsChurn(...args),
    };
  }

  private indexDeletionHost(): IndexDeletionHost {
    const self = this;
    return {
      maxSqlVars: IndexStore.MAX_SQL_VARS,
      stmt: (...args) => this.stmt(...args),
      invalidateBm25: (...args) => this.invalidateBm25(...args),
      runWriteTransaction: (...args) => this.runWriteTransaction(...args),
      invalidateIncomingRefsForFiles: (...args) => this.invalidateIncomingRefsForFiles(...args),
      get ftsAvailable() {
        return self.ftsAvailable;
      },
      get vectorsAvailable() {
        return self.vectorsAvailable;
      },
      recordFtsChurn: (...args) => this.recordFtsChurn(...args),
      resolveRefsForNamesUnsafe: (...args) => this.resolveRefsForNamesUnsafe(...args),
      get db() {
        return self.db;
      },
      stmtCache: this.stmtCache,
      initSchema: (...args) => this.initSchema(...args),
    };
  }

  private indexTransactionHost(): IndexTransactionHost {
    const self = this;
    return {
      get atomicIndexUpdateActive() {
        return self.atomicIndexUpdateActive;
      },
      set atomicIndexUpdateActive(value) {
        self.atomicIndexUpdateActive = value;
      },
      runWithRetry: (...args) => this.runWithRetry(...args),
      get db() {
        return self.db;
      },
      invalidateBm25: (...args) => this.invalidateBm25(...args),
      get writeSavepointSequence() {
        return self.writeSavepointSequence;
      },
      set writeSavepointSequence(value) {
        self.writeSavepointSequence = value;
      },
      beginWriteTransaction: (...args) => this.beginWriteTransaction(...args),
      commitWriteTransaction: (...args) => this.commitWriteTransaction(...args),
      rollbackWriteTransaction: (...args) => this.rollbackWriteTransaction(...args),
    };
  }

  private writerSymbolQueriesHost(): WriterSymbolQueriesHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.stmt satisfies WriterSymbolQueriesHost['stmt']);
    return this as unknown as WriterSymbolQueriesHost;
  }
}

export const indexStorePool = new StorePool(
  (projectRoot: string, opts?: { indexDir?: string | undefined }) =>
    new IndexStore(projectRoot, opts),
);
