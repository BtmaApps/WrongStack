import { describe, expect, it } from 'vitest';
import { AUTONOMY_OPTIONS, AutonomyPicker } from '../src/components/autonomy-picker.js';
import { FilePicker } from '../src/components/file-picker.js';
import { ResumePicker } from '../src/components/resume-picker.js';
import { SlashMenu } from '../src/components/slash-menu.js';
import { ThemePicker } from '../src/components/theme-picker.js';
import { displayWidth } from '../src/terminal-width.js';
import { THEME_OPTIONS } from '../src/theme.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const selectedTheme = Math.floor(THEME_OPTIONS.length / 2);
const sessions = Array.from({ length: 35 }, (_, i) => ({
  id: `s-${i}`,
  title: `Session ${i}`,
  startedAt: '2026-09-18T10:00:00.000Z',
  tokenTotal: 15000,
  toolCallCount: 10,
  iterationCount: 3,
  toolErrorCount: 0,
}));

describe.each([
  [100, 18],
  [52, 10],
  [40, 8],
])('picker viewport %ix%i', (columns, maxRows) => {
  const cases = [
    [
      'autonomy',
      'AUTO',
      <AutonomyPicker options={AUTONOMY_OPTIONS} selected={2} maxRows={maxRows} />,
    ],
    [
      'theme',
      THEME_OPTIONS[selectedTheme]!.name,
      <ThemePicker
        options={THEME_OPTIONS}
        selected={selectedTheme}
        activeId={THEME_OPTIONS[0]!.id}
        columns={columns}
        maxRows={maxRows}
      />,
    ],
    [
      'resume',
      'Session 22',
      <ResumePicker sessions={sessions} selected={22} busy={false} maxRows={maxRows} />,
    ],
    [
      'files',
      'file-22',
      <FilePicker
        query="file"
        matches={Array.from({ length: 35 }, (_, i) => `file-${i}.ts`)}
        selected={22}
        {...{ maxRows }}
      />,
    ],
    [
      'commands',
      'cmd22',
      <SlashMenu
        query=""
        matches={Array.from({ length: 35 }, (_, i) => ({
          isBuiltin: true,
          name: `cmd${i}`,
          description: 'A long command description that must stay within the terminal width',
          category: i % 2 ? ('Run' as const) : ('Session' as const),
        }))}
        selected={22}
        {...{ maxRows }}
      />,
    ],
  ] as const;
  it.each(cases)('%s keeps selection and exit hint visible', async (_name, selected, element) => {
    const view = renderRealTty(element, { columns, rows: maxRows + 6 });
    try {
      await settle();
      const frame = view.lastFrame();
      expect(frame).toContain(selected);
      expect(frame).toContain('Esc');
      const lines = frame.trimEnd().split('\n');
      expect(lines.length).toBeLessThanOrEqual(maxRows);
      expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(columns);
    } finally {
      view.unmount();
    }
  });
});
