import type React from 'react';
import { useState } from 'react';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import { glyphs } from '../ui-glyphs.js';
// The bracket-style `[000o····]` meter is the statusline's context bar; reuse
// it here so the panel's fill bars mirror the statusline instead of using a
// second (block `█░`) visual language.
import {
  AgentFootprintSection,
  CacheSection,
  CompactionSection,
  CompositionSection,
  MemoryContextSection,
  MetricsSection,
  PressureSection,
  StatusSection,
  ThresholdSection,
  zoneColor,
  zoneEmoji,
  zoneFor,
  zoneLabel,
} from './context-panel-sections.js';
import type { ContextPanelData } from './context-panel-types.js';
import {
  EmptyPanelState,
  KeyCap,
  MonitorShell,
  usePanelInput as useInput,
  useMonitorSize,
  usePanelShortcutsEnabled,
} from './monitor-shell.js';

interface ContextPanelProps {
  data: ContextPanelData;
  onClose: () => void;
}

type TabId = 'overview' | 'composition' | 'thresholds' | 'agents' | 'memory';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'composition', label: 'Composition' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'agents', label: 'Agents' },
  { id: 'memory', label: 'Memory' },
];

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active }: { active: TabId }): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text color={theme.textMuted}>‹ </Text>
      {TABS.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <Text key={tab.id}>
            {i > 0 ? <Text color={theme.textMuted}> │ </Text> : null}
            <Text
              color={isActive ? theme.accent : theme.textMuted}
              bold={isActive}
              underline={isActive}
            >
              {i + 1} {tab.label}
            </Text>
          </Text>
        );
      })}
      <Text color={theme.textMuted}> ›</Text>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ContextPanel({ data, onClose }: ContextPanelProps): React.ReactElement {
  const size = useMonitorSize();
  const contentWidth = size.contentWidth;
  const [tab, setTab] = useState<TabId>('overview');

  const shortcutsEnabled = usePanelShortcutsEnabled();
  useInput((input, key) => {
    if (key.meta || (key.ctrl && !/^[1-5]$/.test(input))) return;
    // Esc is owned by the central ESC_CLOSE_PANELS table (esc-close-panels.ts);
    // handling it here too would double-fire the toggle and re-open the panel.
    // With a draft in the composer, every key here (letters, digits, Tab,
    // ←/→) collides with composer editing — the panel goes display-only.
    if (!shortcutsEnabled) return;
    if (input === 'q') {
      onClose();
      return;
    }
    const idx = TABS.findIndex((t) => t.id === tab);
    if (key.rightArrow || key.tab) {
      const next = TABS[(idx + 1) % TABS.length];
      if (next) setTab(next.id);
      return;
    }
    if (key.leftArrow) {
      const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
      if (prev) setTab(prev.id);
      return;
    }
    // Direct 1-{TABS.length} jump. Non-digit input is safely ignored
    // (parseInt returns NaN), and digits > TABS.length have no match.
    const n = Number.parseInt(input, 10);
    const direct = TABS[n - 1];
    if (!Number.isNaN(n) && direct) {
      setTab(direct.id);
    }
  });

  const isEmpty =
    data.ctxPct == null &&
    data.ctxTokens == null &&
    Object.keys(data.memoryContext.memories).length === 0 &&
    data.memoryContext.transitions.length === 0 &&
    data.memoryContext.latest === undefined;

  if (isEmpty) {
    return (
      <MonitorShell
        accent={theme.monitor.fleet}
        icon={glyphs.context}
        title="CONTEXT"
        kicker={size.columns >= 80 ? 'context window' : undefined}
        maxHeight={Math.max(8, size.rows - 1)}
        right={
          <Text color={theme.textMuted}>
            {glyphs.clock} {data.uptime}
          </Text>
        }
        footer={<KeyCap keyName="Esc" label="close" color={theme.monitor.fleet} />}
      >
        <EmptyPanelState
          icon={glyphs.context}
          title="No context data yet"
          detail="Context metrics appear once the agent starts processing a request."
          accent={theme.textMuted}
        />
      </MonitorShell>
    );
  }

  const pct = data.ctxPct ?? 0;
  const z = zoneFor(pct);
  const emoji = zoneEmoji(pct);
  const zoneClr = zoneColor(z);

  return (
    <MonitorShell
      accent={zoneClr}
      icon={glyphs.context}
      title="CONTEXT WINDOW"
      kicker={size.columns >= 80 ? `${data.model} · ${data.provider}` : undefined}
      maxHeight={Math.max(8, size.rows - 1)}
      right={
        <Text>
          <Text color={zoneClr}>{emoji}</Text>
          <Text color={theme.textMuted}> {zoneLabel(pct)}</Text>
          <Text> </Text>
          <Text color={theme.textMuted}>
            {glyphs.clock} {data.uptime}
          </Text>
        </Text>
      }
      footer={
        <Box gap={2}>
          <KeyCap keyName="Esc" label="close" color={zoneClr} />
          <Text color={theme.textMuted}>
            ←/→ or Ctrl+1-{TABS.length} switch tab · `/context` for full dashboard
          </Text>
        </Box>
      }
    >
      <Box flexDirection="column" paddingX={1}>
        {/* Identity line */}
        <Box>
          <Text color={theme.textSecondary}>{emoji} </Text>
          <Text color={theme.textPrimary}>{data.model}</Text>
          <Text color={theme.textMuted}> · </Text>
          <Text color={theme.textPrimary}>{data.provider}</Text>
          <Text color={theme.textMuted}> · </Text>
          <Text color={theme.textSecondary}>{data.mode}</Text>
          <Box flexGrow={1} />
          <Text color={theme.textMuted}>
            L{data.leaderIterations} · T{data.leaderToolCalls}
            {data.leaderStatus !== 'idle' ? ` · ${data.leaderStatus}` : ''}
          </Text>
        </Box>

        <TabBar active={tab} />

        {/* Active tab body — only one tab renders, so the panel never overflows. */}
        {tab === 'overview' ? (
          <>
            <PressureSection data={data} contentWidth={contentWidth} />
            <StatusSection data={data} />
            <MetricsSection data={data} />
            <CacheSection data={data} />
          </>
        ) : null}
        {tab === 'composition' ? (
          <CompositionSection breakdown={data.breakdown} contentWidth={contentWidth} />
        ) : null}
        {tab === 'thresholds' ? (
          <>
            <ThresholdSection data={data} contentWidth={contentWidth} />
            <CompactionSection data={data} />
          </>
        ) : null}
        {tab === 'agents' ? (
          <AgentFootprintSection data={data} contentWidth={contentWidth} />
        ) : null}
        {tab === 'memory' ? <MemoryContextSection data={data} /> : null}

        {/* Bottom spacer */}
        <Box height={1} />
      </Box>
    </MonitorShell>
  );
}
export type { ContextPanelData } from './context-panel-types.js';
