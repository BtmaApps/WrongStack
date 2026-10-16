import type { TodoItem } from '@wrongstack/core/agent';
import type React from 'react';
import type { GoalSummary } from '../app-state.js';
import type { QueueItem } from '../app-state-core-types.js';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import {
  SidebarCountsRow,
  SidebarMeter,
  SidebarPanelFrame,
  SidebarSectionHeader,
  SidebarStatRow,
  trunc,
} from './sidebar-panel-frame.js';
import { EmptyState, SidebarWorklistRow } from './sidebar-panels-shared.js';
import { fmtRatioPct } from './status-bar-format.js';

export type {
  KanbanPanelSidebarProps,
  SessionsPanelSidebarProps,
} from './sidebar-panels-sessions.js';
export { KanbanPanelSidebar, SessionsPanelSidebar } from './sidebar-panels-sessions.js';

export interface PlanPanelSidebarProps {
  openCount: number;
  inProgressCount: number;
  doneCount: number;
  items: readonly { id: string; title: string; status: 'open' | 'in_progress' | 'done' }[];
  title?: string | undefined;
  width: number;
}

export function PlanPanelSidebar({
  openCount,
  inProgressCount,
  doneCount,
  items,
  title,
  width,
}: PlanPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const total = openCount + inProgressCount + doneCount;
  const ratio = total > 0 ? doneCount / total : 0;
  const ordered = [
    ...items.filter((i) => i.status === 'in_progress').slice(0, 3),
    ...items.filter((i) => i.status === 'open').slice(0, 4),
    ...items.filter((i) => i.status === 'done').slice(0, 2),
  ];
  // The header pill summarizes the panel's state in one place. On wide rails
  // (innerWidth >= 22) it sits on the title row's right edge; on narrower
  // rails the right side falls back to a status row beneath the title.
  return (
    <SidebarPanelFrame
      accent={theme.accent}
      icon={glyphs.plan}
      title="PLAN"
      width={width}
      kicker={title ? trunc(title, 20) : undefined}
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? fmtRatioPct(ratio) : undefined}
      pillColor={ratio === 1 && total > 0 ? theme.success : theme.accent}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.warn}>
              {glyphs.bulletHalf}
              {inProgressCount}
            </Text>
            <Text color={theme.textMuted}> </Text>
            <Text color={theme.success}>
              {glyphs.success}
              {doneCount}
            </Text>
            <Text color={theme.textMuted}> {total}</Text>
          </Text>
        ) : undefined
      }
      footer="F5 details"
    >
      <SidebarSectionHeader
        glyph={glyphs.plan}
        label="PROGRESS"
        color={theme.accent}
        badge={fmtRatioPct(ratio)}
        badgeColor={ratio === 1 && total > 0 ? theme.success : theme.accent}
        innerWidth={bodyWidth}
        pill
      />
      <Box marginTop={1} width={bodyWidth}>
        <Text color={ratio === 1 && total > 0 ? theme.success : theme.accent}>
          {glyphs.barFull.repeat(Math.round(ratio * bodyWidth))}
        </Text>
        <Text color={theme.borderSubtle}>
          {glyphs.barEmpty.repeat(Math.max(0, bodyWidth - Math.round(ratio * bodyWidth)))}
        </Text>
      </Box>
      <SidebarSectionHeader
        glyph={glyphs.task}
        label="STEPS"
        color={theme.textMuted}
        badge={`${doneCount}/${total}`}
        innerWidth={bodyWidth}
        pill
      />
      {ordered.length === 0 ? (
        <EmptyState message="no plan items" innerWidth={bodyWidth} />
      ) : (
        ordered.map((item) => {
          const icon =
            item.status === 'done'
              ? glyphs.success
              : item.status === 'in_progress'
                ? glyphs.bulletHalf
                : glyphs.bulletOpen;
          const color =
            item.status === 'done'
              ? theme.success
              : item.status === 'in_progress'
                ? theme.warn
                : theme.textMuted;
          return (
            <SidebarWorklistRow
              key={item.id}
              icon={icon}
              iconColor={color}
              label={item.title}
              labelColor={item.status === 'done' ? theme.textMuted : theme.textPrimary}
              innerWidth={bodyWidth}
              dim={item.status === 'done'}
              strikethrough={item.status === 'done'}
            />
          );
        })
      )}
    </SidebarPanelFrame>
  );
}

export interface TodosPanelSidebarProps {
  todos: readonly TodoItem[];
  width: number;
}

