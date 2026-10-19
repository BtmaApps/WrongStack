/**
 * SAGE Doctor over the SQLite store: measures the failure modes that used to
 * rot the store silently, and applies the named repairs in
 * {@link SageDoctorFixId}.
 *
 * Every check here maps to a defect that was live on this repository's own
 * store before it existed: 225 expired session digests still active because
 * automatic hygiene never ran, eight legacy hub memories with ~750
 * `same_topic` in-edges each, thousands of edges pointing at deleted
 * memories, and `{ modes: ['default'] }` audiences that pushed the same three
 * memories into every subagent. The doctor turns each into a number a human
 * (or the daemon's maintenance pass) can see.
 */
import * as fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import type {
  SageDoctorCheck,
  SageDoctorFixId,
  SageDoctorFixResult,
  SageDoctorMetrics,
  SageDoctorOptions,
  SageDoctorReport,
} from './memory-doctor-types.js';
import type { SageHygieneReport } from './memory-hygiene-types.js';
import { readSqliteSageRow } from './sqlite-store-codec.js';
import { GRAPH_HUB_DEGREE, SOFT_RELATIONS } from './sqlite-store-graph-traverse.js';
import type { Sage } from './types.js';

/**
 * Relations that carry no structure of their own; only these are pruned at hubs.
 *
 * Imported from the traversal module so the DOCTOR and the DAMPING can never
 * drift apart again: the check has to report the same nodes the traversal
 * expands around, and the repair has to prune the same relations.
 */
/** Injection count from which a never-used memory is reported. */
const NEVER_USED_REPORT_MIN_INJECTIONS = 20;
const PENDING_CANDIDATE_WARN = 200;
const WAL_WARN_BYTES = 64 * 1024 * 1024;
const SAMPLE_LIMIT = 5;
/** The runtime mode every worker inherits; never a meaningful audience. */
const RUNTIME_DEFAULT_MODE = 'default';

type Stmt = (sql: string) => ReturnType<DatabaseSync['prepare']>;

export interface SqliteDoctorContext {
  stmt: Stmt;
  dbPath: string;
  nowIso(): string;
  runMutation<T>(work: () => T): Promise<T>;
  upsertMemory(memory: Sage): void;
  audit(event: string, data?: Record<string, unknown>): void;
  hygiene(): Promise<SageHygieneReport>;
}

export async function runSqliteSageDoctor(
  ctx: SqliteDoctorContext,
  options: SageDoctorOptions = {},
): Promise<SageDoctorReport> {
  const fixesApplied: SageDoctorFixResult[] = [];
  for (const fix of new Set(options.fix ?? [])) {
    fixesApplied.push(await applyFix(ctx, fix));
  }
  const report: SageDoctorReport = {
    generatedAt: ctx.nowIso(),
    metrics: measureMetrics(ctx),
    checks: runChecks(ctx),
  };
  if (fixesApplied.length > 0) report.fixesApplied = fixesApplied;
  return report;
}

// ─── Metrics ────────────────────────────────────────────────────────────

function count(ctx: SqliteDoctorContext, sql: string, ...params: Array<string | number>): number {
  const row = ctx.stmt(sql).get(...params) as { n: number | null } | undefined;
  return Number(row?.n ?? 0);
}

function fileBytes(file: string): number | undefined {
  try {
    return fs.statSync(file).size;
  } catch {
    return undefined;
  }
}

