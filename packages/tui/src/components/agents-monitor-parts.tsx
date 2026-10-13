/**
 * The pieces of the F3 agents panel (`agents-monitor.tsx`): dashboard strip,
 * roster rows, the detail column with its transcript, and the narrow-terminal
 * roster. Every row is one truncating line, so the panel's height budget,
 * which counts them, stays exact.
 */
import type { AgentTimelineEntry } from '@wrongstack/core/coordination';
import type React from 'react';
import type { FleetEntry } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import { getToolVisual } from '../tool-glyph.js';
import {
  currentAction,
  fmtCost,
  fmtTokens,
  formatAgentDetailHeader,
  formatAgentModel,
  formatContextRunway,
  formatRecentToolChip,
  formatTranscriptLine,
  isFinishedEntry,
  isLeaderEntry,
  pctTextFromRatio,
  rosterGlyph,
  selectTranscriptWindow,
  snippet,
} from './agent-monitor-presentation.js';
import { STATUS, TRANSCRIPT_ROWS } from './agents-monitor-constants.js';
import { fmtElapsed } from './status-bar-format.js';

// ─── Visual Components ────────────────────────────────────────────────

/** How long an agent has run, or ran: running agents count up, finished ones are frozen. */
function agentElapsed(entry: FleetEntry, now: number): string {
  const end = entry.status === 'running' ? now : (entry.endedAt ?? entry.lastEventAt);
  return fmtElapsed(Math.max(0, end - entry.startedAt));
}

/**
 * Dashboard strip — one line that truncates instead of wrapping: context
 * pressure and the hottest agent, spend (total, leader, fleet), and tokens.
 * Run counts live in the title row already.
 */
export function DashboardHeader({
  pressure,
  grandCost,
  leaderCost,
  totalCost,
  totalTokens,
  hotAgent,
  hotRisk,
}: {
  pressure: number;
  grandCost: number;
  leaderCost: number;
  totalCost: number;
  totalTokens?: { input: number; output: number } | undefined;
  hotAgent?: FleetEntry | undefined;
  hotRisk?: { icon: string; color: string; label: string } | undefined;
}): React.ReactElement {
  const pressureColor =
    pressure >= 0.9 ? theme.error : pressure >= 0.75 ? theme.warn : theme.success;
  return (
    <Box marginTop={1} height={1} flexShrink={0}>
      <Text wrap="truncate-end">
        <Text dimColor>ctx </Text>
        <Text color={pressureColor}>{pctTextFromRatio(pressure)}</Text>
        {hotAgent && hotRisk ? (
          <>
            <Text color={hotRisk.color}> {hotRisk.icon} </Text>
            <Text dimColor>{hotAgent.name || hotAgent.id}</Text>
          </>
        ) : null}
        <Text color={theme.textMuted}> │ </Text>
        <Text bold color={theme.success}>
          {fmtCost(grandCost)}
        </Text>
        <Text dimColor> total</Text>
        {leaderCost > 0 || totalCost > 0 ? (
          <Text dimColor>
            {' '}
            · leader {fmtCost(leaderCost)} · fleet {fmtCost(totalCost)}
          </Text>
        ) : null}
        {totalTokens ? (
          <>
            <Text color={theme.textMuted}> │ </Text>
            <Text dimColor>
              {fmtTokens(totalTokens.input)}↑ {fmtTokens(totalTokens.output)}↓
            </Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}

/**
 * Roster row — selection, one state glyph (pressure while running, outcome
 * once finished), name, context bar and time. Never wraps: the name yields.
 */
export function AgentCard({
  entry,
  now,
  selected,
}: {
  entry: FleetEntry;
  now: number;
  selected: boolean;
}): React.ReactElement {
  const glyph = rosterGlyph(entry);
  const finished = isFinishedEntry(entry);
  const ctx =
    entry.status === 'running' && entry.ctxPct !== undefined
      ? Math.max(0, Math.min(1, entry.ctxPct))
      : undefined;
  const filled = ctx === undefined ? 0 : Math.round(ctx * 3);
  return (
    <Box flexDirection="row" height={1}>
      <Box width={2} flexShrink={0}>
        <Text bold color={theme.monitor.agents}>
          {selected ? '›' : ' '}
        </Text>
      </Box>
      <Box width={2} flexShrink={0}>
        <Text color={glyph.color} bold>
          {glyph.icon}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text
          wrap="truncate-end"
          bold={selected}
          dimColor={finished && !selected}
          color={selected ? theme.monitor.agents : theme.textPrimary}
        >
          {entry.name || entry.id}
        </Text>
      </Box>
      {ctx !== undefined ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={ctx < 0.6 ? theme.success : ctx < 0.75 ? theme.warn : theme.error}>
            {'█'.repeat(filled)}
            {'░'.repeat(3 - filled)}
          </Text>
        </Box>
      ) : null}
      {entry.extensions && entry.extensions > 0 ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.warn}>⚡</Text>
        </Box>
      ) : null}
      <Box flexShrink={0} marginLeft={1}>
        <Text dimColor>{agentElapsed(entry, now)}</Text>
      </Box>
    </Box>
  );
}

