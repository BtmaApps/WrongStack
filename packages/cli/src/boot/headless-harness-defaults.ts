import { isSystemPromptPinned } from './system-prompt-menu.js';

/**
 * Another harness driving `wstack` (Terminal-Bench style:
 * `wstack "$PROMPT" --provider p --model m --yolo-plus --output-format stream-json`)
 * got the operator's full interactive profile: the identity saved for the
 * TUI (often `pro`) and its whole tool roster on the wire. Such a launch is a
 * single task for a machine, so it runs the Quick identity, whose provider
 * surface is the basic tools plus the `tool_search` / `tool_use` gateway (see
 * `QUICK_DIRECT_TOOL_NAMES` in core) — the cheapest harness that did not cost
 * success on the bench — and without the [TOOL COACH] advice folded into each
 * turn, which a one-shot task pays for in tokens and never reads as guidance.
 *
 * A launch counts as headless when it is single-shot and its output goes to a
 * program: `--output-json` / `--output-format json|stream-json`, or neither
 * stdin nor stdout is a terminal. `git diff | wstack "review"` typed at a
 * terminal keeps the operator's profile. `--host-profile` keeps all of it; a
 * `--system-*` flag keeps that identity.
 *
 * Returns true when it changed `flags`.
 */
export function applyHeadlessHarnessDefaults(input: {
  flags: Record<string, string | boolean>;
  positional: readonly string[];
  isSubcommand: (name: string) => boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}): boolean {
  const { flags, positional } = input;
  const first = positional[0];
  const singleShot =
    typeof flags['prompt'] === 'string' || (first !== undefined && !input.isSubcommand(first));
  if (!singleShot) return false;
  const machineOutput =
    flags['output-json'] === true ||
    flags['output-format'] === 'json' ||
    flags['output-format'] === 'stream-json';
  if (!machineOutput && (input.stdinIsTTY || input.stdoutIsTTY)) return false;
  if (flags['host-profile'] === true) return false;
  flags['no-tool-coach'] = true;
  if (!isSystemPromptPinned(flags)) flags['system-quick'] = true;
  return true;
}