function measureMetrics(ctx: SqliteDoctorContext): SageDoctorMetrics {
  const byStatus: Record<string, number> = {};
  for (const row of ctx
    .stmt('SELECT status, COUNT(*) AS n FROM memories GROUP BY status')
    .all() as Array<{ status: string; n: number }>) {
    byStatus[row.status] = row.n;
  }
  // Corrupt-row convention (see initialize.ts backfill): json_valid(data) must
  // precede every json_extract predicate/aggregate — AND short-circuits left to
  // right, and without the guard one malformed row makes the SUM raise
  // "malformed JSON" and aborts the entire doctor report.
  const usage = ctx
    .stmt(
      `SELECT SUM(COALESCE(json_extract(data, '$.injectionCount'), 0)) AS injections,
              SUM(COALESCE(json_extract(data, '$.useCount'), 0)) AS uses
       FROM memories WHERE status = 'active' AND json_valid(data)`,
    )
    .get() as { injections: number | null; uses: number | null };
  const injections = Number(usage.injections ?? 0);
  const uses = Number(usage.uses ?? 0);
  return {
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    active: byStatus['active'] ?? 0,
    byStatus,
    edges: count(ctx, 'SELECT COUNT(*) AS n FROM edges'),
    pendingCandidates: count(ctx, `SELECT COUNT(*) AS n FROM candidates WHERE status = 'pending'`),
    injections,
    uses,
    precision: injections > 0 ? uses / injections : 0,
    injectedNeverUsed: count(
      ctx,
      `SELECT COUNT(*) AS n FROM memories
       WHERE status = 'active' AND json_valid(data) AND (audience IS NULL OR audience = '')
         AND COALESCE(json_extract(data, '$.injectionCount'), 0) >= ?
         AND COALESCE(json_extract(data, '$.useCount'), 0) = 0`,
      NEVER_USED_REPORT_MIN_INJECTIONS,
    ),
    unanchoredActive: count(
      ctx,
      `SELECT COUNT(*) AS n FROM memories
       WHERE status = 'active' AND json_valid(data) AND COALESCE(json_array_length(json_extract(data, '$.anchors')), 0) = 0`,
    ),
    neverVerifiedActive: count(
      ctx,
      `SELECT COUNT(*) AS n FROM memories
       WHERE status = 'active' AND json_valid(data) AND json_extract(data, '$.lastVerifiedAt') IS NULL
         AND COALESCE(json_array_length(json_extract(data, '$.anchors')), 0) > 0`,
    ),
    dbBytes: fileBytes(ctx.dbPath),
    walBytes: fileBytes(`${ctx.dbPath}-wal`),
  };
}

// ─── Checks ─────────────────────────────────────────────────────────────

function samples(ctx: SqliteDoctorContext, sql: string, ...params: Array<string | number>) {
  return (ctx.stmt(sql).all(...params) as Array<{ v: string }>).map((row) => row.v);
}

function check(
  id: string,
  title: string,
  n: number,
  severity: Exclude<SageDoctorCheck['severity'], 'ok'>,
  summary: string,
  extra: Pick<SageDoctorCheck, 'fix' | 'samples'> = {},
): SageDoctorCheck {
  if (n === 0) return { id, title, severity: 'ok', summary: `${title}: none`, count: 0 };
  return { id, title, severity, summary, count: n, ...extra };
}

const HUB_NODES_SQL = `
  SELECT node AS v, COUNT(*) AS n FROM (
    SELECT from_node AS node FROM edges WHERE relation IN ('same_topic', 'related_to')
    UNION ALL
    SELECT to_node AS node FROM edges WHERE relation IN ('same_topic', 'related_to')
  ) GROUP BY node HAVING COUNT(*) > ? ORDER BY n DESC`;

const DANGLING_EDGE_FILTER = `
  (from_node LIKE 'mem:%' AND NOT EXISTS (
     SELECT 1 FROM memories m WHERE m.id = substr(edges.from_node, 5) AND m.status <> 'deleted'))
  OR (to_node LIKE 'mem:%' AND NOT EXISTS (
     SELECT 1 FROM memories m WHERE m.id = substr(edges.to_node, 5) AND m.status <> 'deleted'))`;

const RUNTIME_MODE_AUDIENCE_SQL = `
  SELECT id AS v FROM memories
  WHERE status IN ('active', 'stale') AND audience IS NOT NULL AND audience <> ''
    AND json_valid(audience)
    AND EXISTS (SELECT 1 FROM json_each(json_extract(audience, '$.modes')) WHERE value = ?)`;

