import { writeClipboardText as writeNativeClipboardText } from '@wrongstack/runtime/clipboard';
import { stripAnsi } from './terminal-width.js';

export {
  type ClipboardImage,
  readClipboardImage,
  readClipboardText,
} from '@wrongstack/runtime/clipboard';

/**
 * Longest OSC 52 payload sent. xterm-family terminals drop (or truncate)
 * sequences past roughly 100k base64 characters, and a silently partial copy
 * is worse than a copy that reports failure.
 */
const OSC52_MAX_BASE64 = 100_000;

/**
 * Text as it should reach a clipboard: no ANSI styling from tool output, and
 * no C0 control bytes but tab and line breaks. A NUL ends Windows clipboard
 * text early (everything after it silently vanished), and terminals refuse or
 * cut an OSC 52 payload carrying control bytes.
 */
function clipboardSafeText(text: string): string {
  return stripAnsi(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/** The OSC 52 "set clipboard" sequence for `text`, or undefined when it is too long to send. */
function osc52Sequence(text: string): string | undefined {
  const payload = Buffer.from(text, 'utf8').toString('base64');
  return payload.length > OSC52_MAX_BASE64 ? undefined : `\x1b]52;c;${payload}\x07`;
}

interface ClipboardWriteDeps {
  native: (text: string) => Promise<boolean>;
  stdout: Pick<NodeJS.WriteStream, 'write' | 'isTTY'>;
}

/**
 * Copy text for the TUI's copy actions. The OS clipboard tool first; when there
 * is none that works — an SSH session, a headless Linux box without
 * wl-copy/xclip — the terminal is asked to copy it with OSC 52, which reaches
 * the clipboard of the machine the user is actually sitting at. (Inside tmux
 * that needs `set -g set-clipboard on`.) OSC 52 has no acknowledgement, so a
 * sent sequence counts as copied.
 */
export async function writeClipboardText(
  text: string,
  deps: ClipboardWriteDeps = { native: writeNativeClipboardText, stdout: process.stdout },
): Promise<boolean> {
  const clean = clipboardSafeText(text);
  if (await deps.native(clean)) return true;
  if (!deps.stdout.isTTY) return false;
  const sequence = osc52Sequence(clean);
  if (!sequence) return false;
  deps.stdout.write(sequence);
  return true;
}
