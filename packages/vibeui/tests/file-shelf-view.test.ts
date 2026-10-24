// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileShelf } from '../src/components/file-shelf';
import { fileShelfKey } from '../src/lib/file-shelf';
import { useFileShelf } from '../src/lib/use-file-shelf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Shelf = ReturnType<typeof useFileShelf>;
const roots: Root[] = [];
let latest: Shelf | null = null;

function Host({
  cwd,
  offline = false,
  onOpen = () => {},
}: {
  cwd: string;
  offline?: boolean;
  onOpen?: (path: string) => void;
}) {
  const shelf = useFileShelf(cwd);
  latest = shelf;
  return createElement(FileShelf, { shelf, offline, onOpen });
}

function mount(props: { cwd: string; offline?: boolean; onOpen?: (path: string) => void }) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(createElement(Host, props)));
  return {
    host,
    rerender: (next: typeof props) => act(() => root.render(createElement(Host, next))),
  };
}

const button = (host: HTMLElement, label: string) => {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`missing button ${label}`);
  return found;
};
const stored = (cwd: string) => JSON.parse(localStorage.getItem(fileShelfKey(cwd)) || 'null');

beforeEach(() => {
  localStorage.clear();
  latest = null;
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('handy files shelf', () => {
  it('stays hidden until the project has pinned or recent files', () => {
    const { host } = mount({ cwd: 'D:/work/app' });
    expect(latest?.ready).toBe(true);
    expect(host.innerHTML).toBe('');
    act(() => latest!.remember('src/index.ts'));
    expect(host.querySelector('summary')?.textContent).toContain('Recently opened');
    expect(stored('D:/work/app').recent).toEqual(['src/index.ts']);
  });

  it('is not ready and renders nothing without a project directory', () => {
    const { host } = mount({ cwd: '' });
    expect(latest?.ready).toBe(false);
    act(() => latest!.remember('a.ts'));
    expect(latest?.data.recent).toEqual([]);
    expect(host.innerHTML).toBe('');
  });

  it('reads the stored shelf for the project and opens, unpins and clears files', () => {
    localStorage.setItem(
      fileShelfKey('D:\\work\\app'),
      JSON.stringify({
        pinned: ['src\\lib\\pinned.ts'],
        recent: ['src/lib/pinned.ts', 'src\\lib\\pinned.ts', 'docs/readme.md'],
        expanded: true,
      }),
    );
    const onOpen = vi.fn();
    const { host } = mount({ cwd: 'd:/work/app/', onOpen });
    expect(host.querySelector('summary small')?.textContent).toBe('1 pinned');
    const pinned = button(host, 'Open pinned src\\lib\\pinned.ts');
    expect(pinned.textContent).toBe('pinned.ts');
    // The exact pinned path is not repeated among recents; other spellings and files are.
    const recentLabels = [...host.querySelectorAll('nav[aria-label="Recent files"] button')].map(
      (item) => item.getAttribute('aria-label'),
    );
    expect(recentLabels).toEqual([
      'Open recent src/lib/pinned.ts',
      'Open recent docs/readme.md',
      null,
    ]);
    const recent = button(host, 'Open recent docs/readme.md');
    expect(recent.textContent).toBe('readme.md');
    expect(host.textContent).not.toContain('Keep handy');

    act(() => pinned.click());
    act(() => recent.click());
    expect(onOpen.mock.calls).toEqual([['src\\lib\\pinned.ts'], ['docs/readme.md']]);

    act(() => button(host, 'Unpin src\\lib\\pinned.ts').click());
    expect(stored('d:/work/app').pinned).toEqual([]);
    expect(host.querySelector('summary small')?.textContent).toBe('Recently opened');
    expect(host.textContent).toContain('Keep handy');
    expect(host.querySelector('nav[aria-label="Pinned files"]')).toBe(null);

    const clear = [...host.querySelectorAll('button')].find(
      (item) => item.textContent === 'Clear recent shortcuts',
    )!;
    act(() => clear.click());
    expect(stored('d:/work/app').recent).toEqual([]);
    expect(host.innerHTML).toBe('');
  });

  it('disables opening while offline but still allows unpinning', () => {
    localStorage.setItem(
      fileShelfKey('/srv/app'),
      JSON.stringify({ pinned: ['a.ts'], recent: ['b.ts'], expanded: true }),
    );
    const onOpen = vi.fn();
    const { host } = mount({ cwd: '/srv/app', offline: true, onOpen });
    expect(button(host, 'Open pinned a.ts').disabled).toBe(true);
    expect(button(host, 'Open recent b.ts').disabled).toBe(true);
    expect(button(host, 'Unpin a.ts').disabled).toBe(false);
  });

  it('persists the expanded state when the shelf is toggled', () => {
    localStorage.setItem(
      fileShelfKey('/srv/app'),
      JSON.stringify({ pinned: ['a.ts'], recent: [], expanded: false }),
    );
    const { host } = mount({ cwd: '/srv/app' });
    const details = host.querySelector('details')!;
    expect(details.open).toBe(false);
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(latest?.data.expanded).toBe(true);
    expect(stored('/srv/app').expanded).toBe(true);
    const before = localStorage.getItem(fileShelfKey('/srv/app'));
    act(() => latest!.setExpanded(true));
    expect(localStorage.getItem(fileShelfKey('/srv/app'))).toBe(before);
  });

  it('keeps projects apart when the working directory changes', () => {
    localStorage.setItem(
      fileShelfKey('/one'),
      JSON.stringify({ pinned: ['one.ts'], recent: [], expanded: true }),
    );
    const { host, rerender } = mount({ cwd: '/one' });
    expect(host.textContent).toContain('one.ts');
    act(() => latest!.togglePin('shared.ts'));
    rerender({ cwd: '/two' });
    expect(latest?.data.pinned).toEqual([]);
    expect(host.innerHTML).toBe('');
    act(() => latest!.togglePin('two.ts'));
    expect(stored('/one').pinned).toEqual(['one.ts', 'shared.ts']);
    expect(stored('/two').pinned).toEqual(['two.ts']);
  });

  it('keeps working when storage is unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { host } = mount({ cwd: '/blocked' });
      expect(latest?.ready).toBe(true);
      act(() => latest!.remember('x.ts'));
      expect(button(host, 'Open recent x.ts')).toBeTruthy();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
