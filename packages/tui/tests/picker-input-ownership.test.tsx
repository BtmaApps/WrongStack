import { expect, it, vi } from 'vitest';
import { AppViewPickers } from '../src/app-view-pickers.js';
import { MonitorViewportProvider, PanelInputProvider } from '../src/components/monitor-shell.js';
import { STATUSLINE_ITEMS } from '../src/components/statusline-picker.js';
import { createTestState } from './helpers/create-test-state.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

it('foreground statusline scrolling remains active over suspended monitors, but pauses for a blocking prompt', async () => {
  const state = createTestState();
  state.statuslinePicker.open = true;
  state.statuslinePicker.field = STATUSLINE_ITEMS.indexOf('yolo');
  state.statuslinePicker.filtering = true;
  state.statuslinePicker.hint = 'Editing layout';
  const content = (enabled: boolean) => (
    <PanelInputProvider value={false}>
      <MonitorViewportProvider value={{ columns: 60, rows: 22 }}>
        <AppViewPickers
          host={{} as never}
          runtime={
            {
              state,
              dispatch: vi.fn(),
              activity: { nowTick: 0, enhanceDots: '' },
              environment: { setYoloLive: vi.fn() },
              viewState: { inputHeight: 3 },
              statusBarClickMapRef: { current: null },
            } as never
          }
          mainColumnWidth={60}
          pickerMaxRows={22}
          pickerInputEnabled={enabled}
          routedToSidebar={() => false}
          panelPositions={state.settingsPicker.panelPositions}
        />
      </MonitorViewportProvider>
    </PanelInputProvider>
  );
  const view = renderRealTty(content(true), { columns: 60, rows: 24 });
  try {
    await settle(100);
    expect(view.lastFrame()).toContain('scroll 0/');
    view.stdin.write('\x1b[6;3~');
    await settle();
    expect(view.lastFrame()).toContain('scroll 3/');
    view.rerender(content(false));
    await settle();
    view.stdin.write('\x1b[6;3~');
    await settle();
    expect(view.lastFrame()).not.toContain('STATUS LINE');
  } finally {
    view.unmount();
  }
});

it('a blocking approval keeps background pickers out of the visible layout', async () => {
  const state = createTestState();
  state.modelPicker.open = true;
  state.modelPicker.providerOptions = [
    { id: 'background-provider', family: 'openai', models: ['model'] },
  ];
  state.confirmQueue = [
    {
      toolUseId: 'approve-1',
      toolName: 'exec',
      input: { command: 'echo test' },
      suggestedPattern: 'exec',
      destructive: false,
      resolve: vi.fn(),
    },
  ];
  const view = renderRealTty(
    <AppViewPickers
      host={{} as never}
      runtime={
        {
          state,
          dispatch: vi.fn(),
          activity: { nowTick: 0, enhanceDots: '' },
          environment: { setYoloLive: vi.fn() },
          viewState: { inputHeight: 3 },
          statusBarClickMapRef: { current: null },
        } as never
      }
      mainColumnWidth={52}
      pickerMaxRows={12}
      pickerInputEnabled={false}
      routedToSidebar={() => false}
      panelPositions={state.settingsPicker.panelPositions}
    />,
    { columns: 52, rows: 16 },
  );
  try {
    await settle(100);
    expect(view.lastFrame()).toContain('APPROVAL REQUIRED');
    expect(view.lastFrame()).not.toContain('background-provider');
    expect(view.lines().length).toBeLessThanOrEqual(12);
  } finally {
    view.unmount();
  }
});
