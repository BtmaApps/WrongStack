import type { KanbanBoardSummary, KanbanQueueHealth } from '@wrongstack/kanban';
import { getBoard, listBoards } from '@wrongstack/kanban';
import { auditKanbanBoard, type KanbanAuditSummary } from './kanban-audit.js';
import type { KanbanSlashDeps } from './kanban-command-types.js';

// ── Health report ────────────────────────────────────────────────────────────

/**
 * Render the kanban queue health report as a compact markdown block.
 * Surfaces the same Sprint-2 fields the WebUI's `KanbanView` shows
 * (dependencyBlocked, staleAssignments, failedRetryable, heartbeatDue)
 * plus per-status counts and the last dispatch / last recovery stamps.
 */
export function renderHealthReport(health: KanbanQueueHealth): string {
  const c = health.counts;
  // The KanbanQueueHealth buckets overlap: `queued` is an assignment overlay
  // that can coexist with `pending` or `ready`, and `blocked` is a status
  // distinct from the lifecycle buckets. Summing them inflates the total.
  // Use a clear partitioning: pending + ready + running + review + failed +
  // completed + archived + blocked are mutually-exclusive lifecycle/status
  // buckets; `queued` is reported separately as an assignment count.
  const lifecycleTotal =
    c.pending + c.ready + c.running + c.review + c.failed + c.completed + c.archived + c.blocked;
  const header = [
    '🩺 **Kanban queue health**',
    '',
    `  ${lifecycleTotal} task${lifecycleTotal === 1 ? '' : 's'} across ${
      health.boardIds.length
    } board${health.boardIds.length === 1 ? '' : 's'} (generated ${health.generatedAt})`,
    c.queued > 0 ? `  + ${c.queued} currently queued for assignment (subset)` : '',
    '',
    '  **Per-status counts**',
    // `startable`, not `ready`. `counts.ready` tallies the stored status field,
    // which no dispatcher writes, so it printed a permanent 0 while
    // `ready_tasks` on the same board returned work. `counts.startable` is the
    // derived answer and agrees with `listReadyTasks`.
    //
    // `lifecycleTotal` above still sums `c.ready` on purpose: that is the
    // single-count partition, and `startable` overlaps `pending`/`ready`, so
    // swapping it there would double-count. These two lines are meant to differ.
    `    startable ${c.startable} · running ${c.running} · review ${c.review}` +
      ` · failed ${c.failed} · completed ${c.completed}`,
    `    pending ${c.pending} · archived ${c.archived} · blocked ${c.blocked}` +
      (c.queued > 0 ? ` · queued ${c.queued}` : ''),
    '',
  ].filter((line) => line !== '');

  const attention: string[] = ['  **Attention signals**'];
  attention.push(
    `    dependency-blocked  ${health.dependencyBlocked.count}` +
      (health.dependencyBlocked.count > 0
        ? `  (first: ${summarizeSearchResult(health.dependencyBlocked.tasks[0])})`
        : ''),
  );
  attention.push(
    `    stale-assignments   ${health.staleAssignments.count}` +
      (health.staleAssignments.count > 0
        ? `  (first: ${summarizeSearchResult(health.staleAssignments.tasks[0])})`
        : ''),
  );
  attention.push(
    `    failed-retryable    ${health.failedRetryable.count}` +
      (health.failedRetryable.count > 0
        ? `  (first: ${summarizeSearchResult(health.failedRetryable.tasks[0])})`
        : ''),
  );
  attention.push(
    `    heartbeat-due       ${health.heartbeatDue.count}` +
      (health.heartbeatDue.count > 0
        ? `  (first: ${summarizeSearchResult(health.heartbeatDue.tasks[0])})`
        : ''),
  );
  // Parked cards are the one signal here that will not clear on its own: the
  // gate refused them until the budget ran out, so re-running them unchanged
  // refuses again. Optional on the record because several call sites build a
  // KanbanQueueHealth literal by hand.
  const parkedCount = health.parked?.count ?? 0;
  attention.push(
    `    parked              ${parkedCount}` +
      (parkedCount > 0 ? `  (first: ${summarizeSearchResult(health.parked?.tasks[0])})` : ''),
  );
  attention.push('');

  const stamps: string[] = ['  **Activity**'];
  stamps.push(`    last dispatch    ${health.lastDispatchedAt ?? 'never'}`);
  stamps.push(`    last recovery    ${health.lastStaleRecoveredAt ?? 'never'}`);
  stamps.push('', '  Use `/kanban` to inspect any board visually.');

  return [...header, ...attention, ...stamps].join('\n');
}

