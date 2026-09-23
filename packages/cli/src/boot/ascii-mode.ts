import { installAsciiOutput, isAsciiMode } from '@wrongstack/core/utils';

let installed = false;

/**
 * `--ascii` (or `WRONGSTACK_TUI_ICON_STYLE=ascii`): plain-ASCII output for
 * terminals and fonts without box drawing, emoji or Nerd Font glyphs.
 *
 * The flag sets the env var so the lazily loaded TUI (its glyph set and Ink
 * wrapper read it at module load) and child `wstack` processes see the same
 * choice. stdout/stderr are wrapped so the plain REPL, one-shot output and
 * anything the TUI did not route through its `Text` wrapper come out ASCII too.
 * Runs before any surface is loaded.
 */
export function applyAsciiMode(
  flags: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  streams: readonly NodeJS.WriteStream[] = [process.stdout, process.stderr],
): boolean {
  if (flags['ascii'] === true) env['WRONGSTACK_TUI_ICON_STYLE'] = 'ascii';
  if (!isAsciiMode(env)) return false;
  if (!installed) {
    installed = true;
    for (const stream of streams) installAsciiOutput(stream);
  }
  return true;
}
