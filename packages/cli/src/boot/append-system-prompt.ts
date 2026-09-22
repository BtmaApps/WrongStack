import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Resolve `--append-system-prompt <text>` and `--append-system-prompt-file
 * <path>` into the text appended to the host system prompt. Both may be given;
 * the inline text comes first. Returns `undefined` when neither carries text.
 *
 * An unreadable file throws: silently dropping instructions the operator asked
 * for would run the session under a prompt they did not intend.
 */
export async function resolveAppendedSystemPrompt(
  flags: Readonly<Record<string, string | boolean>>,
  cwd: string,
): Promise<string | undefined> {
  const parts: string[] = [];
  const inline = flags['append-system-prompt'];
  if (typeof inline === 'string' && inline.trim()) parts.push(inline.trim());

  const file = flags['append-system-prompt-file'];
  if (file === true) {
    throw new Error('--append-system-prompt-file needs a path');
  }
  if (typeof file === 'string' && file.trim()) {
    const resolved = path.resolve(cwd, file.trim());
    let text: string;
    try {
      text = await fs.readFile(resolved, 'utf8');
    } catch (err) {
      const reason = (err as NodeJS.ErrnoException).code ?? String(err);
      throw new Error(`--append-system-prompt-file: cannot read ${resolved} (${reason})`);
    }
    if (text.trim()) parts.push(text.trim());
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}
