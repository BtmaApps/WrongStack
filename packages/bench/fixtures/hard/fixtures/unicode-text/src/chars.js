// Character helpers shared by text.js.

/** Number of characters in `s`. */
export function charLength(s) {
  return s.length;
}

/** Split `s` into characters. */
export function chars(s) {
  return s.split('');
}

/** True when `ch` is a mark that renders on top of the previous character. */
export function isAttachedMark(ch) {
  const cp = ch.charCodeAt(0);
  return cp >= 0x0300 && cp < 0x036f;
}
