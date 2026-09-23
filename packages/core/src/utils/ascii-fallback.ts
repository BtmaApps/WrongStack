/**
 * ASCII mode: every symbol the UI prints (box drawing, arrows, bullets,
 * spinners, emoji, Nerd Font icons, typographic punctuation) is replaced by
 * plain ASCII, for terminals and fonts that cannot draw them. Letters and
 * digits in any script are left alone: the user's own text (`ş`, `é`, `中`)
 * is content, not chrome.
 *
 * Turned on by `WRONGSTACK_TUI_ICON_STYLE=ascii` (or `--ascii`, which sets
 * it). The TUI converts text before Ink measures it; everything else goes
 * through `installAsciiOutput`, which keeps each symbol's display width so a
 * layout already measured is not shifted.
 *
 * @module utils/ascii-fallback
 */
import { StringDecoder } from 'node:string_decoder';

/** True when the environment selects the ASCII icon style. */
export function isAsciiMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env['WRONGSTACK_TUI_ICON_STYLE']?.trim().toLowerCase();
  return raw === 'ascii' || raw === 'plain';
}

/** Explicit replacements; anything unlisted falls back by Unicode block. */
const MAP: Record<string, string> = {
  '…': '...',
  '⋯': '...',
  '—': '-',
  '–': '-',
  '−': '-',
  '·': '.',
  '•': '*',
  '‹': '<',
  '›': '>',
  '«': '<<',
  '»': '>>',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '×': 'x',
  '⨯': 'x',
  '÷': '/',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~',
  '∞': 'inf',
  '＋': '+',
  '←': '<-',
  '→': '->',
  '↑': '^',
  '↓': 'v',
  '↔': '<>',
  '⇒': '=>',
  '↳': '`-',
  '↻': '@',
  '↺': '@',
  '⟳': '@',
  '⟲': '@',
  '✓': '+',
  '✔': '+',
  '✅': '+',
  '✗': 'x',
  '✘': 'x',
  '❌': 'x',
  '⚠': '!',
  '❗': '!',
  '❯': '>',
  '▶': '>',
  '▸': '>',
  '▹': '>',
  '►': '>',
  '◀': '<',
  '▲': '^',
  '△': '^',
  '▼': 'v',
  '▽': 'v',
  '●': 'o',
  '○': 'o',
  '◉': 'o',
  '◯': 'o',
  '⏸': '||',
  '■': '#',
  '□': '[]',
  '★': '*',
  '☆': '*',
  '█': '#',
  '▓': '#',
  '▒': '=',
  '░': '.',
  '═': '=',
  '║': '|',
  // Letterlike symbols that Unicode files under letters (`ℹ` is Ll).
  'ℹ': 'i',
  '™': 'TM',
};

const HORIZONTAL = new Set('─━┄┅┈┉╌╍╴╶╸╺╼╾');
const VERTICAL = new Set('│┃┆┇┊┋╎╏╵╷╹╻╽╿');
const SPINNER = ['|', '/', '-', '\\'];

// Grapheme clusters that carry text (letters, digits, currency, spaces) stay.
const KEEP_RE = /[\p{L}\p{N}\p{Sc}]/u;
const WIDE_RE = /\p{Emoji_Presentation}|\uFE0F|[\u{1F000}-\u{1FAFF}]/u;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function fallbackFor(cluster: string): string {
  const mapped = MAP[cluster] ?? MAP[cluster.replace(/[\uFE0E\uFE0F]/g, '')];
  if (mapped !== undefined) return mapped;
  const cp = cluster.codePointAt(0) ?? 0;
  if (cp >= 0x2500 && cp <= 0x257f) {
    if (HORIZONTAL.has(cluster)) return '-';
    if (VERTICAL.has(cluster)) return '|';
    return '+';
  }
  if (cp >= 0x2580 && cp <= 0x259f) return '#';
  if (cp >= 0x2800 && cp <= 0x28ff) return SPINNER[cp % SPINNER.length] as string;
  if (cp >= 0x2190 && cp <= 0x21ff) return '>';
  if (/\p{Zs}/u.test(cluster)) return ' ';
  return '*';
}

/**
 * Replace every non-ASCII symbol in `text` with ASCII. With `preserveWidth`,
 * each replacement is padded or cut to the symbol's own display width (two
 * columns for emoji, one otherwise), for text that was already laid out.
 * ANSI escape sequences are ASCII and pass through unchanged.
 */
export function toAscii(text: string, opts: { preserveWidth?: boolean } = {}): string {
  // Fast path: nothing outside ASCII.
  if (!/[^\x00-\x7f]/.test(text)) return text;
  let out = '';
  for (const { segment } of SEGMENTER.segment(text)) {
    const listed = MAP[segment.replace(/[︎️]/g, '')] !== undefined;
    if (!/[^\x00-\x7f]/.test(segment) || (!listed && KEEP_RE.test(segment))) {
      out += segment;
      continue;
    }
    // Variation selectors and joiners on their own have no width.
    if (/^[\uFE0E\uFE0F\u200B-\u200D\u2060]+$/.test(segment)) continue;
    const replacement = fallbackFor(segment);
    if (!opts.preserveWidth) {
      out += replacement;
      continue;
    }
    const width = WIDE_RE.test(segment) ? 2 : 1;
    out += replacement.padEnd(width, ' ').slice(0, width);
  }
  return out;
}

/**
 * Route `stream.write` through `toAscii` (width-preserving). Buffers are
 * decoded with a streaming decoder so a multi-byte character split across
 * two writes is converted whole. Returns an uninstall function.
 */
export function installAsciiOutput(stream: NodeJS.WriteStream): () => void {
  const original = stream.write;
  const decoder = new StringDecoder('utf8');
  const patched = function write(
    this: NodeJS.WriteStream,
    chunk: unknown,
    encodingOrCb?: unknown,
    cb?: unknown,
  ): boolean {
    const call = original as (...args: unknown[]) => boolean;
    if (typeof chunk === 'string') {
      // A string in another encoding (`base64`, `hex`) is data, not text.
      const encoding = typeof encodingOrCb === 'string' ? encodingOrCb.toLowerCase() : 'utf8';
      if (encoding !== 'utf8' && encoding !== 'utf-8') {
        return call.call(this, chunk, encodingOrCb, cb);
      }
      return call.call(this, toAscii(chunk, { preserveWidth: true }), encodingOrCb, cb);
    }
    if (chunk instanceof Uint8Array) {
      const text = decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      return call.call(this, toAscii(text, { preserveWidth: true }), 'utf8', callback);
    }
    return call.call(this, chunk, encodingOrCb, cb);
  };
  stream.write = patched as NodeJS.WriteStream['write'];
  return () => {
    if (stream.write === patched) stream.write = original;
  };
}