function summarizeSearchResult(
  result: { board: { title: string }; task: { title: string } } | undefined,
): string {
  if (!result) return '';
  return `"${result.task.title}" on ${result.board.title}`;
}

// ── Audit report ────────────────────────────────────────────────────────────

/**
 * Render the Kanban Cleaner audit across the project. Mirrors the WebUI
 * `KanbanCleanerAlert` vocabulary so a user running either surface gets
 * the same findings.
 *
 * Two modes:
 *   - `boardQuery` empty   → audit every board (per-board table).
 *   - `boardQuery` present → audit the single matching board, or report
 *     a clear "not found" error.
 *
 * Each board's row shows the issue counts (error · warning) and the
 * top-3 issues, biasing toward error severity first.
 */
export async function renderProjectAudit(
  deps: Pick<KanbanSlashDeps, 'projectRoot'>,
  boardQuery: string,
): Promise<string> {
  const summaries = await listBoards(deps.projectRoot);
  if (summaries.length === 0) {
    return [
      '🧹 **Kanban Cleaner audit**',
      '',
      '  No boards exist yet — run `/kanban create <title>` first.',
    ].join('\n');
  }

  let targets = summaries;
  if (boardQuery.length > 0) {
    const needle = boardQuery.toLowerCase();
    const matched = summaries.find(
      (b) =>
        b.id === boardQuery ||
        b.id.slice(0, 8).toLowerCase() === needle.slice(0, 8) ||
        b.title.toLowerCase() === needle ||
        b.tags?.some((t) => t.toLowerCase() === needle),
    );
    if (!matched) {
      return [
        '🧹 **Kanban Cleaner audit**',
        '',
        `  No kanban board matches "${boardQuery}". Run \`/kanban boards\` to see available boards.`,
      ].join('\n');
    }
    targets = [matched];
  }

  // Iterate sequentially; each board is small enough that a single
  // for-loop is cheaper than parallel reads (the kanban store is
  // process-local). Errors per-board degrade gracefully — the rest
  // of the report still renders.
  const rows: Array<{
    title: string;
    summary: KanbanAuditSummary;
    error?: string;
  }> = [];
  for (const target of targets) {
    try {
      const board = await getBoard(deps.projectRoot, target.id);
      if (!board) {
        rows.push({ title: target.title, summary: emptyAuditSummary(), error: 'Board not found' });
        continue;
      }
      const summary = auditKanbanBoard(board, { now: new Date() });
      rows.push({ title: target.title, summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ title: target.title, summary: emptyAuditSummary(), error: message });
    }
  }

  return renderAuditReport(rows, boardQuery.length === 0);
}

/** Empty `KanbanAuditSummary` placeholder used when a board can't be loaded. */
function emptyAuditSummary(): KanbanAuditSummary {
  return {
    generatedAt: new Date().toISOString(),
    boardIds: [],
    counts: { error: 0, warning: 0 },
    dependencyBlocked: { count: 0, tasks: [] },
    staleAssignments: { count: 0, tasks: [] },
    failedRetryable: { count: 0, tasks: [] },
    heartbeatDue: { count: 0, tasks: [] },
    lastDispatchedAt: undefined,
    lastStaleRecoveredAt: undefined,
    issues: [],
    affectedTaskCount: 0,
  };
}

/**
 * Render a board-row table from a list of audited boards. The output
 * is a compact markdown block suitable for the slash composer.
 *
 * When `multi` is true (audit-all mode) each row is prefixed with the
 * board title; in single-board mode the title appears once as a header.
 */