export function TodosPanelSidebar({ todos, width }: TodosPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const ordered = [...todos]
    .sort((a, b) => {
      const rank = (t: TodoItem) =>
        t.status === 'in_progress' ? 0 : t.status === 'pending' ? 1 : 2;
      return rank(a) - rank(b);
    })
    .slice(0, 12);
  const done = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const pending = todos.filter((t) => t.status === 'pending').length;
  const complete = todos.length > 0 && done === todos.length;
  return (
    <SidebarPanelFrame
      accent={theme.accent}
      icon={glyphs.goal}
      title="TODOS"
      width={width}
      kicker="mission queue"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${done}/${todos.length}` : undefined}
      pillColor={complete ? theme.success : theme.accent}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.success}>{done}</Text>
            <Text color={theme.textMuted}>/{todos.length}</Text>
          </Text>
        ) : undefined
      }
      footer="F6 details"
    >
      <SidebarMeter
        ratio={todos.length > 0 ? done / todos.length : 0}
        innerWidth={bodyWidth}
        color={complete ? theme.success : theme.accent}
        marginTop={0}
      />
      <SidebarCountsRow
        counts={[
          { label: glyphs.running, count: inProgress, color: theme.accent },
          { label: glyphs.pending, count: pending, color: theme.textMuted },
          { label: glyphs.success, count: done, color: theme.success },
        ]}
        innerWidth={bodyWidth}
        marginTop={1}
      />
      {ordered.length === 0 ? (
        <EmptyState message="no todos" innerWidth={bodyWidth} />
      ) : (
        ordered.map((t) => {
          const icon =
            t.status === 'completed'
              ? glyphs.success
              : t.status === 'in_progress'
                ? glyphs.running
                : glyphs.pending;
          const color =
            t.status === 'completed'
              ? theme.success
              : t.status === 'in_progress'
                ? theme.accent
                : theme.textMuted;
          const base = t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content;
          const label = t.blockedBy?.[0] ? `${base} — waiting on ${t.blockedBy[0]}` : base;
          return (
            <SidebarWorklistRow
              key={t.id}
              icon={icon}
              iconColor={color}
              label={label}
              labelColor={t.status === 'completed' ? theme.textMuted : theme.textPrimary}
              innerWidth={bodyWidth}
              dim={t.status === 'completed'}
              strikethrough={t.status === 'completed'}
            />
          );
        })
      )}
    </SidebarPanelFrame>
  );
}

export interface QueuePanelSidebarProps {
  items: readonly QueueItem[];
  width: number;
}

export function QueuePanelSidebar({ items, width }: QueuePanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  return (
    <SidebarPanelFrame
      accent={theme.accent}
      icon={glyphs.queue}
      title="QUEUE"
      width={width}
      kicker="queued prompts"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${items.length}` : undefined}
      pillColor={items.length > 0 ? theme.warn : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={items.length > 0 ? theme.warn : theme.textMuted} bold>
            {items.length}
          </Text>
        ) : undefined
      }
      footer="F7 details"
    >
      {items.length === 0 ? (
        <EmptyState message="queue is empty" innerWidth={bodyWidth} />
      ) : (
        items
          .slice(0, 10)
          .map((item, i) => (
            <SidebarWorklistRow
              key={item.id ?? i}
              icon={String(i + 1).padStart(2, '0')}
              iconColor={i === 0 ? theme.accent : theme.textMuted}
              label={item.displayText}
              labelColor={i === 0 ? theme.textPrimary : theme.textSecondary}
              innerWidth={bodyWidth}
            />
          ))
      )}
    </SidebarPanelFrame>
  );
}

export interface ProcessListPanelSidebarProps {
  activeCount: number;
  totalCount: number;
  processes: readonly { pid: number; name: string; status?: string }[];
  width: number;
}

