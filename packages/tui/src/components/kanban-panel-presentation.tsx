import {
  describeKanbanBoundary,
  type KanbanBoard,
  type KanbanBoardSummary,
  type KanbanLifecycleStage,
  type KanbanLink,
  type KanbanTask,
} from '@wrongstack/kanban';
import type React from 'react';
import { Box, Text } from '../ink.js';
import {
  type KanbanAuditSeverity,
  type KanbanAuditSummary,
  summarizeAuditHeadline,
  topAuditIssues,
} from '../kanban-audit.js';
import { theme } from '../theme.js';
import { panelWindow, truncatePanelText } from './monitor-shell.js';

export function CompactBoard({
  board,
  activeTaskId,
  rows,
  width,
}: {
  board: KanbanBoard;
  activeTaskId: string | undefined;
  rows: number;
  width: number;
}): React.ReactElement {
  const tasks = [...board.tasks].sort((a, b) => a.order - b.order);
  const selected = Math.max(
    0,
    tasks.findIndex((task) => task.id === activeTaskId),
  );
  const window = panelWindow(tasks.length, selected, rows);
  return (
    <Box flexDirection="column">
      {tasks.length === 0 ? <Text dimColor>No tasks. Press a to add.</Text> : null}
      {tasks.slice(window.start, window.end).map((task) => (
        <Text
          key={task.id}
          color={task.id === activeTaskId ? theme.accent : theme.textSecondary}
          wrap="truncate-end"
        >
          {truncatePanelText(
            `${task.id === activeTaskId ? '›' : ' '} ${board.columns.find((column) => column.id === task.columnId)?.title ?? ''}: ${task.title}`,
            width,
          )}
        </Text>
      ))}
    </Box>
  );
}

export function PromptLine({ prompt }: { prompt: PromptMode }): React.ReactElement {
  if (prompt.kind === 'confirmDeleteTask') {
    return <Text color="yellow">Delete "{prompt.task.title}"? y/n</Text>;
  }
  if (prompt.kind === 'transitionTask') {
    return (
      <Text>
        <Text color="magenta">
          {prompt.to.toUpperCase()} "{prompt.task.title}":{' '}
        </Text>
        {prompt.buffer}
        <Text dimColor>
          _ <Text dimColor>(Esc cancel · Enter confirm — comment required)</Text>
        </Text>
      </Text>
    );
  }
  const label = prompt.kind === 'createBoard' ? 'New board title' : 'New task title';
  return (
    <Text>
      <Text color="cyan">{label}: </Text>
      {prompt.buffer}
      <Text dimColor>_</Text>
    </Text>
  );
}

export function BoardList({
  boards,
  selected,
}: {
  boards: KanbanBoardSummary[];
  selected: number;
}): React.ReactElement {
  const window = panelWindow(boards.length, selected, 12);
  return (
    <Box flexDirection="column" width={24} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">
        Boards
      </Text>
      {boards.slice(window.start, window.end).map((item, index) => (
        <Text
          key={item.id}
          color={window.start + index === selected ? 'cyan' : undefined}
          wrap="truncate"
        >
          {window.start + index === selected ? '>' : ' '} {item.title} ({item.taskCount})
        </Text>
      ))}
      {boards.length > 12 ? <Text dimColor>... {boards.length - 12} more</Text> : null}
    </Box>
  );
}

/**
 * Pure, deterministic layout math for the kanban board's column view.
 *
 * Reserves horizontal space for the chrome that surrounds the columns
 * (board list panel + task detail panel + gaps + outer border), then
 * picks the largest column count that still keeps every column at least
 * `minColumnWidth` cols wide, and finally shrinks each column's width to
 * match the available budget (never below `minColumnWidth`).
 *
 * Exported so Sprint 2's regression tests can pin the math down without
 * mounting Ink.
 */
