import { charLength, chars, isAttachedMark } from './chars.js';

/**
 * Shorten `s` to at most `max` characters, ending with `ellipsis` when cut.
 */
export function truncate(s, max, ellipsis = '…') {
  if (charLength(s) <= max) return s;
  const keep = max - ellipsis.length;
  return s.slice(0, keep) + ellipsis;
}

/**
 * Reverse `s`, keeping combining marks attached to their base character.
 */
export function reverse(s) {
  const clusters = [];
  for (const ch of chars(s)) {
    if (clusters.length > 0 && isAttachedMark(ch)) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters.reverse().join('');
}

/**
 * Greedy word wrap. Returns an array of lines, each at most `width` characters.
 */
export function wrap(text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (let word of words) {
    while (charLength(word) > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) {
      line = word;
    } else if (charLength(line) + charLength(word) < width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