export function renderAuditReport(
  rows: ReadonlyArray<{ title: string; summary: KanbanAuditSummary; error?: string }>,
  multi: boolean,
): string {
  const headline = [
    '🧹 **Kanban Cleaner audit**',
    '',
    multi ? `  ${rows.length} board${rows.length === 1 ? '' : 's'} scanned` : `  Single-board scan`,
    '',
  ];

  const body: string[] = [];
  for (const row of rows) {
    if (multi) body.push(`**${row.title}**`);
    if (row.error) {
      body.push(`  ⚠ Could not audit: ${row.error}`);
      if (multi) body.push('');
      continue;
    }
    const s = row.summary;
    const total = s.counts.error + s.counts.warning;
    const headline2 =
      total === 0
        ? '  ✓ Clean (no cleaner findings)'
        : `  ${total} cleaner issue${total === 1 ? '' : 's'} (${s.counts.error} error · ${s.counts.warning} warning)`;
    body.push(headline2);
    if (total === 0) {
      if (multi) body.push('');
      continue;
    }
    // Top-3 issues, error-first — re-sort defensively so callers that
    // pass a manually-built summary still get the right ordering.
    const top = [...s.issues]
      .sort((a, b) => {
        const sev = severityRank(a.severity) - severityRank(b.severity);
        return sev !== 0 ? sev : a.taskTitle.localeCompare(b.taskTitle);
      })
      .slice(0, 3);
    for (const issue of top) {
      body.push(
        `    ${issue.severity === 'error' ? '⨯' : '!'} ${issue.code} — ${issue.taskTitle}: ${issue.message}`,
      );
    }
    if (s.issues.length > top.length) {
      body.push(`    … and ${s.issues.length - top.length} more`);
    }
    if (multi) body.push('');
  }
  return [...headline, ...body].join('\n');
}

function severityRank(severity: 'error' | 'warning'): number {
  return severity === 'error' ? 0 : 1;
}

// ── Renderers (exported for testing) ─────────────────────────────────────────

/**
 * Render a compact boards table. Width-aware so a 60-col terminal still gets
 * useful output (column titles truncated, counts abbreviated).
 */
export function renderBoardsList(boards: readonly KanbanBoardSummary[], width = 80): string {
  if (boards.length === 0) {
    return [
      '📋 **Kanban boards** — none yet',
      '',
      '  Create one with `/kanban create <title>`.',
    ].join('\n');
  }

  const sorted = [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const titleWidth = Math.max(12, Math.min(40, Math.floor(width / 2) - 4));
  const idWidth = 8;
  const tagMarker = sorted.some((b) => b.tags && b.tags.length > 0);

  const header = [
    '📋 **Kanban boards**',
    '',
    `  ${sorted.length} board${sorted.length === 1 ? '' : 's'}` +
      (sorted.some((b) => b.taskCount > 0)
        ? ` · ${sorted.reduce((s, b) => s + b.taskCount, 0)} tasks` +
          ` · ${sorted.reduce((s, b) => s + b.completedTaskCount, 0)} done`
        : ''),
    '',
  ];

  const rows: string[] = [];
  for (const board of sorted) {
    const title = truncate(board.title, titleWidth);
    const id = board.id.slice(0, idWidth);
    const taskInfo =
      `${board.taskCount} task${board.taskCount === 1 ? '' : 's'}` +
      (board.completedTaskCount > 0 ? ` (${board.completedTaskCount} done)` : '');
    const tag = board.tags?.includes('🎯')
      ? ' 🎯'
      : board.tags?.some((t: string) => t.startsWith('goal:'))
        ? ' 🎯'
        : '';
    rows.push(`  ${title.padEnd(titleWidth)}  ${id}  ${taskInfo}${tag}`);
  }

  const parts = [...header, ...rows];
  if (tagMarker) {
    parts.push('', '  🎯 = goal/SDD-linked board');
  }
  parts.push('', '  Use `/kanban` to open the interactive panel.');
  return parts.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return text.slice(0, max - 1) + '…';
}
