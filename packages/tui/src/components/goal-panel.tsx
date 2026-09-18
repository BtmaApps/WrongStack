import type React from 'react';
import { useEffect, useState } from 'react';
import type { GoalSummary } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import { glyphs } from '../ui-glyphs.js';
import {
  EmptyPanelState,
  KeyCap,
  MonitorShell,
  panelWindow,
  truncatePanelText,
  usePanelInput as useInput,
  useMonitorSize,
  usePanelShortcutsEnabled,
} from './monitor-shell.js';
import { fmtPct } from './status-bar-format.js';

export interface GoalPanelProps {
  goal: GoalSummary;
  /** Start the AutonomousCoordinator with the given goal text. */
  onCoordinatorStart?: ((goal: string) => void) | undefined;
  /** Stop the AutonomousCoordinator. */
  onCoordinatorStop?: (() => void) | undefined;
  /** Whether the coordinator is currently running. */
  coordinatorRunning?: boolean | undefined;
}

/**
 * Full-screen overlay showing the current goal, deliverables checklist,
 * and progress bar. Opened with F9.
 */
export function GoalPanel({
  goal,
  onCoordinatorStart,
  onCoordinatorStop,
  coordinatorRunning,
}: GoalPanelProps): React.ReactElement {
  const size = useMonitorSize();
  const compact = size.rows < 20;
  const [selectedDeliverable, setSelectedDeliverable] = useState(0);
  const deliverableCount = goal?.deliverables?.length ?? 0;
  useEffect(() => {
    setSelectedDeliverable((value) => Math.min(value, Math.max(0, deliverableCount - 1)));
  }, [deliverableCount]);
  // Keyboard shortcuts for coordinator control (called before early returns so hooks always fire)
  const shortcutsEnabled = usePanelShortcutsEnabled();
  useInput((input, key) => {
    if (key.ctrl || key.meta) return;
    if (shortcutsEnabled && (input === 'c' || input === 'C')) {
      if (onCoordinatorStart && goal && !coordinatorRunning) {
        const goalText = goal.refinedGoal || goal.goal;
        onCoordinatorStart(goalText);
      }
    }
    if (shortcutsEnabled && input === 'S') {
      if (onCoordinatorStop && coordinatorRunning) {
        onCoordinatorStop();
      }
    }
    if (key.upArrow) {
      setSelectedDeliverable((value) => Math.max(0, value - 1));
    } else if (key.downArrow) {
      setSelectedDeliverable((value) => Math.min(Math.max(0, deliverableCount - 1), value + 1));
    }
  });

  if (!goal) {
    return (
      <MonitorShell
        accent={theme.brand}
        icon={glyphs.goal}
        title="GOAL"
        kicker="mission control"
        right={
          <Text color={coordinatorRunning ? theme.success : theme.textMuted}>
            ● coordinator {coordinatorRunning ? 'running' : 'idle'}
          </Text>
        }
        footer={<KeyCap keepTogether keyName="F9/Esc" label="close" color={theme.brand} />}
      >
        <EmptyPanelState
          icon="◇"
          title="No mission set"
          detail="Use /goal set <mission> to define the outcome."
          accent={theme.brand}
        />
      </MonitorShell>
    );
  }

  const displayGoal = goal.refinedGoal || goal.goal;
  const stateIcon =
    goal.goalState === 'active'
      ? '🔄'
      : goal.goalState === 'paused'
        ? '⏸'
        : goal.goalState === 'completed'
          ? '✅'
          : '⏹';

  const stateColor =
    goal.goalState === 'active'
      ? 'green'
      : goal.goalState === 'paused'
        ? 'yellow'
        : goal.goalState === 'completed'
          ? 'green'
          : 'red';
  const deliverables = goal.deliverables ?? [];
  const isDone = (text: string) => /^\[[x✓]\]|✅|\(done\)/i.test(text);
  const doneDeliverables = deliverables.filter(isDone).length;
  const deliverableLimit = Math.max(1, size.contentRows - 7);
  const deliverableWindow = panelWindow(deliverables.length, selectedDeliverable, deliverableLimit);
  const visibleDeliverables = deliverables.slice(deliverableWindow.start, deliverableWindow.end);
  const overflow = deliverableWindow.above + deliverableWindow.below;

  return (
    <MonitorShell
      accent={theme.brand}
      icon={glyphs.goal}
      title="GOAL"
      kicker={size.columns >= 90 ? 'mission control' : undefined}
      right={
        <Text>
          <Text color={stateColor} bold>
            {stateIcon} {goal.goalState.toUpperCase()}
          </Text>
          <Text color={coordinatorRunning ? theme.success : theme.textMuted}>
            {' '}
            ● coordinator {coordinatorRunning ? 'on' : 'off'}
          </Text>
        </Text>
      }
      footer={
        <Box gap={1} flexWrap="wrap">
          {deliverables.length > 0 ? (
            <KeyCap keepTogether keyName="↑↓" label="deliverable" color={theme.brand} />
          ) : null}
          {coordinatorRunning && onCoordinatorStop ? (
            <KeyCap keepTogether keyName="S" label="stop coordinator" color={theme.error} />
          ) : !coordinatorRunning && onCoordinatorStart ? (
            <KeyCap keepTogether keyName="C" label="start coordinator" color={theme.success} />
          ) : null}
          <KeyCap keepTogether keyName="F9/Esc" label="close" color={theme.brand} />
        </Box>
      }
    >
      <Box flexDirection="column" marginTop={compact ? 0 : 1} paddingX={1}>
        {!compact ? <Text color={theme.textMuted}>MISSION</Text> : null}
        <Text color={theme.textPrimary} bold>
          {truncatePanelText(displayGoal, size.contentWidth - 2)}
        </Text>
      </Box>

      {goal.refinedGoal && goal.refinedGoal !== goal.goal && size.contentRows >= 12 ? (
        <Box paddingX={1}>
          <Text color={theme.textMuted}>
            original {truncatePanelText(goal.goal, size.contentWidth - 12)}
          </Text>
        </Box>
      ) : null}

      {!compact && typeof goal.progress === 'number' && (
        <Box flexDirection="column" marginTop={compact ? 0 : 1}>
          {renderProgressBar(goal.progress, goal.progressTrend, size.columns >= 90 ? 20 : 12)}
          {goal.progressNote && (
            <Text color={theme.textMuted}>
              {' '}
              {truncatePanelText(goal.progressNote, size.contentWidth - 4)}
            </Text>
          )}
        </Box>
      )}

      {deliverables.length > 0 && (
        <Box flexDirection="column" marginTop={compact ? 0 : 1}>
          <Text color={theme.textMuted} bold>
            DELIVERABLES {doneDeliverables}/{deliverables.length}
          </Text>
          {visibleDeliverables.map((d, i) => {
            const done = isDone(d);
            const absoluteIndex = deliverableWindow.start + i;
            const isSelected = absoluteIndex === selectedDeliverable;
            return (
              <Box key={absoluteIndex}>
                <Text color={isSelected ? theme.brand : theme.textMuted}>
                  {isSelected ? '› ' : '  '}
                </Text>
                <Text color={done ? theme.success : theme.textSecondary}>
                  {done ? '✓' : '○'} {truncatePanelText(d, size.contentWidth - 6)}
                </Text>
              </Box>
            );
          })}
          {overflow > 0 ? (
            <Text color={theme.textMuted}>
              {' '}
              {deliverableWindow.above > 0 ? `↑ ${deliverableWindow.above} earlier` : ''}
              {deliverableWindow.above > 0 && deliverableWindow.below > 0 ? ' · ' : ''}
              {deliverableWindow.below > 0 ? `↓ ${deliverableWindow.below} later` : ''}
            </Text>
          ) : null}
        </Box>
      )}

      {!compact ? (
        <Box marginTop={1} gap={1}>
          <Text color={theme.textMuted}>
            ITERATIONS <Text color={theme.textSecondary}>{goal.iterations}</Text>
          </Text>
          {goal.lastTask ? (
            <Text color={theme.textMuted}>
              {' '}
              LAST{' '}
              <Text color={theme.textSecondary}>
                {truncatePanelText(goal.lastTask, Math.max(12, size.contentWidth - 32))}
              </Text>
            </Text>
          ) : null}
        </Box>
      ) : null}
    </MonitorShell>
  );
}

function renderProgressBar(progress: number, trend?: string, width = 20): React.ReactElement {
  const pct = Math.min(100, Math.max(0, progress));
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;

  const trendIcon =
    trend === 'accelerating' ? ' 🚀' : trend === 'stalling' ? ' ⚠️' : trend === 'steady' ? ' ➡️' : '';

  return (
    <Box>
      <Text color={theme.textMuted}>PROGRESS </Text>
      <Text color={theme.success}>[{'█'.repeat(filled)}</Text>
      <Text color={theme.textMuted}>{'░'.repeat(empty)}]</Text>
      <Text color={theme.textPrimary} bold>
        {' '}
        {fmtPct(pct)}
      </Text>
      {trend && (
        <Text color={trend === 'stalling' ? theme.warn : theme.textMuted}>
          {trendIcon} {trend}
        </Text>
      )}
    </Box>
  );
}