/** The optional detail rows, so the height budget counts exactly what renders. */
export function detailRows(entry: FleetEntry, width: number): { task: boolean; tools: boolean } {
  return {
    task: Boolean(entry.task?.trim()),
    tools: entry.recentTools.length > 0 && width >= 40,
  };
}

/** The alert line: a failure, a budget limit, the leader's stream, or the current action. */
export function alertLine(
  entry: FleetEntry,
  now: number,
): { color: string; text: string } | undefined {
  if (entry.failureReason && entry.status !== 'success') {
    return { color: theme.error, text: `✗ ${snippet(entry.failureReason, 400)}` };
  }
  if (entry.budgetWarning) {
    const w = entry.budgetWarning;
    return {
      color: theme.warn,
      text: `⚡ ${w.kind} ${w.used}/${w.limit}${entry.extensions ? ` ×${entry.extensions}` : ''}`,
    };
  }
  // Only the leader streams here: subagent deltas made the panel flicker.
  if (isLeaderEntry(entry) && entry.status === 'running' && entry.streamingText) {
    return { color: theme.textMuted, text: `∴ …${snippet(entry.streamingText.slice(-200), 200)}` };
  }
  if (isFinishedEntry(entry)) {
    const last = entry.recentMessages[entry.recentMessages.length - 1];
    return last ? { color: theme.textSecondary, text: `↳ ${snippet(last.text, 400)}` } : undefined;
  }
  const action = currentAction(entry, now);
  return action
    ? { color: entry.currentTool ? theme.accent : theme.textMuted, text: action }
    : undefined;
}

/**
 * Detail column — who the agent is, what it was asked, how far it got, and
 * its transcript. Every row is a single truncating line, so the height
 * budget the panel computes is exact.
 */
export function AgentDetailPanel({
  entry,
  now,
  transcript,
  transcriptScroll,
  transcriptRows: rows,
  width,
}: {
  entry: FleetEntry;
  now: number;
  transcript?: AgentTimelineEntry[] | undefined;
  transcriptScroll?: number | undefined;
  transcriptRows?: number | undefined;
  width: number;
}): React.ReactElement {
  const s = STATUS[entry.status];
  const model = formatAgentModel(entry);
  const shown = detailRows(entry, width);
  const alert = alertLine(entry, now);
  const ctxKnown = Boolean(entry.ctxTokens && entry.ctxMaxTokens);
  const finished = isFinishedEntry(entry);

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box flexDirection="row" height={1}>
        <Box flexShrink={1} overflow="hidden">
          <Text wrap="truncate-end">
            <Text color={theme.monitor.agents} bold>
              {formatAgentDetailHeader(entry)}
            </Text>
            {model ? <Text color={theme.accent}> {model}</Text> : null}
          </Text>
        </Box>
        <Box flexGrow={1} />
        <Box flexShrink={0} marginLeft={1}>
          <Text color={s.color}>
            {s.icon} {entry.status}
          </Text>
        </Box>
      </Box>

      {shown.task ? (
        <Box height={1}>
          <Text wrap="truncate-end">
            <Text dimColor>task </Text>
            <Text>{snippet(entry.task ?? '', 400)}</Text>
          </Text>
        </Box>
      ) : null}

      <Box height={1}>
        <Text wrap="truncate-end">
          <Text dimColor>L</Text>
          <Text>{entry.iterations}</Text>
          <Text dimColor> · </Text>
          <Text>{entry.toolCalls}</Text>
          <Text dimColor> tools</Text>
          {ctxKnown ? (
            <>
              <Text dimColor> · ctx </Text>
              <Text>{formatContextRunway(entry.ctxTokens, entry.ctxMaxTokens)}</Text>
            </>
          ) : null}
          <Text dimColor> · </Text>
          <Text color={theme.success}>{fmtCost(entry.cost)}</Text>
          <Text dimColor>
            {' · '}
            {finished ? 'took ' : ''}
            {agentElapsed(entry, now)}
          </Text>
        </Text>
      </Box>

      {alert ? (
        <Box height={1}>
          <Text wrap="truncate-end" color={alert.color}>
            {alert.text}
          </Text>
        </Box>
      ) : null}

      {shown.tools ? (
        <Box height={1}>
          <Text wrap="truncate-end">
            <Text dimColor>tools</Text>
            {entry.recentTools
              .slice(-4)
              .reverse()
              .map((tool, i) => {
                const visual = getToolVisual(tool.name);
                return (
                  <Text
                    key={`${tool.name}-${tool.at}-${i}`}
                    color={tool.ok === false ? theme.error : visual.color}
                  >
                    {` ‹${visual.glyph} ${formatRecentToolChip(tool)}›`}
                  </Text>
                );
              })}
          </Text>
        </Box>
      ) : null}

      {transcript ? (
        <TranscriptPane
          entries={transcript}
          scrollOffset={transcriptScroll ?? 0}
          rows={rows ?? TRANSCRIPT_ROWS}
          width={width}
        />
      ) : null}
    </Box>
  );
}