export function ProcessListPanelSidebar({
  activeCount,
  totalCount,
  processes,
  width,
}: ProcessListPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  return (
    <SidebarPanelFrame
      accent={theme.monitor.fleet}
      icon={glyphs.process}
      title="PROCESSES"
      width={width}
      kicker="running"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${activeCount}/${totalCount}` : undefined}
      pillColor={activeCount > 0 ? theme.success : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.success}>{activeCount}</Text>
            <Text color={theme.textMuted}>/{totalCount}</Text>
          </Text>
        ) : undefined
      }
      footer="F8 details"
    >
      <SidebarCountsRow
        counts={[
          { label: glyphs.running, count: activeCount, color: theme.success },
          {
            label: glyphs.failure,
            count: processes.filter((p) => (p.status ?? '').toLowerCase() === 'failed').length,
            color: theme.error,
          },
        ]}
        innerWidth={bodyWidth}
        marginTop={processes.length > 0 ? 1 : 0}
      />
      {processes.length === 0 ? (
        <EmptyState message="no processes" innerWidth={bodyWidth} />
      ) : (
        processes.slice(0, 10).map((p, i) => {
          const status = (p.status ?? '').toLowerCase();
          const statusVisual =
            status === 'running'
              ? { glyph: glyphs.running, color: theme.success }
              : status === 'idle' || status === 'stopped' || status === 'paused'
                ? { glyph: glyphs.idle, color: theme.textMuted }
                : status === 'failed'
                  ? { glyph: glyphs.failure, color: theme.error }
                  : { glyph: glyphs.running, color: theme.success };
          const showPid = inner >= METRIC_MIN_BODY_WIDTH;
          const pidLabel = String(p.pid);
          return (
            <Box key={`${p.pid}-${i}`} flexDirection="row" width={bodyWidth}>
              <Text color={statusVisual.color}>{statusVisual.glyph}</Text>
              <Text color={theme.textPrimary}> </Text>
              <Text wrap="truncate">
                {trunc(
                  p.name,
                  Math.max(4, bodyWidth - 2 - (showPid ? displayWidth(pidLabel) + 1 : 0)),
                )}
              </Text>
              {showPid ? (
                <>
                  <Box flexGrow={1} />
                  <Text color={theme.textMuted}>{pidLabel}</Text>
                </>
              ) : null}
            </Box>
          );
        })
      )}
    </SidebarPanelFrame>
  );
}

export interface GoalPanelSidebarProps {
  goal: GoalSummary | null;
  coordinatorRunning: boolean;
  width: number;
}

export function GoalPanelSidebar({
  goal,
  coordinatorRunning,
  width,
}: GoalPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const displayGoal = goal ? goal.refinedGoal || goal.goal : '';
  const stateVisual = goal
    ? goal.goalState === 'active'
      ? { glyph: glyphs.running, color: theme.warn }
      : goal.goalState === 'paused'
        ? { glyph: glyphs.pause, color: theme.textMuted }
        : goal.goalState === 'completed'
          ? { glyph: glyphs.success, color: theme.success }
          : { glyph: glyphs.idle, color: theme.textMuted }
    : { glyph: glyphs.idle, color: theme.textMuted };
  const progress = Math.min(
    100,
    Math.max(0, typeof goal?.progress === 'number' ? goal.progress : 0),
  );
  const deliverables = goal?.deliverables ?? [];
  // Done markers are prefixes (canonical DONE_PREFIX in core
  // goal-coordination.ts) — keep the alternation grouped under one '^' so
  // ✅/(done) appearing mid-string stays pending (badge count + row state).
  const doneCount = deliverables.filter((d) => /^(?:\[[x✓]\]|✅|\(done\))/i.test(d)).length;
  return (
    <SidebarPanelFrame
      accent={theme.brand}
      icon={glyphs.goal}
      title="GOAL"
      width={width}
      kicker="mission control"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH && goal
          ? `${stateVisual.glyph} ${goal.goalState.toUpperCase()}`
          : undefined
      }
      pillColor={coordinatorRunning ? theme.success : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH && goal ? (
          <Text color={coordinatorRunning ? theme.success : theme.textMuted} bold>
            {stateVisual.glyph} {goal.goalState.toUpperCase()}
          </Text>
        ) : null
      }
      footer="F9 details"
    >
      {!goal ? (
        <EmptyState message="no mission set" innerWidth={bodyWidth} />
      ) : (
        <>
          <SidebarSectionHeader
            glyph={glyphs.goal}
            label="MISSION"
            color={theme.brand}
            innerWidth={bodyWidth}
          />
          <Text color={theme.textPrimary} bold wrap="truncate">
            {trunc(displayGoal, bodyWidth - 2)}
          </Text>
          <SidebarStatRow
            label={`${stateVisual.glyph} state`}
            value={goal.goalState.toUpperCase()}
            color={stateVisual.color}
            innerWidth={bodyWidth}
            accent={stateVisual.color}
          />
          <SidebarSectionHeader
            glyph={glyphs.success}
            label="PROGRESS"
            color={theme.success}
            badge={`${Math.round(progress)}%`}
            innerWidth={bodyWidth}
            pill
          />
          <SidebarMeter
            ratio={progress / 100}
            innerWidth={bodyWidth}
            color={progress >= 100 ? theme.success : theme.brand}
          />
          <SidebarSectionHeader
            glyph={glyphs.task}
            label="DELIVERABLES"
            color={theme.warn}
            badge={`${doneCount}/${deliverables.length}`}
            innerWidth={bodyWidth}
            pill
          />
          {deliverables.length === 0 ? (
            <EmptyState message="no deliverables" innerWidth={bodyWidth} />
          ) : (
            deliverables.slice(0, 6).map((d, i) => {
              const done = /^(?:\[[x✓]\]|✅|\(done\))/i.test(d);
              return (
                <SidebarWorklistRow
                  key={i}
                  icon={done ? glyphs.success : glyphs.pending}
                  iconColor={done ? theme.success : theme.textMuted}
                  label={d.replace(/^\[[ x✓]\]\s*/, '')}
                  labelColor={done ? theme.textMuted : theme.textSecondary}
                  innerWidth={bodyWidth}
                  dim={done}
                  strikethrough={done}
                />
              );
            })
          )}
        </>
      )}
    </SidebarPanelFrame>
  );
}
