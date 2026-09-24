/**
 * Background strip keys (Alt+B). While the strip is focused, ←/→ pick a chip,
 * Enter shows or hides its output, `x` asks to stop a background shell and
 * `y` (or Enter) confirms, Esc or Alt+B leaves. Typing text leaves the strip
 * and goes to the composer, as the sidebar focus does. Scrolling, function
 * keys and Ctrl+C keep their normal routes.
 */

import {
  getBackgroundStrip,
  selectedIndex,
  updateBackgroundStrip,
} from '../background-strip-model.js';
import type { KeyEvent } from '../components/input.js';

function isAltB(input: string, key: KeyEvent): boolean {
  return key.meta && !key.ctrl && (input === 'b' || input === 'B');
}

/**
 * Returns true when the key was consumed. `stop` ends a background shell by
 * PID; it is the process registry's kill in the TUI.
 */
export function routeBackgroundStrip(
  input: string,
  key: KeyEvent,
  stop: (pid: number) => void,
): boolean {
  const strip = getBackgroundStrip();
  if (!strip.focused) {
    if (!isAltB(input, key) || strip.items.length === 0) return false;
    updateBackgroundStrip({ focused: true, peek: true, confirmStop: false });
    return true;
  }

  if (key.mouse || key.pageUp || key.pageDown || key.fn !== undefined) return false;
  if (key.ctrl && (input === 'c' || input === '\x03')) return false;

  const index = selectedIndex(strip);
  const item = strip.items[index];
  if (strip.confirmStop) {
    if ((input === 'y' || input === 'Y' || key.return) && item?.pid !== undefined) {
      stop(item.pid);
    }
    updateBackgroundStrip({ confirmStop: false });
    return true;
  }
  if (key.escape || isAltB(input, key)) {
    updateBackgroundStrip({ focused: false, confirmStop: false });
    return true;
  }
  if (key.leftArrow || key.rightArrow || key.tab) {
    const n = strip.items.length;
    const delta = key.leftArrow || (key.tab && key.shift) ? -1 : 1;
    updateBackgroundStrip({ selectedId: strip.items[(index + delta + n) % n]?.id });
    return true;
  }
  if (key.return) {
    updateBackgroundStrip({ peek: !strip.peek });
    return true;
  }
  if ((input === 'x' || input === 'X') && !key.meta && !key.ctrl) {
    if (item?.kind === 'shell') updateBackgroundStrip({ confirmStop: true });
    return true;
  }
  if (key.upArrow || key.downArrow || key.ctrl || key.meta) return true;
  // Anything else is typing: hand the keyboard back to the composer.
  updateBackgroundStrip({ focused: false, confirmStop: false });
  return false;
}