/**
 * Fixed-height transcript pane. Constant row count in every state so the
 * surrounding layout never grows/shrinks while streaming.
 */
function TranscriptPane({
  entries,
  scrollOffset,
  rows = TRANSCRIPT_ROWS,
  width = 100,
}: {
  entries: readonly AgentTimelineEntry[];
  scrollOffset: number;
  rows?: number | undefined;
  width?: number | undefined;
}): React.ReactElement {
  const { slice, above, below } = selectTranscriptWindow(entries, scrollOffset, rows);
  const padding = Math.max(0, rows - Math.max(slice.length, 1));
  // Inside the pane's border and padding.
  const lineWidth = Math.max(16, width - 4);
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.textMuted}
      paddingX={1}
      marginTop={1}
      flexShrink={0}
    >
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text dimColor bold>
            transcript
          </Text>
          <Text dimColor>
            {` ${entries.length} entries${above > 0 ? ` · ↑ ${above} earlier` : ''}${below > 0 ? ` · ↓ ${below} newer` : ''}`}
          </Text>
        </Text>
      </Box>
      {slice.length === 0 ? (
        <Text dimColor wrap="truncate-end">
          nothing recorded yet
        </Text>
      ) : (
        slice.map((e) => (
          <Text
            key={e.id}
            wrap="truncate-end"
            dimColor={e.kind === 'thinking' || e.kind === 'system'}
            color={e.kind === 'error' ? theme.error : undefined}
          >
            {formatTranscriptLine(e, lineWidth)}
          </Text>
        ))
      )}
      {Array.from({ length: padding }, (_, i) => (
        <Text key={`pad-${i}`}> </Text>
      ))}
    </Box>
  );
}

/** Narrow terminals: one line per agent with its state, time and current action. */
export function CompactRoster({
  agents,
  selected,
  now,
}: {
  agents: readonly FleetEntry[];
  selected: FleetEntry | undefined;
  now: number;
}): React.ReactElement {
  const outcome = selected && isFinishedEntry(selected) ? alertLine(selected, now) : undefined;
  return (
    <Box flexDirection="column">
      {agents.map((entry) => {
        const glyph = rosterGlyph(entry);
        const isSelected = entry.id === selected?.id;
        const action = entry.status === 'running' ? currentAction(entry, now) : entry.status;
        return (
          <Text key={entry.id} wrap="truncate-end">
            <Text bold color={theme.monitor.agents}>
              {isSelected ? '› ' : '  '}
            </Text>
            <Text color={glyph.color}>{glyph.icon} </Text>
            <Text bold={isSelected} color={isSelected ? theme.monitor.agents : theme.textPrimary}>
              {entry.name || entry.id}
            </Text>
            <Text dimColor> {agentElapsed(entry, now)}</Text>
            {action ? <Text dimColor> · {action}</Text> : null}
          </Text>
        );
      })}
      {selected?.task ? (
        <Text wrap="truncate-end">
          <Text dimColor>task </Text>
          {snippet(selected.task, 400)}
        </Text>
      ) : null}
      {outcome ? (
        <Text wrap="truncate-end" color={outcome.color}>
          {outcome.text}
        </Text>
      ) : null}
    </Box>
  );
}
