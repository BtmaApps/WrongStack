import type { AgentTimelineEntry } from '@wrongstack/coordination';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { FleetEntry } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import type { AgentTranscriptReader } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import {
  agentRisk,
  isFinishedEntry,
  isLeaderEntry,
  nextEmptyAgentsCloseStartedAt,
  riskMeta,
  selectAgentDetail,
  selectHotAgent,
  selectLiveAgents,
  shouldCloseEmptyAgentsMonitor,
} from './agent-monitor-presentation.js';
import { TRANSCRIPT_FETCH_LIMIT } from './agents-monitor-constants.js';
import {
  AgentCard,
  AgentDetailPanel,
  alertLine,
  CompactRoster,
  DashboardHeader,
  detailRows,
} from './agents-monitor-parts.js';
import {
  EmptyPanelState,
  KeyCap,
  MonitorShell,
  panelWindow,
  usePanelInput as useInput,
  useMonitorSize,
} from './monitor-shell.js';

export type { AgentTranscriptReader } from '../ui-contracts.js';

/**
 * Narrow read-only view of per-subagent transcripts. AgentMonitorService
 * (created in the CLI host) satisfies this structurally; the TUI never
 * imports from @wrongstack/cli. `getTranscript` returns entries NEWEST
 * FIRST (mirroring AgentMonitorService.getTranscript).
 */
interface AgentsMonitorProps {
  entries: Record<string, FleetEntry>;
  totalCost: number;
  leaderCost?: number | undefined;
  totalTokens?: { input: number; output: number };
  nowTick: number;
  onClose?: (() => void) | undefined;
  transcripts?: AgentTranscriptReader | undefined;
  leaderTranscript?: (() => AgentTimelineEntry[]) | undefined;
  fullscreen?: boolean | undefined;
}

export {
  agentRisk,
  fmtExactTokens,
  formatAgentDetailHeader,
  formatContextRunway,
  formatRecentToolChip,
  formatTranscriptLine,
  leaderTimelineFromEntries,
  nextEmptyAgentsCloseStartedAt,
  selectAgentDetail,
  selectLiveAgents,
  selectTranscriptWindow,
  shouldCloseEmptyAgentsMonitor,
  transcriptRowsForTerminal,
} from './agent-monitor-presentation.js';
export {
  EMPTY_AGENTS_CLOSE_DELAY_MS,
  FINISHED_KEEP_MS,
  IDLE_HIDE_MS,
} from './agents-monitor-constants.js';

// ─── Main Component (F3 — Agents Panel with Sidebar Layout) ──────────

/**
 * Agents panel — the F3 view.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │ ◇ AGENTS / live operations                  ▶ 2 ✓ 5 × 1  │
 * │ ctx 78% ▲ researcher │ $0.69 total · leader … │ 412k↑ …  │  ← DashboardHeader
 * │ agents 4              ┌─────────────────────────────────┐│
 * │ › ● claude-code 07:00 │ claude-code  external agent …   ││
 * │   ▲ researcher  03:00 │ task  refactor the session …    ││
 * │ finished              │ L1 · 17 tools · $0.21 · 07:00   ││
 * │   ✗ reviewer    05:00 │ → bun test packages/acp 42s     ││
 * │                       │ ┌ transcript ─────────────────┐ ││
 * │                       │ │ 20:18:02 L1 💬 …            │ ││
 * │                       │ └─────────────────────────────┘ ││
 * │ ↑↓ agent  PgUp/Dn transcript  F3/Esc close               │
 * └──────────────────────────────────────────────────────────┘
 */
