// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FocusDirection, installFocusBoundary } from '../src/shared/focus-boundary.js';

let boundary: ReturnType<typeof installFocusBoundary>;
let request: ReturnType<typeof vi.fn<(direction: FocusDirection) => Promise<boolean>>>;
let receive: (direction: FocusDirection) => void;
const stop = vi.fn();

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing fixture ${id}`);
  return value;
}
function tab(options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.activeElement?.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML =
    '<button id="first">First</button><button id="middle">Middle</button><button id="last">Last</button>';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([new DOMRect(0, 0, 10, 10)], { item: () => new DOMRect(0, 0, 10, 10) }),
  );
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  request = vi.fn(async () => true);
  boundary = installFocusBoundary(document, {
    request,
    onFocus: (listener) => {
      receive = listener;
      return stop;
    },
  });
  boundary.setAvailable(true);
});
afterEach(() => {
  boundary.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Desktop document boundary traversal', () => {
  it.each([
    ['last', false, 'forward'],
    ['first', true, 'backward'],
  ] as const)('routes %s only at its directional edge', (id, shiftKey, direction) => {
    element(id).focus();
    expect(tab({ shiftKey }).defaultPrevented).toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith(direction);
  });

  it.each(['first', 'middle'])('preserves forward traversal at %s', (id) => {
    element(id).focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves interior reverse traversal', () => {
    element('middle').focus();
    expect(tab({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }])(
    'does not capture modified or composing Tab: %j',
    (options) => {
      element('last').focus();
      expect(tab(options).defaultPrevented).toBe(false);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('defers to document-level focus traps that prevent Tab', () => {
    const trap = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener('keydown', trap);
    try {
      element('last').focus();
      tab();
      expect(request).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', trap);
    }
  });

  it('never exits a visible modal even if its own trap has not handled Tab', () => {
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true"><button id="only">Only</button></div>';
    element('only').focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not swallow a second Tab while a handoff is pending', () => {
    request.mockImplementation(() => new Promise<boolean>(() => {}));
    element('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(tab().defaultPrevented).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });

  it('allows traversal past a modeless open dialog', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<dialog open><button id="modeless">Modeless</button></dialog>',
    );
    element('modeless').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith('forward');
  });

  it('enters the last visible modal, not a background dialog', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div role="dialog" aria-modal="true"><button>Background</button></div><div role="dialog" aria-modal="true"><button id="topmost">Topmost</button></div>',
    );
    receive('forward');
    expect(document.activeElement).toBe(element('topmost'));
  });

  it('keeps radio groups with different form owners independent', () => {
    document.body.innerHTML =
      '<form id="a"></form><form id="b"></form><input type="radio" name="choice" form="a" checked><input id="form-b" type="radio" name="choice" form="b" checked>';
    element('form-b').focus();
    tab();
    expect(request).toHaveBeenCalledExactlyOnceWith('forward');
  });

  it('does not route while the peer view is unavailable', () => {
    boundary.setAvailable(false);
    element('last').focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('excludes hidden, inert, disabled, closed-details and negative-tabindex targets', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <button hidden>Hidden</button><div style="display:none"><button>Invisible</button></div>
      <div inert><button>Inert</button></div><fieldset disabled><button>Disabled</button></fieldset>
      <button tabindex="-1">Programmatic</button><details><button>Closed</button></details>`,
    );
    element('last').focus();
    tab();
    expect(request).toHaveBeenCalledExactlyOnceWith('forward');
  });

  it('honors positive tabindex before ordinary DOM order', () => {
    element('middle').tabIndex = 1;
    element('middle').focus();
    tab({ shiftKey: true });
    expect(request).toHaveBeenCalledExactlyOnceWith('backward');
  });

  it('treats a named radio group as one sequential target', () => {
    document.body.innerHTML =
      '<input id="selected" type="radio" name="choice" checked><input type="radio" name="choice">';
    element('selected').focus();
    tab();
    expect(request).toHaveBeenCalledExactlyOnceWith('forward');
  });

  it('does not guess traversal inside shadow roots', () => {
    element('last').remove();
    const host = document.createElement('div');
    host.tabIndex = 0;
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<button>Inside</button>';
    host.focus();
    tab();
    expect(request).not.toHaveBeenCalled();
  });

  it('focuses first/last targets on host handoff and recalculates after DOM changes', () => {
    receive('forward');
    expect(document.activeElement).toBe(element('first'));
    element('last').remove();
    receive('backward');
    expect(document.activeElement).toBe(element('middle'));
  });

  it('enters the current modal rather than background controls', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div role="dialog" aria-modal="true"><button id="modal">Modal</button></div>',
    );
    receive('forward');
    expect(document.activeElement).toBe(element('modal'));
  });

  it('gives an empty document a focus destination without leaving a tabindex mutation', () => {
    document.body.replaceChildren();
    receive('forward');
    expect(document.activeElement).toBe(document.body);
    expect(document.body.hasAttribute('tabindex')).toBe(false);
  });

  it.each([false, 'reject'])(
    'keeps usable local traversal when handoff fails: %s',
    async (result) => {
      request.mockImplementation(async () => {
        if (result === 'reject') throw new Error('Closed');
        return false;
      });
      element('last').focus();
      tab();
      await vi.waitFor(() => expect(document.activeElement).toBe(element('first')));
    },
  );

  it('does not reclaim focus after the user moved during a rejected handoff', async () => {
    let resolve: (result: boolean) => void = () => {};
    request.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    element('last').focus();
    tab();
    element('middle').focus();
    resolve(false);
    await Promise.resolve();
    expect(document.activeElement).toBe(element('middle'));
  });

  it('disposes listeners and suppresses fallback after teardown', async () => {
    request.mockResolvedValue(false);
    element('last').focus();
    tab();
    boundary.dispose();
    await Promise.resolve();
    expect(document.activeElement).toBe(element('last'));
    request.mockClear();
    tab();
    expect(request).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