function runChecks(ctx: SqliteDoctorContext): SageDoctorCheck[] {
  const now = ctx.nowIso();
  const checks: SageDoctorCheck[] = [];

  const integrity = (ctx.stmt('PRAGMA quick_check').all() as Array<Record<string, string>>)
    .map((row) => String(Object.values(row)[0] ?? ''))
    .filter((value) => value !== 'ok');
  checks.push(
    check(
      'sqlite-integrity',
      'SQLite integrity',
      integrity.length,
      'error',
      'PRAGMA quick_check reported problems',
      {
        samples: integrity.slice(0, SAMPLE_LIMIT),
      },
    ),
  );

  checks.push(ftsCheck(ctx));

  const expired = count(
    ctx,
    `SELECT COUNT(*) AS n FROM memories
     WHERE status = 'active' AND json_valid(data) AND json_extract(data, '$.expiresAt') IS NOT NULL
       AND json_extract(data, '$.expiresAt') <= ?`,
    now,
  );
  checks.push(
    check(
      'expired-active',
      'Expired memories still active',
      expired,
      'warn',
      `${expired} active memories are past expiresAt — hygiene has not run since they expired`,
      {
        fix: 'hygiene',
        samples: samples(
          ctx,
          `SELECT id AS v FROM memories WHERE status = 'active' AND json_valid(data)
             AND json_extract(data, '$.expiresAt') <= ? LIMIT ${SAMPLE_LIMIT}`,
          now,
        ),
      },
    ),
  );

  const hubs = ctx.stmt(HUB_NODES_SQL).all(GRAPH_HUB_DEGREE) as Array<{ v: string; n: number }>;
  checks.push(
    check(
      'graph-hubs',
      'Graph hub nodes',
      hubs.length,
      'warn',
      `${hubs.length} nodes carry more than ${GRAPH_HUB_DEGREE} same_topic/related_to edges (${hubs.reduce((sum, hub) => sum + hub.n, 0)} edges of graph noise)`,
      {
        fix: 'graph-hubs',
        samples: hubs.slice(0, SAMPLE_LIMIT).map((hub) => `${hub.v} (${hub.n})`),
      },
    ),
  );

  const dangling = count(ctx, `SELECT COUNT(*) AS n FROM edges WHERE ${DANGLING_EDGE_FILTER}`);
  checks.push(
    check(
      'dangling-edges',
      'Edges to missing or deleted memories',
      dangling,
      'warn',
      `${dangling} edges point at a memory that is gone or deleted`,
      { fix: 'dangling-edges' },
    ),
  );

  const modeAudience = samples(ctx, RUNTIME_MODE_AUDIENCE_SQL, RUNTIME_DEFAULT_MODE);
  checks.push(
    check(
      'audience-runtime-mode',
      'Audiences scoped to the runtime mode',
      modeAudience.length,
      'warn',
      `${modeAudience.length} memories are scoped to mode "default": hidden from path injection, pushed into every default-mode subagent`,
      { fix: 'audience-runtime-mode', samples: modeAudience.slice(0, SAMPLE_LIMIT) },
    ),
  );

  const neverUsed = samples(
    ctx,
    `SELECT id || ' (' || json_extract(data, '$.injectionCount') || 'x)' AS v FROM memories
     WHERE status = 'active' AND json_valid(data) AND (audience IS NULL OR audience = '')
       AND COALESCE(json_extract(data, '$.injectionCount'), 0) >= 100
       AND COALESCE(json_extract(data, '$.useCount'), 0) = 0
     ORDER BY json_extract(data, '$.injectionCount') DESC LIMIT ${SAMPLE_LIMIT}`,
  );
  const heavyNeverUsed = count(
    ctx,
    `SELECT COUNT(*) AS n FROM memories
     WHERE status = 'active' AND json_valid(data) AND (audience IS NULL OR audience = '')
       AND COALESCE(json_extract(data, '$.injectionCount'), 0) >= 100
       AND COALESCE(json_extract(data, '$.useCount'), 0) = 0`,
  );
  checks.push(
    check(
      'injected-never-used',
      'Heavily injected, never used',
      heavyNeverUsed,
      'info',
      `${heavyNeverUsed} memories were injected 100+ times without a single recorded use — review them`,
      { samples: neverUsed },
    ),
  );

  const pending = count(ctx, `SELECT COUNT(*) AS n FROM candidates WHERE status = 'pending'`);
  checks.push(
    pending > PENDING_CANDIDATE_WARN
      ? {
          id: 'candidate-backlog',
          title: 'Review backlog',
          severity: 'warn',
          summary: `${pending} review candidates are pending (oldest ${oldestPending(ctx) ?? '?'})`,
          count: pending,
        }
      : check(
          'candidate-backlog',
          'Review backlog',
          pending,
          'info',
          `${pending} review candidates pending`,
        ),
  );

  const walBytes = fileBytes(`${ctx.dbPath}-wal`) ?? 0;
  checks.push(
    walBytes > WAL_WARN_BYTES
      ? {
          id: 'wal-size',
          title: 'WAL size',
          severity: 'info',
          summary: `WAL is ${Math.round(walBytes / 1024 / 1024)} MB; it shrinks on the next checkpoint`,
        }
      : { id: 'wal-size', title: 'WAL size', severity: 'ok', summary: 'WAL size is normal' },
  );
  return checks;
}