export function computeBoardColumnLayout(
  totalColumns: number,
  terminalWidth: number,
): { visibleColumnCount: number; columnWidth: number; overflow: number } {
  const chromeCols = 24 + 1 + 34 + 1 + 4;
  const minColumnWidth = 16;
  const preferredColumnWidth = 26;
  const maxColumnsForWidth = Math.max(
    2,
    Math.floor((terminalWidth - chromeCols + 1) / (minColumnWidth + 1)),
  );
  const visibleColumnCount = Math.max(2, Math.min(totalColumns, Math.min(5, maxColumnsForWidth)));
  const columnWidth = Math.max(
    minColumnWidth,
    Math.min(
      preferredColumnWidth,
      Math.floor((terminalWidth - chromeCols - (visibleColumnCount - 1)) / visibleColumnCount),
    ),
  );
  const overflow = Math.max(0, totalColumns - visibleColumnCount);
  return { visibleColumnCount, columnWidth, overflow };
}

export function BoardColumns({
  board,
  activeTaskId,
  terminalWidth = 100,
}: {
  board: KanbanBoard;
  activeTaskId?: string | undefined;
  terminalWidth?: number | undefined;
}): React.ReactElement {
  const { visibleColumnCount, columnWidth, overflow } = computeBoardColumnLayout(
    board.columns.length,
    terminalWidth,
  );
  const isManaged = board.lifecycle?.mode === 'managed';
  const columns = [...board.columns].sort((a, b) => a.order - b.order);
  const activeColumn = board.tasks.find((task) => task.id === activeTaskId)?.columnId;
  const columnWindow = panelWindow(
    columns.length,
    Math.max(
      0,
      columns.findIndex((column) => column.id === activeColumn),
    ),
    visibleColumnCount,
  );

  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {columns.slice(columnWindow.start, columnWindow.end).map((column) => {
        const allTasks = board.tasks
          .filter((task) => task.columnId === column.id)
          .sort((a, b) => a.order - b.order);
        const stage = isManaged ? stageForColumn(board, column.id) : null;
        const taskWindow = panelWindow(
          allTasks.length,
          Math.max(
            0,
            allTasks.findIndex((task) => task.id === activeTaskId),
          ),
          8,
        );
        const indicator = stage ? stageToIndicator(stage) : null;
        return (
          <Box key={column.id} flexDirection="column" width={columnWidth}>
            <Box flexDirection="row" gap={1}>
              <Text bold color="cyan" wrap="truncate">
                {column.title} ({allTasks.length})
              </Text>
              {indicator ? (
                <Text color={indicator.color} wrap="truncate">
                  {indicator.glyph} {stage}
                </Text>
              ) : null}
            </Box>
            {allTasks.length === 0 ? (
              <Text dimColor> empty</Text>
            ) : (
              allTasks.slice(taskWindow.start, taskWindow.end).map((task) => (
                <Text
                  key={task.id}
                  color={task.id === activeTaskId ? 'cyan' : undefined}
                  wrap="truncate"
                >
                  {task.id === activeTaskId ? '>' : ' '} {statusIcon(task.status)} {task.title}
                  {task.assignedAgent ? <Text dimColor> @{task.assignedAgent}</Text> : null}
                </Text>
              ))
            )}
            {allTasks.length > 8 ? <Text dimColor> ... {allTasks.length - 8} more</Text> : null}
          </Box>
        );
      })}
      {overflow > 0 ? (
        <Box flexDirection="column" width={columnWidth}>
          <Text dimColor wrap="truncate">
            + {overflow} more column{overflow === 1 ? '' : 's'}
          </Text>
          <Text dimColor>(Tab follows tasks across columns)</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Whether a board enforces the managed Kanban Agent lifecycle. Managed boards
 * reject free-form status/column writes (see `assertManagedTaskPatchAllowed`
 * in `@wrongstack/kanban`), so the TUI must route progress through
 * `transitionTask` rather than `moveTask`/`updateTask`.
 */
export function isManagedBoard(board: KanbanBoard | null): boolean {
  return board?.lifecycle?.mode === 'managed';
}

const MANAGED_STAGE_ORDER: readonly KanbanLifecycleStage[] = [
  'backlog',
  'todo',
  'running',
  'review',
  'done',
];

/**
 * The next stage a managed card may advance to, or null when the card is
 * already at the terminal `done` stage (or the current stage is unknown).
 * The domain only allows one-step forward transitions; callers must keep
 * this in lockstep with `KANBAN_AGENT_STAGES` in `@wrongstack/kanban`.
 *
 * Exported so unit tests can pin the stage order without rendering the panel.
 */
export function nextManagedStage(current: KanbanLifecycleStage): KanbanLifecycleStage | null {
  const idx = MANAGED_STAGE_ORDER.indexOf(current);
  return idx >= 0 && idx < MANAGED_STAGE_ORDER.length - 1 ? MANAGED_STAGE_ORDER[idx + 1]! : null;
}

/**
 * Look up the lifecycle stage that owns the given column under a managed
 * Kanban Agent board. Returns null when the board is not managed, or when
 * the column is not mapped to any of the five canonical stages (treated
 * as a legacy/custom column by the renderer).
 */
export function stageForColumn(
  board: Pick<KanbanBoard, 'lifecycle'>,
  columnId: string,
): KanbanLifecycleStage | null {
  const policy = board.lifecycle;
  if (policy?.mode !== 'managed') return null;
  const stages: readonly KanbanLifecycleStage[] = ['backlog', 'todo', 'running', 'review', 'done'];
  return stages.find((stage) => policy.columns[stage] === columnId) ?? null;
}

/**
 * Map a lifecycle stage to the visual indicator shown in the column
 * header. Mirrors the WebUI palette so the same board reads the same in
 * either surface.
 */
function stageToIndicator(stage: KanbanLifecycleStage): {
  glyph: string;
  color: string;
} {
  switch (stage) {
    case 'backlog':
      return { glyph: '◷', color: 'gray' };
    case 'todo':
      return { glyph: '◳', color: 'blue' };
    case 'running':
      return { glyph: '◍', color: 'yellow' };
    case 'review':
      return { glyph: '◑', color: 'magenta' };
    case 'done':
      return { glyph: '✓', color: 'green' };
  }
}

export function TaskDetail({
  board,
  task,
  target,
}: {
  board: KanbanBoard;
  task: KanbanTask | null;
  target?: KanbanBoardSummary | undefined;
}): React.ReactElement {
  return (
    <Box flexDirection="column" width={34} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">
        Task
      </Text>
      {!task ? (
        <Text dimColor>No task selected.</Text>
      ) : (
        <>
          <Text wrap="truncate">{task.title}</Text>
          <Text dimColor>ID {task.id.slice(0, 8)}</Text>
          <Text>
            {task.priority.toUpperCase()} / {task.status}
          </Text>
          <Text dimColor>Column {columnTitle(board, task.columnId)}</Text>
          {task.dueDate ? <Text dimColor>Due {task.dueDate}</Text> : null}
          {task.lifecycle ? (
            <Text dimColor>
              Stage {task.lifecycle.currentStage} (since {task.lifecycle.stageEnteredAt})
            </Text>
          ) : null}
          {task.description ? <Text wrap="truncate">{task.description}</Text> : null}
          <Text color={task.boundary?.enabled || board.boundary?.enabled ? 'yellow' : 'gray'}>
            Scope {describeKanbanBoundary(task.boundary)}
            {board.boundary?.enabled ? ' + board ceiling' : ''}
          </Text>
          {(task.boundary?.allow ?? board.boundary?.allow)?.slice(0, 3).map((selector) => (
            <Text
              key={`${selector.kind}:${selector.path}:${selector.access}`}
              dimColor
              wrap="truncate"
            >
              {selector.access} {selector.kind}:{selector.path}
            </Text>
          ))}
          {task.assignment ? (
            <Text wrap="truncate">
              Agent {task.assignment.agentId ?? task.assignedAgent ?? task.assignment.role ?? '-'} /{' '}
              {task.assignment.status}
            </Text>
          ) : task.assignedAgent ? (
            <Text wrap="truncate">Agent {task.assignedAgent}</Text>
          ) : null}
          {task.dependsOn?.length ? <Text dimColor>Depends on {task.dependsOn.length}</Text> : null}
          {renderSuccessCriteria(task)}
          {renderGoalMetrics(task)}
          {renderLinks(task)}
          {target ? <Text dimColor>C/T target: {target.title}</Text> : null}
          <Text dimColor>
            {board.lifecycle?.mode === 'managed'
              ? '→/t transition | x delete'
              : 'space done | b block | x delete'}
          </Text>
        </>
      )}
    </Box>
  );
}

/**
 * Pure success-criteria summary string. Returns null when there are no
 * checks. Format: "Criteria N/M passed".
 */
export function summarizeSuccessCriteria(task: KanbanTask): string | null {
  if (!task.successCriteria || task.successCriteria.length === 0) return null;
  const passed = task.successCriteria.filter((c) => c.status === 'passed').length;
  const total = task.successCriteria.length;
  return `Criteria ${passed}/${total} passed`;
}

/** Render the success-criteria summary line, e.g. "Criteria 2/3 passed". */
function renderSuccessCriteria(task: KanbanTask): React.ReactElement | null {
  const summary = summarizeSuccessCriteria(task);
  if (!summary) return null;
  return <Text dimColor>{summary}</Text>;
}

/**
 * Pure goal-metrics rollup string. Returns null when there are no metrics.
 * Format: "Metrics 2 met · 1 missed · 0 waived · 0 pending" (zero counts
 * are skipped to keep the line short).
 */
export function summarizeGoalMetrics(task: KanbanTask): string | null {
  if (!task.goalMetrics || task.goalMetrics.length === 0) return null;
  const counts = { met: 0, missed: 0, waived: 0, pending: 0 };
  for (const metric of task.goalMetrics) {
    if (metric.status === 'met') counts.met++;
    else if (metric.status === 'missed') counts.missed++;
    else if (metric.status === 'waived') counts.waived++;
    else counts.pending++;
  }
  const parts: string[] = [];
  if (counts.met > 0) parts.push(`${counts.met} met`);
  if (counts.missed > 0) parts.push(`${counts.missed} missed`);
  if (counts.waived > 0) parts.push(`${counts.waived} waived`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  return `Metrics ${parts.join(' · ')}`;
}

/** Render a compact goal-metrics rollup — counts per status. */
function renderGoalMetrics(task: KanbanTask): React.ReactElement | null {
  const summary = summarizeGoalMetrics(task);
  if (!summary) return null;
  return <Text dimColor>{summary}</Text>;
}

/** Render each link on its own line, prefixed by its type icon. */
function renderLinks(task: KanbanTask): React.ReactElement | null {
  if (!task.links || task.links.length === 0) return null;
  return (
    <Box flexDirection="column">
      <Text dimColor>Links ({task.links.length})</Text>
      {task.links.slice(0, 4).map((link, i) => (
        <Text key={`${link.url}-${i}`} wrap="truncate">
          {linkIcon(link.type)} {link.title ?? link.url}
        </Text>
      ))}
      {task.links.length > 4 ? <Text dimColor>... {task.links.length - 4} more</Text> : null}
    </Box>
  );
}

function linkIcon(type: KanbanLink['type']): string {
  switch (type) {
    case 'issue':
      return '🐞';
    case 'pr':
      return '🔀';
    case 'doc':
      return '📄';
    case 'commit':
      return '📌';
    case 'design':
      return '🎨';
    case 'file':
      return '📎';
    case 'url':
      return '🔗';
    default:
      return '·';
  }
}

/**
 * Inline Kanban Cleaner summary — mirrors the WebUI's `KanbanCleanerAlert`
 * but pinned to the project root. Shows the headline counts at the top
 * of the panel and the top-3 issues, scoped per board so users see what
 * the Cleaner would flag without leaving the TUI.
 *
 * The component renders nothing when the audit is empty so a clean
 * board doesn't add visual noise.
 */
export function AuditAlert({
  summary,
  topN = 3,
}: {
  summary: KanbanAuditSummary;
  topN?: number | undefined;
}): React.ReactElement | null {
  const headline = summarizeAuditHeadline(summary);
  if (!headline) return null;
  const issues = topAuditIssues(summary, topN);
  const badgeColor: string =
    summary.counts.error > 0 ? 'red' : summary.counts.warning > 0 ? 'yellow' : 'gray';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={badgeColor}
      paddingX={1}
      marginBottom={1}
    >
      <Box flexDirection="row" gap={1}>
        <Text color={badgeColor} bold>
          ⚠ {headline}
        </Text>
      </Box>
      {issues.length > 0 ? (
        <Box flexDirection="column">
          {issues.map((issue, index) => (
            <Text
              key={`${issue.id}-${index}`}
              color={severityToneColor(issue.severity)}
              wrap="truncate"
            >
              {'  '}
              {severityGlyph(issue.severity)} {issue.taskTitle}: {issue.message}
            </Text>
          ))}
          {summary.issues.length > issues.length ? (
            <Text dimColor>{`  … and ${summary.issues.length - issues.length} more`}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function severityGlyph(severity: KanbanAuditSeverity): string {
  return severity === 'error' ? '⨯' : '!';
}

function severityToneColor(severity: KanbanAuditSeverity): string {
  return severity === 'error' ? 'red' : 'yellow';
}

export function BoardSummary({
  board,
  target,
}: {
  board: KanbanBoard;
  target?: KanbanBoardSummary | undefined;
}): React.ReactElement {
  const done = board.tasks.filter((task) => task.status === 'completed').length;
  return (
    <Box flexDirection="row" gap={1} marginBottom={1}>
      <Text dimColor>ID {board.id.slice(0, 8)}</Text>
      <Text dimColor>|</Text>
      <Text dimColor>{board.columns.length} columns</Text>
      <Text dimColor>|</Text>
      <Text dimColor>{board.tasks.length} tasks</Text>
      <Text dimColor>|</Text>
      <Text color={done === board.tasks.length && done > 0 ? 'green' : 'yellow'}>{done} done</Text>
      <Text dimColor>|</Text>
      <Text color={board.boundary?.enabled ? 'yellow' : 'gray'}>
        scope {describeKanbanBoundary(board.boundary)}
      </Text>
      {target ? (
        <>
          <Text dimColor>|</Text>
          <Text dimColor>next board: {target.title}</Text>
        </>
      ) : null}
    </Box>
  );
}

export function nextBoard(
  boards: KanbanBoardSummary[],
  boardId: string | undefined,
): KanbanBoardSummary | undefined {
  if (!boardId || boards.length < 2) return undefined;
  const index = boards.findIndex((item) => item.id === boardId);
  if (index === -1) return boards.find((item) => item.id !== boardId);
  for (let offset = 1; offset < boards.length; offset++) {
    const candidate = boards[(index + offset) % boards.length];
    if (candidate && candidate.id !== boardId) return candidate;
  }
  return undefined;
}

export function adjacentColumn(
  columns: KanbanBoard['columns'],
  columnId: string,
  delta: -1 | 1,
): KanbanBoard['columns'][number] | undefined {
  const index = columns.findIndex((column) => column.id === columnId);
  if (index === -1) return undefined;
  return columns[index + delta];
}

export function doneColumnId(board: KanbanBoard): string | undefined {
  return board.columns.find((column) =>
    ['done', 'completed', 'finished'].includes(column.id.toLowerCase()),
  )?.id;
}

function columnTitle(board: KanbanBoard, columnId: string): string {
  return board.columns.find((column) => column.id === columnId)?.title ?? columnId;
}

function statusIcon(status: string): string {
  if (status === 'completed') return 'x';
  if (status === 'blocked') return '!';
  if (status === 'in_progress') return '>';
  if (status === 'failed') return '!';
  if (status === 'review') return '?';
  return '-';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type PromptMode =
  | { kind: 'createBoard'; buffer: string }
  | { kind: 'addTask'; buffer: string }
  | { kind: 'confirmDeleteTask'; task: KanbanTask }
  | { kind: 'transitionTask'; task: KanbanTask; to: KanbanLifecycleStage; buffer: string };
