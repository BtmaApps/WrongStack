import { writeClipboardText } from '@wrongstack/runtime/clipboard';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionText } from '../src/cell-selection.js';
import { Input } from '../src/components/input.js';
import {
  type HistoryScrollController,
  ScrollableHistory,
} from '../src/components/scrollable-history.js';
import {
  getSettingsFieldValue,
  resetSettingsFieldValue,
  resolveSettingsFieldValue,
  SETTINGS_DEFAULTS,
  SETTINGS_FIELD_LABELS,
} from '../src/components/settings-picker-model.js';
import { type RealTtyView, renderRealTty } from './helpers/real-tty.js';

vi.mock('@wrongstack/runtime/clipboard', () => ({
  writeClipboardText: vi.fn(async () => true),
  readClipboardText: vi.fn(async () => ''),
  readClipboardImage: vi.fn(async () => null),
}));
const views: RealTtyView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.unmount();
  vi.clearAllMocks();
});
function mount(element: Parameters<typeof renderRealTty>[0], columns = 60) {
  const view = renderRealTty(element, { columns, rows: 30 });
  views.push(view);
  return view;
}
const mouse = (kind: 'press' | 'move' | 'release', x: number, y: number) =>
  `\x1b[<${kind === 'move' ? 32 : 0};${x};${y}${kind === 'release' ? 'm' : 'M'}`;

describe('selection preference', () => {
  it('defaults to Block and supports Settings read, write, reset and row lookup', () => {
    expect(SETTINGS_DEFAULTS.selectionMode).toBe('block');
    expect(SETTINGS_FIELD_LABELS[67]).toBe('Chat selection');
    expect(
      getSettingsFieldValue({ ...SETTINGS_DEFAULTS, selectionMode: 'text' }, 67),
    ).toMatchObject({ displayValue: 'text' });
    expect(resolveSettingsFieldValue(67, 'text')).toMatchObject({
      ok: true,
      patch: { selectionMode: 'text' },
    });
    expect(resolveSettingsFieldValue(67, 'invalid').ok).toBe(false);
    expect(resetSettingsFieldValue(67)).toMatchObject({
      ok: true,
      patch: { selectionMode: 'block' },
    });
  });
});

describe('display-cell selection', () => {
  it('orders endpoints by document position instead of creating a rectangle', () => {
    const runs = [
      { row: 0, col: 0, text: 'abcdef' },
      { row: 1, col: 0, text: 'ghijkl' },
    ];
    expect(selectionText(runs, { anchor: { row: 1, col: 1 }, head: { row: 0, col: 4 } })).toBe(
      'ef\ngh',
    );
  });
  it('never splits wide or combined graphemes', () => {
    expect(
      selectionText([{ row: 0, col: 0, text: 'A👩‍💻é中Z' }], {
        anchor: { row: 0, col: 2 },
        head: { row: 0, col: 4 },
      }),
    ).toBe('👩‍💻é中');
  });
});

describe('real-layout chat selection', () => {
  it.each(['block', 'text'] as const)('copies %s mode without including borders', async (mode) => {
    const ref: { current: HistoryScrollController | null } = { current: null };
    const view = mount(
      <ScrollableHistory
        entries={[{ id: 1, kind: 'assistant', text: 'hello **world** goodbye' }]}
        viewportRows={12}
        maxWidth={60}
        controllerRef={ref}
        selectionMode={mode}
      />,
    );
    await vi.waitFor(() => expect(ref.current).not.toBeNull());
    await vi.waitFor(() => expect(view.lastFrame()).toContain('world'));
    const row = view.lines().findIndex((line) => line.includes('world'));
    const col = view.lines()[row]?.indexOf('world') ?? -1;
    expect(row).toBeGreaterThanOrEqual(0);
    expect(col).toBeGreaterThanOrEqual(0);
    ref.current?.beginSelection(row, col);
    ref.current?.extendSelection(row, col + 4);
    expect(await ref.current?.commitSelection()).toBe(true);
    expect(writeClipboardText).toHaveBeenLastCalledWith(
      mode === 'block' ? 'hello **world** goodbye' : 'world',
    );
  });
  it('switching modes cancels an in-progress drag', async () => {
    const ref: { current: HistoryScrollController | null } = { current: null };
    const element = (mode: 'block' | 'text') => (
      <ScrollableHistory
        entries={[{ id: 1, kind: 'assistant', text: 'hello world' }]}
        viewportRows={12}
        maxWidth={60}
        controllerRef={ref}
        selectionMode={mode}
      />
    );
    const view = mount(element('block'));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('hello'));
    const row = view.lines().findIndex((line) => line.includes('hello'));
    ref.current?.beginSelection(row, 3);
    ref.current?.extendSelection(row, 7);
    view.rerender(element('text'));
    await vi.waitFor(() => expect(ref.current?.hasSelection()).toBe(false));
    expect(await ref.current?.commitSelection()).toBe(false);
    expect(writeClipboardText).not.toHaveBeenCalled();
  });
});