export function AgentsMonitor({
  entries,
  totalCost,
  leaderCost = 0,
  totalTokens,
  nowTick,
  onClose,
  transcripts,
  leaderTranscript,
  fullscreen = false,
}: AgentsMonitorProps): React.ReactElement {
  const all = Object.values(entries);
  const grandCost = leaderCost + totalCost;

  const live = useMemo(() => selectLiveAgents(all, nowTick), [all, nowTick]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [emptyAgentsCloseStartedAt, setEmptyAgentsCloseStartedAt] = useState<number | undefined>(
    undefined,
  );

  // Auto-close once nothing (running or recently finished) is left to show.
  useEffect(() => {
    const nextStartedAt = nextEmptyAgentsCloseStartedAt(
      live.length,
      nowTick,
      emptyAgentsCloseStartedAt,
    );
    if (nextStartedAt !== emptyAgentsCloseStartedAt) setEmptyAgentsCloseStartedAt(nextStartedAt);
    if (shouldCloseEmptyAgentsMonitor(live.length, nowTick, nextStartedAt)) onClose?.();
  }, [emptyAgentsCloseStartedAt, live.length, nowTick, onClose]);

  const selected = selectAgentDetail(live, selectedId);
  const selectedIndex = selected ? live.findIndex((entry) => entry.id === selected.id) : -1;

  // Selected agent's full transcript, refreshed on the 1s nowTick
  const [transcriptScroll, setTranscriptScroll] = useState(0);
  const selectedTranscriptId = selected?.id;
  const transcript = useMemo(() => {
    if (!selected) return undefined;
    if (isLeaderEntry(selected)) {
      return leaderTranscript ? leaderTranscript().slice(-TRANSCRIPT_FETCH_LIMIT) : undefined;
    }
    return transcripts
      ? transcripts.getTranscript(selected.id, TRANSCRIPT_FETCH_LIMIT).slice().reverse()
      : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcripts, leaderTranscript, selectedTranscriptId, nowTick]);

  // Re-pin transcript scroll to newest on selection change
  useEffect(() => {
    setTranscriptScroll(0);
  }, [selectedTranscriptId]);

  const { columns: terminalColumns, rows: terminalRows } = useMonitorSize();
  const compact = terminalColumns < 80 || terminalRows < 20;
  const contentWidth = Math.max(24, terminalColumns - 4);

  // ── Height budget ───────────────────────────────────────────────────
  // Inline the panel sits under the history, status bar and input, so it is
  // capped at 28 rows; fullscreen takes every row. The shell spends 5 rows
  // of its own (2 borders, title, footer and the gap above it), the
  // dashboard 2 (gap + line) and the split 1 (gap). Every row below is
  // counted, so the shell never has to clip: a clipped panel used to hide
  // the newest transcript rows behind an "Alt+PgUp/Dn scroll" bar.
  const maxPanelRows = fullscreen ? terminalRows - 2 : Math.max(4, Math.min(terminalRows - 2, 28));
  const bodyRows = maxPanelRows - 3;
  const splitRows = Math.max(4, bodyRows - (compact ? 0 : 3));

  // ── Column widths ───────────────────────────────────────────────────
  const leftColWidth = Math.max(24, Math.min(Math.floor(contentWidth * 0.3), 38));
  // Right column: what the split gap leaves, minus its border and padding.
  const rightInnerWidth = Math.max(20, contentWidth - leftColWidth - 1 - 4);

  // ── Roster window ───────────────────────────────────────────────────
  const firstFinished = live.findIndex((entry) => isFinishedEntry(entry));
  const rosterLimit = compact
    ? Math.max(1, splitRows - 2)
    : Math.max(1, splitRows - 1 - (firstFinished >= 0 ? 1 : 0));
  const rosterWindow = panelWindow(live.length, Math.max(0, selectedIndex), rosterLimit);
  const visibleLive = live.slice(rosterWindow.start, rosterWindow.end);

  // ── Transcript rows: what the detail column has left ────────────────
  const shown = selected ? detailRows(selected, rightInnerWidth) : { task: false, tools: false };
  const fixedDetailRows =
    2 + // detail border
    1 + // header
    (shown.task ? 1 : 0) +
    1 + // metrics
    (selected && alertLine(selected, nowTick) ? 1 : 0) +
    (shown.tools ? 1 : 0) +
    4; // transcript gap, borders and header
  const transcriptRows = Math.max(1, splitRows - fixedDetailRows);

  // Keyboard navigation
  useInput((_input, key) => {
    if (key.meta) return;
    if (live.length === 0) return;
    if (key.upArrow) {
      const next = Math.max(0, selectedIndex - 1);
      setSelectedId(live[next]?.id);
    } else if (key.downArrow) {
      const next = Math.min(live.length - 1, selectedIndex + 1);
      setSelectedId(live[next]?.id);
    } else if (key.pageUp && transcript) {
      const maxOffset = Math.max(0, transcript.length - transcriptRows);
      setTranscriptScroll((s) => Math.min(maxOffset, s + transcriptRows));
    } else if (key.pageDown && transcript) {
      setTranscriptScroll((s) => Math.max(0, s - transcriptRows));
    }
  });

  // Derived metrics
  const running = all.filter((e) => !isLeaderEntry(e) && e.status === 'running').length;
  const totalDone = all.filter((e) => e.status === 'success').length;
  const totalFailed = all.filter((e) => e.status === 'failed' || e.status === 'timeout').length;
  const runningLive = live.filter((e) => e.status === 'running');
  const hotAgent = selectHotAgent(runningLive);
  const hotRisk = hotAgent ? riskMeta(agentRisk(hotAgent)) : undefined;
  const pressure = runningLive.reduce((max, e) => Math.max(max, e.ctxPct ?? 0), 0);
  const wide = terminalColumns >= 96;

  return (
    <MonitorShell
      accent={theme.monitor.agents}
      icon={glyphs.peers}
      title="AGENTS"
      kicker={wide ? 'live operations' : undefined}
      grow
      maxHeight={maxPanelRows + 2}
      right={
        <Text>
          <Text color={theme.warn}>
            {glyphs.running} {running}
          </Text>
          <Text color={theme.success}>
            {' '}
            {glyphs.success} {totalDone}
          </Text>
          {totalFailed > 0 ? (
            <Text color={theme.error}>
              {' '}
              {glyphs.failure} {totalFailed}
            </Text>
          ) : null}
        </Text>
      }
      footer={
        <Box gap={1} flexWrap="wrap">
          <KeyCap keepTogether keyName="↑↓" label="agent" color={theme.monitor.agents} />
          {!compact && selected && transcript ? (
            <KeyCap
              keepTogether
              keyName="PgUp/Dn"
              label="transcript"
              color={theme.monitor.agents}
            />
          ) : null}
          <KeyCap keepTogether keyName="F3/Esc" label="close" color={theme.monitor.agents} />
        </Box>
      }
    >
      {!compact ? (
        <DashboardHeader
          pressure={pressure}
          grandCost={grandCost}
          leaderCost={leaderCost}
          totalCost={totalCost}
          totalTokens={totalTokens}
          hotAgent={hotAgent}
          hotRisk={hotRisk}
        />
      ) : null}

      {live.length === 0 ? (
        <EmptyPanelState
          icon="◇"
          title="No live agents"
          detail="Start one with /spawn or hand off work with /fleet dispatch."
          accent={theme.monitor.agents}
        />
      ) : compact ? (
        <CompactRoster agents={visibleLive} selected={selected} now={nowTick} />
      ) : (
        <Box flexDirection="row" gap={1} marginTop={1} height={splitRows} flexShrink={0}>
          <Box flexDirection="column" width={leftColWidth} flexShrink={0}>
            <Box flexDirection="row" gap={1} height={1}>
              <Text dimColor bold>
                agents
              </Text>
              <Text dimColor>{live.length}</Text>
              {rosterWindow.above > 0 ? <Text dimColor>↑{rosterWindow.above}</Text> : null}
              {rosterWindow.below > 0 ? <Text dimColor>↓{rosterWindow.below}</Text> : null}
            </Box>
            {visibleLive.map((e) => (
              <Box key={e.id} flexDirection="column">
                {live.indexOf(e) === firstFinished ? <Text dimColor>finished</Text> : null}
                <AgentCard entry={e} now={nowTick} selected={e.id === selected?.id} />
              </Box>
            ))}
          </Box>

          <Box
            flexDirection="column"
            flexGrow={1}
            flexShrink={1}
            borderStyle="single"
            borderColor={theme.textMuted}
            paddingX={1}
            overflow="hidden"
          >
            {selected ? (
              <AgentDetailPanel
                entry={selected}
                now={nowTick}
                transcript={transcript}
                transcriptScroll={transcriptScroll}
                transcriptRows={transcriptRows}
                width={rightInnerWidth}
              />
            ) : (
              <EmptyPanelState
                icon="◈"
                title="Select an agent"
                detail="Use ↑↓ to browse agents. Esc to close."
                accent={theme.monitor.agents}
              />
            )}
          </Box>
        </Box>
      )}
    </MonitorShell>
  );
}
