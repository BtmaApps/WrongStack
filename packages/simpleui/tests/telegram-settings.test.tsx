// @vitest-environment jsdom

/**
 * The Telegram half of the SimpleUI settings panel.
 *
 * `tgPollIntervalSec` / `tgChatId` are the two `/telegram-settings` options
 * this surface could not save before. The behaviour worth locking down is
 * *when* the write happens: `useSettings().updatePrefs` applies the patch
 * locally and THEN sends it, and `validatePreferenceValue` rejects the whole
 * `prefs.update` payload on a single bad key. A per-keystroke send would
 * therefore leave "-1" or "abc" displayed in the panel while config never
 * changed — the "looks applied but isn't" failure the parity test at
 * packages/webui-server/tests/prefs-key-allowlist-parity.test.ts guards.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, type SimplePrefs } from '../src/lib/prefs-model.js';
import { SettingsPanel } from '../src/settings-panel.js';

let container: HTMLDivElement;
let root: Root;

/** Render the panel and return the `data-setting-id` row for a setting. */
function renderPanel(prefs: SimplePrefs, onPrefChange: (patch: Partial<SimplePrefs>) => void) {
  act(() =>
    root.render(
      <SettingsPanel
        open
        prefs={prefs}
        modes={[]}
        activeModeId=""
        palette="signal"
        connection="open"
        onClose={vi.fn()}
        onAutonomyChange={vi.fn()}
        onModeChange={vi.fn()}
        onPaletteChange={vi.fn()}
        onPrefChange={onPrefChange}
        onReset={vi.fn()}
        isAtDefaults={false}
        subagentPolicyLocked={false}
      />,
    ),
  );
  return {
    poll: container.querySelector<HTMLSelectElement>(
      '[data-setting-id="telegram.pollInterval"] select',
    ),
    chat: container.querySelector<HTMLInputElement>('[data-setting-id="telegram.chatId"] input'),
  };
}

/** Set an input's value the way React's onChange would see it. */
function type(node: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const proto = node instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function blur(node: HTMLElement) {
  // React maps onBlur to the native bubbling `focusout`; dispatching `blur`
  // never reaches the handler.
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SimpleUI SettingsPanel — Telegram settings', () => {
  it('seeds both fields from the snapshot', () => {
    const { poll, chat } = renderPanel(
      { ...DEFAULT_PREFS, tgPollIntervalSec: 10, tgChatId: '-100123' },
      vi.fn(),
    );
    expect(poll?.value).toBe('10');
    expect(chat?.value).toBe('-100123');
  });

  it('sends a poll interval chosen from the select', () => {
    const onPrefChange = vi.fn();
    const { poll } = renderPanel(DEFAULT_PREFS, onPrefChange);
    type(poll!, '30');
    expect(onPrefChange).toHaveBeenCalledWith({ tgPollIntervalSec: 30 });
  });

  it('offers the stored interval when it is not one of the presets', () => {
    // `/telegram-settings poll 15` (or a hand-edited config) can store any
    // 1–60 value. A <select> with no matching option displays blank or the
    // first entry, so the panel would show an interval the config does not
    // hold — and re-picking the visible value would silently write a
    // different one.
    const { poll } = renderPanel({ ...DEFAULT_PREFS, tgPollIntervalSec: 15 }, vi.fn());
    expect(poll?.value).toBe('15');
  });

  it('commits a typed chat ID on blur, not per keystroke', () => {
    const onPrefChange = vi.fn();
    const { chat } = renderPanel(DEFAULT_PREFS, onPrefChange);
    type(chat!, '12345');
    expect(onPrefChange).not.toHaveBeenCalled();
    blur(chat!);
    expect(onPrefChange).toHaveBeenCalledWith({ tgChatId: '12345' });
  });

  it('trims a pasted chat ID before sending it', () => {
    const onPrefChange = vi.fn();
    const { chat } = renderPanel(DEFAULT_PREFS, onPrefChange);
    type(chat!, '  98765  ');
    blur(chat!);
    expect(onPrefChange).toHaveBeenCalledWith({ tgChatId: '98765' });
  });

  it('clears the chat ID when the field is emptied', () => {
    const onPrefChange = vi.fn();
    const { chat } = renderPanel({ ...DEFAULT_PREFS, tgChatId: '12345' }, onPrefChange);
    type(chat!, '');
    blur(chat!);
    expect(onPrefChange).toHaveBeenCalledWith({ tgChatId: '' });
  });

  // "-" and "1." are transient keystrokes, not user errors; sending them
  // would trip the server's whole-payload rejection. The 20-digit case pins
  // the client's Number.isSafeInteger mirror of validateTelegramChatId.
  it.each(['-', '1.', 'abc', '1e4', '0', '-0', '99999999999999999999'])(
    'blocks the invalid chat id %j instead of sending it',
    (value) => {
      const onPrefChange = vi.fn();
      const { chat } = renderPanel(DEFAULT_PREFS, onPrefChange);
      type(chat!, value);
      blur(chat!);
      expect(onPrefChange).not.toHaveBeenCalled();
      expect(chat?.getAttribute('aria-invalid')).toBe('true');
    },
  );

  it('does not re-send an unchanged chat ID', () => {
    const onPrefChange = vi.fn();
    const { chat } = renderPanel({ ...DEFAULT_PREFS, tgChatId: '12345' }, onPrefChange);
    blur(chat!);
    expect(onPrefChange).not.toHaveBeenCalled();
  });

  it('disables both controls while the socket is offline', () => {
    act(() =>
      root.render(
        <SettingsPanel
          open
          prefs={DEFAULT_PREFS}
          modes={[]}
          activeModeId=""
          palette="signal"
          connection="closed"
          onClose={vi.fn()}
          onAutonomyChange={vi.fn()}
          onModeChange={vi.fn()}
          onPaletteChange={vi.fn()}
          onPrefChange={vi.fn()}
          onReset={vi.fn()}
          isAtDefaults={false}
          subagentPolicyLocked={false}
        />,
      ),
    );
    expect(
      container.querySelector<HTMLSelectElement>('[data-setting-id="telegram.pollInterval"] select')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>('[data-setting-id="telegram.chatId"] input')
        ?.disabled,
    ).toBe(true);
  });
});
