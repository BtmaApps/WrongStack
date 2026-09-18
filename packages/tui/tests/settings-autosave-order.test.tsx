import { render } from 'ink-testing-library';
import { expect, it, vi } from 'vitest';
import type { State } from '../src/app-state.js';
import { useSettingsAutoSave } from '../src/hooks/use-settings-auto-save.js';
import { createTestState } from './helpers/create-test-state.js';
import { settle } from './helpers/real-tty.js';

it('serializes setting saves and continues after a rejected write', async () => {
  let rejectFirst!: (error: Error) => void;
  const first = new Promise<string | null>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const save = vi.fn().mockReturnValueOnce(first).mockResolvedValue(null);
  const dispatch = vi.fn();
  function Harness({ state }: { state: State }) {
    useSettingsAutoSave(state, save, dispatch);
    return null;
  }
  const initial = createTestState();
  initial.settingsPicker.open = true;
  const view = render(<Harness state={initial} />);
  try {
    await settle();
    expect(save).not.toHaveBeenCalled();
    const one = { ...initial, settingsPicker: { ...initial.settingsPicker, delayMs: 1500 } };
    view.rerender(<Harness state={one} />);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    const two = { ...one, settingsPicker: { ...one.settingsPicker, delayMs: 3000 } };
    view.rerender(<Harness state={two} />);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('Disk unavailable'));
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].delayMs).toBe(3000);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'settingsHint',
      text: expect.stringContaining('Disk unavailable'),
    });
  } finally {
    // A failed red assertion must not leak the deliberately pending rejection.
    first.catch(() => {});
    view.unmount();
  }
});
