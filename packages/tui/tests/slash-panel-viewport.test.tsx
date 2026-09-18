import { describe, expect, it } from 'vitest';
import { DesignPicker } from '../src/components/design-picker.js';
import { McpPicker } from '../src/components/mcp-picker.js';
import { ModePicker } from '../src/components/mode-picker.js';
import { PluginPicker } from '../src/components/plugin-picker.js';
import { PromptPicker } from '../src/components/prompt-picker.js';
import { ResourceMenu } from '../src/components/resource-menu.js';
import { SkillPicker } from '../src/components/skill-picker.js';
import { ToolsPicker } from '../src/components/tools-picker.js';
import { displayWidth } from '../src/terminal-width.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const names = Array.from({ length: 35 }, (_, i) => `item-${i}`);
const description = 'Long description with Unicode 中文 and repeated words '.repeat(4);

describe.each([
  [110, 18],
  [52, 10],
  [40, 8],
])('slash panel viewport %ix%i', (columns, maxRows) => {
  const budget = { columns, maxRows };
  const cases = [
    [
      'plugins',
      <PluginPicker
        {...budget}
        selected={22}
        hint="Saved"
        items={names.map((name) => ({ name, enabled: true, risk: 'low', summary: description }))}
      />,
    ],
    [
      'mcp',
      <McpPicker
        {...budget}
        selected={22}
        hint="Saved"
        items={names.map((name) => ({
          name,
          enabled: true,
          status: 'connected',
          transport: 'stdio',
          toolCount: 50,
        }))}
      />,
    ],
    [
      'tools',
      <ToolsPicker
        {...budget}
        selected={22}
        hint="Saved"
        items={names.map((name) => ({
          name,
          enabled: true,
          exposure: 'lazy',
          owner: 'builtin',
          category: 'development',
          mutating: false,
          permission: 'auto',
          descMode: 'extend',
          description,
        }))}
      />,
    ],
    [
      'mode',
      <ModePicker
        {...budget}
        selected={22}
        modes={names.map((name) => ({
          id: name,
          name,
          description,
          family: 'custom',
          isActive: false,
        }))}
      />,
    ],
    [
      'skills',
      <SkillPicker
        {...budget}
        selected={22}
        entries={names.map((name) => ({
          name,
          trigger: description,
          scope: ['typescript'],
          source: 'project',
          path: `D:/skills/${name}/SKILL.md`,
        }))}
      />,
    ],
    [
      'design',
      <DesignPicker
        {...budget}
        selected={22}
        stack="react-native"
        kits={names.map((id) => ({ id, aesthetic: description })) as never}
      />,
    ],
    [
      'prompts',
      <PromptPicker
        {...budget}
        selected={22}
        category="all"
        total={35}
        entries={names.map((name) => ({
          slug: name,
          title: name,
          description,
          category: 'all',
          source: 'project',
          content: description,
          favorite: false,
        }))}
      />,
    ],
    [
      'resource',
      <ResourceMenu
        {...budget}
        selected={22}
        snapshot={{
          id: 'git',
          title: 'Git state',
          items: names.map((name) => ({
            id: name,
            label: name,
            summary: description,
            details: [{ label: 'Branch', value: 'main' }],
            body: description,
            actions: [{ key: 'r', label: 'refresh', command: '/git' }],
          })),
        }}
      />,
    ],
  ] as const;
  it.each(cases)(
    '%s keeps the focused row and exit hint inside its allocation',
    async (_name, element) => {
      const view = renderRealTty(element, { columns, rows: 60 });
      try {
        await settle();
        const frame = view.lastFrame();
        expect(frame).toContain('item-22');
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
