import { describe, expect, it } from 'vitest';
import { AUTH_PANEL_INITIAL } from '../src/auth-panel-model.js';
import type { BrainPanelSettings } from '../src/brain-panel-model.js';
import { AuthPanel } from '../src/components/auth-panel.js';
import { BrainPanel } from '../src/components/brain-panel.js';
import { HelpPanel } from '../src/components/help-panel.js';
import { SETTINGS_FIELD_LABELS, SettingsPicker } from '../src/components/settings-picker.js';
import { ShadowPanel } from '../src/components/shadow-panel.js';
import { SubagentModelsPanel } from '../src/components/subagent-models-panel.js';
import { displayWidth } from '../src/terminal-width.js';
import { createTestState } from './helpers/create-test-state.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const names = Array.from({ length: 35 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
const brainSettings: BrainPanelSettings = {
  mode: 'headless',
  riskLevel: 'high',
  strategy: 'fallback',
  pool: names,
  poolResolved: [],
  usingSessionModel: false,
  councilEnabled: false,
  councilMinRisk: 'high',
  councilDistinctness: 'none',
  voters: [],
  councilSeats: [],
  ledgerEnabled: false,
  terminalPolicy: 'conservative',
  heuristics: {
    lowRiskAutoAnswer: true,
    blockedResolved: true,
    deadlockSkip: true,
    retryExhausted: true,
    continuePing: true,
  },
  llmMaxTokens: 800,
  llmRejectUncertain: false,
  llmMinConfidence: 0,
  llmDenyIsTerminal: 'when-decided',
  cacheEnabled: false,
  cacheTtlMs: 300000,
  cacheMaxEntries: 200,
  cacheHits: 0,
  cacheMisses: 0,
  cacheSize: 0,
  traceEnabled: false,
  traceContent: 'redacted',
  ruleCount: 0,
  ruleErrors: [],
};
describe.each([
  [110, 18],
  [52, 10],
  [40, 8],
])('secondary slash panels %ix%i', (columns, maxRows) => {
  const budget = { columns, maxRows };
  const cases = [
    [
      'auth',
      'item-22',
      <AuthPanel
        {...budget}
        panel={{
          ...AUTH_PANEL_INITIAL,
          open: true,
          selected: 22,
          providers: names.map((id) => ({ id, type: 'test', models: [], envVars: [], keys: [] })),
        }}
      />,
    ],
    [
      'brain settings',
      'item-22',
      <BrainPanel
        {...budget}
        riskLevel="high"
        selected={0}
        log={[]}
        settings={brainSettings}
        row={24}
        view="settings"
      />,
    ],
    [
      'brain log',
      'item-22',
      <BrainPanel
        {...budget}
        riskLevel="low"
        selected={22}
        log={names.map((question) => ({ age: 'now', kind: 'tool', question })) as never}
      />,
    ],
    [
      'help',
      'item-22',
      <HelpPanel
        {...budget}
        selected={22}
        filter=""
        entries={names.map((name) => ({
          name,
          description: 'Command details',
          category: 'Run',
          help: 'Help line\n'.repeat(40),
        }))}
      />,
    ],
    [
      'shadow',
      'item-22',
      <ShadowPanel
        {...budget}
        shadow={{ activeId: null, running: false, model: 'item-22', intervalMs: 5000 }}
      />,
    ],
    [
      'subagent models',
      'item-22',
      <SubagentModelsPanel
        {...budget}
        selected={22}
        lanes={names.map((target) => ({ target, busy: 0 }))}
        roles={[]}
        enabled
        lock
        followSessionModel={false}
        sessionTarget="test"
      />,
    ],
  ] as const;
  it.each(cases)(
    '%s keeps its selection and controls visible',
    async (_name, selected, element) => {
      const view = renderRealTty(element, { columns, rows: 100 });
      try {
        await settle();
        const frame = view.lastFrame();
        expect(frame).toContain(selected);
        if (_name === 'help') expect(frame).toContain('› /item-22');
        expect(frame).toContain('Esc');
        const lines = frame.trimEnd().split('\n');
        expect(lines.length).toBeLessThanOrEqual(maxRows);
        expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(columns);
      } finally {
        view.unmount();
      }
    },
  );
});

describe.each([
  [100, 18],
  [52, 10],
])('every settings row at %ix%i', (columns, maxRows) => {
  it.each(SETTINGS_FIELD_LABELS.map((label, field) => [field, label] as const))(
    '%i %s stays reachable',
    async (field, label) => {
      const view = renderRealTty(
        <SettingsPicker
          {...createTestState().settingsPicker}
          field={field}
          columns={columns}
          maxRows={maxRows}
        />,
        { columns, rows: 100 },
      );
      try {
        await settle();
        const frame = view.lastFrame();
        const focused = frame.split('\n').find((line) => line.includes('› '));
        expect(focused).toContain(
          (field === 27 ? 'Auto-compact' : field === 25 ? 'Preserve thinking' : label).slice(0, 4),
        );
        expect(frame).toContain('Esc');
        expect(frame.trimEnd().split('\n').length).toBeLessThanOrEqual(maxRows);
      } finally {
        view.unmount();
      }
    },
  );
});