function oldestPending(ctx: SqliteDoctorContext): string | undefined {
  const row = ctx
    .stmt(`SELECT MIN(created_at) AS v FROM candidates WHERE status = 'pending'`)
    .get() as { v: string | null } | undefined;
  return row?.v ?? undefined;
}

function ftsPresent(ctx: SqliteDoctorContext): boolean {
  return count(ctx, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'memories_fts'`) > 0;
}

function ftsBroken(summary: string): SageDoctorCheck {
  return {
    id: 'fts-integrity',
    title: 'Full-text index',
    severity: 'error',
    summary,
    fix: 'fts-rebuild',
  };
}

function ftsCheck(ctx: SqliteDoctorContext): SageDoctorCheck {
  if (!ftsPresent(ctx)) {
    return {
      id: 'fts-integrity',
      title: 'Full-text index',
      severity: 'info',
      summary: 'FTS5 is unavailable; search uses the LIKE fallback',
    };
  }
  try {
    // Rank 0 checks the index's own structure only. A full check reads the
    // content table by FTS column name, and `memories` stores the text inside
    // its JSON `data`, so the content comparison would always fail here.
    ctx.stmt(`INSERT INTO memories_fts(memories_fts, rank) VALUES('integrity-check', 0)`).run();
  } catch (error) {
    return ftsBroken(
      `FTS index is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // Drift between the index and the table is what a missed trigger leaves
  // behind: rows that can never be found, or ghosts of deleted rows.
  const indexed = count(ctx, 'SELECT COUNT(*) AS n FROM memories_fts_docsize');
  const rows = count(ctx, 'SELECT COUNT(*) AS n FROM memories');
  if (indexed !== rows) {
    return ftsBroken(`FTS index holds ${indexed} documents for ${rows} memories`);
  }
  return {
    id: 'fts-integrity',
    title: 'Full-text index',
    severity: 'ok',
    summary: 'FTS index is consistent',
  };
}

// ─── Fixes ──────────────────────────────────────────────────────────────

async function applyFix(
  ctx: SqliteDoctorContext,
  fix: SageDoctorFixId,
): Promise<SageDoctorFixResult> {
  switch (fix) {
    case 'hygiene': {
      const report = await ctx.hygiene();
      return {
        fix,
        changed:
          report.deleted + report.staled + report.superseded + report.reviewCandidatesCreated,
        detail: `hygiene: ${report.deleted} expired removed, ${report.staled} staled, ${report.superseded} superseded, ${report.reviewCandidatesCreated} review candidates`,
      };
    }
    case 'graph-hubs':
      return ctx.runMutation(() => {
        const hubs = ctx.stmt(HUB_NODES_SQL).all(GRAPH_HUB_DEGREE) as Array<{ v: string }>;
        const relations = SOFT_RELATIONS.map(() => '?').join(',');
        const del = ctx.stmt(
          `DELETE FROM edges WHERE relation IN (${relations}) AND (from_node = ? OR to_node = ?)`,
        );
        let changed = 0;
        for (const hub of hubs) {
          changed += Number(del.run(...SOFT_RELATIONS, hub.v, hub.v).changes);
        }
        ctx.audit('memory.doctor_fix', { fix, details: { hubs: hubs.length, edges: changed } });
        return {
          fix,
          changed,
          detail: `removed ${changed} soft edges from ${hubs.length} hub nodes`,
        };
      });
    case 'dangling-edges':
      return ctx.runMutation(() => {
        const changed = Number(
          ctx.stmt(`DELETE FROM edges WHERE ${DANGLING_EDGE_FILTER}`).run().changes,
        );
        ctx.audit('memory.doctor_fix', { fix, details: { edges: changed } });
        return { fix, changed, detail: `removed ${changed} edges to missing or deleted memories` };
      });
    case 'audience-runtime-mode':
      return ctx.runMutation(() => {
        const ids = samples(ctx, RUNTIME_MODE_AUDIENCE_SQL, RUNTIME_DEFAULT_MODE);
        let changed = 0;
        let skippedCorrupt = 0;
        for (const id of ids) {
          let current: ReturnType<typeof readSqliteSageRow>;
          try {
            current = readSqliteSageRow(ctx.stmt, id);
          } catch {
            // Corrupt-row convention (sqlite-store-codec): one unreadable
            // payload must not abort the whole repair pass — skip the bad
            // sibling, keep lifting the healthy rows, report the skip.
            skippedCorrupt++;
            continue;
          }
          if (!current?.audience) continue;
          const modes = (current.audience.modes ?? []).filter(
            (mode) => mode !== RUNTIME_DEFAULT_MODE,
          );
          const { modes: _dropped, ...rest } = current.audience;
          const audience = modes.length > 0 ? { ...rest, modes } : rest;
          const empty = Object.values(audience).every(
            (values) => !Array.isArray(values) || values.length === 0,
          );
          const { audience: _old, ...withoutAudience } = current;
          ctx.upsertMemory({
            ...(empty ? withoutAudience : { ...current, audience }),
            revision: current.revision + 1,
            updatedAt: ctx.nowIso(),
          });
          // Every injection of an audience-scoped memory came from subagent
          // spawns, where no use can ever be observed. Carried over, those
          // counts would brand the memory as "injected N times, never used"
          // the moment ordinary injection can finally reach it. Written
          // directly because the upsert keeps the larger live counter.
          ctx
            .stmt(`UPDATE memories SET data = json_set(data, '$.injectionCount', 0) WHERE id = ?`)
            .run(id);
          changed++;
        }
        ctx.audit('memory.doctor_fix', {
          fix,
          details: { memories: changed, skippedCorrupt },
        });
        return {
          fix,
          changed,
          detail:
            skippedCorrupt > 0
              ? `lifted runtime mode "default" from ${changed} audiences, skipped ${skippedCorrupt} unreadable`
              : `lifted runtime mode "default" from ${changed} audiences`,
        };
      });
    case 'fts-rebuild':
      return ctx.runMutation(() => {
        if (!ftsPresent(ctx))
          return { fix, changed: 0, detail: 'FTS5 unavailable; nothing to rebuild' };
        // FTS5 'rebuild' would read the content table by column name, which
        // `memories` does not have; repopulate the way schema init backfills.
        ctx.stmt(`INSERT INTO memories_fts(memories_fts) VALUES('delete-all')`).run();
        ctx
          .stmt(
            `INSERT INTO memories_fts(rowid, text, tags, audience)
             SELECT rowid,
               CASE WHEN json_valid(data) THEN COALESCE(json_extract(data, '$.text'), '') ELSE '' END,
               COALESCE(tags, ''),
               COALESCE(audience, '')
             FROM memories`,
          )
          .run();
        ctx.audit('memory.doctor_fix', { fix });
        return { fix, changed: 1, detail: 'rebuilt the full-text index' };
      });
  }
}
