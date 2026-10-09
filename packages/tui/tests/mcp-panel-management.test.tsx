import { useReducer, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/app-initial-state.js';
import { reducer } from '../src/app-reducer.js';
import type { KeyEvent } from '../src/components/input.js';
import { McpPicker } from '../src/components/mcp-picker.js';
import { usePanelControllers } from '../src/hooks/use-panel-controllers.js';
import { tryToolsSettingsPickerKeys } from '../src/hooks/use-picker-keys-tools-settings.js';
import type { PickerKeysHost } from '../src/hooks/use-picker-keys-types.js';
import { Text, useInput } from '../src/ink.js';
import type { McpPickerItem } from '../src/ui-contracts.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

describe('MCP management keyboard journey', () => {
  it.each([
    [100, 30],
    [60, 12],
  ])('adds, edits, cancels and confirms removal at %ix%i', async (columns, rows) => {
    let items: McpPickerItem[] = [];
    const getMcpServers = () => items;
    const manage = vi.fn(async (action: string, input: McpPickerItem) => {
      items =
        action === 'remove' ? [] : [{ ...input, enabled: false, status: 'stopped', toolCount: 0 }];
      return { items, message: `Saved ${action}.` };
    });
    function Probe() {
      const [state, dispatch] = useReducer(reducer, undefined, () =>
        reducer(
          createInitialState({
            banner: false,
            appVersion: 'test',
            model: 'test',
            cwd: '/',
            restoredEntries: [],
            enhanceEnabled: false,
          }),
          { type: 'mcpPickerOpen', items: [] },
        ),
      );
      const stateRef = useRef(state);
      stateRef.current = state;
      const controller = usePanelControllers({
        state,
        stateRef,
        dispatch,
        getMcpServers,
        onMcpManage: manage,
        setLiveToolCount: () => {},
      } as never);
      useInput((input, key) => {
        tryToolsSettingsPickerKeys(
          { state, dispatch, onMcpPickerSave: controller.saveMcpEditor } as PickerKeysHost,
          input,
          key as KeyEvent,
          key.return,
          () => false,
        );
      });
      return state.mcpPicker.open ? (
        <McpPicker {...state.mcpPicker} maxRows={rows - 3} columns={columns} />
      ) : (
        <Text>Closed</Text>
      );
    }
    const view = renderRealTty(<Probe />, { columns, rows });
    const press = async (input: string) => {
      view.stdin.write(input);
      await settle();
    };
    try {
      await settle();
      expect(view.lastFrame()).toContain('MCP Servers');
      await press('a');
      expect(view.lastFrame()).toContain('Add MCP server');
      await press('custom');
      await press('\t');
      await press('\t');
      await press('node');
      await press('\t');
      await press('\x15');
      await press('["path with spaces/server.js"]');
      await press('\r');
      expect(manage).toHaveBeenLastCalledWith(
        'add',
        expect.objectContaining({
          name: 'custom',
          command: 'node',
          args: ['path with spaces/server.js'],
        }),
      );
      expect(view.lastFrame()).toContain('custom');
      await press('e');
      expect(view.lastFrame()).toContain('Edit MCP server');
      await press('\t');
      await press('\x15');
      await press('bun');
      await press('\r');
      expect(manage).toHaveBeenLastCalledWith(
        'edit',
        expect.objectContaining({
          name: 'custom',
          command: 'bun',
          args: ['path with spaces/server.js'],
        }),
      );
      await press('d');
      expect(view.lastFrame()).toContain('Remove MCP server');
      await press('n');
      expect(view.lastFrame()).toContain('MCP Servers');
      expect(manage).toHaveBeenCalledTimes(2);
      await press('d');
      await press('y');
      expect(manage).toHaveBeenLastCalledWith(
        'remove',
        expect.objectContaining({ name: 'custom' }),
      );
      expect(view.lastFrame()).toContain('No MCP servers configured');
      expect(view.lines().length).toBeLessThanOrEqual(rows);
      await press('\x1b');
      expect(view.lastFrame()).toContain('Closed');
    } finally {
      view.unmount();
    }
  });
});