describe('composer mouse copy', () => {
  it('copies a reversed drag across wrapped rows without composer chrome', async () => {
    const view = mount(
      <Input prompt="" value="abcdefghijklmnopqrstuvwxyz0123456789" cursor={0} onKey={() => {}} />,
      20,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('abcdefghijklmnop'));
    view.stdin.write(mouse('press', 6, 3));
    view.stdin.write(mouse('move', 5, 2));
    view.stdin.write(mouse('release', 5, 2));
    await vi.waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('cdefghijklmnop\nqrst'));
  });
  it('reports a clipboard failure and permits the next gesture', async () => {
    vi.mocked(writeClipboardText).mockResolvedValueOnce(false);
    const view = mount(<Input prompt="" value="hello world" cursor={11} onKey={() => {}} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('hello world'));
    for (const kind of ['press', 'move', 'release'] as const)
      view.stdin.write(mouse(kind, kind === 'press' ? 3 : 7, 2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Copy failed'));
    for (const kind of ['press', 'move', 'release'] as const)
      view.stdin.write(mouse(kind, kind === 'press' ? 3 : 7, 2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Copied'));
  });
  it('clears a pending drag when the draft changes', async () => {
    const element = (value: string) => (
      <Input prompt="" value={value} cursor={0} onKey={() => {}} />
    );
    const view = mount(element('hello world'));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('hello world'));
    view.stdin.write(mouse('press', 3, 2));
    view.stdin.write(mouse('move', 7, 2));
    view.rerender(element('new draft'));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('new draft'));
    view.stdin.write(mouse('release', 7, 2));
    expect(writeClipboardText).not.toHaveBeenCalled();
  });
  it('copies a dragged substring on release, but never copies on a plain click', async () => {
    const onKey = vi.fn();
    const view = mount(<Input prompt="" value="hello world" cursor={11} onKey={onKey} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('hello world'));
    const row = view.lines().findIndex((line) => line.includes('hello world')) + 1;
    view.stdin.write(mouse('press', 3, row));
    view.stdin.write(mouse('release', 3, row));
    expect(writeClipboardText).not.toHaveBeenCalled();
    view.stdin.write(mouse('press', 3, row));
    view.stdin.write(mouse('move', 7, row));
    view.stdin.write(mouse('release', 7, row));
    await vi.waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('hello'));
  });
  it('clicks the displayed mode label without copying or forwarding pointer input', async () => {
    const toggle = vi.fn();
    const onKey = vi.fn();
    const view = mount(
      <Input value="hello" cursor={5} onKey={onKey} onSelectionModeToggle={toggle} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('[Block]'));
    const row = view.lines().findIndex((line) => line.includes('[Block]')) + 1;
    view.stdin.write(mouse('press', 4, row));
    expect(toggle).toHaveBeenCalledOnce();
    expect(writeClipboardText).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
  });
  it('cancels when released outside the composer', async () => {
    const view = mount(<Input prompt="" value="hello world" cursor={11} onKey={() => {}} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('hello world'));
    view.stdin.write(mouse('press', 3, 2));
    view.stdin.write(mouse('move', 7, 2));
    view.stdin.write(mouse('release', 60, 2));
    expect(writeClipboardText).not.toHaveBeenCalled();
  });
});
