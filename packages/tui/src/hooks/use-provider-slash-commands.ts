import { useEffect } from 'react';
import { registerSlashCommandLifecycle } from '../slash-command-lifecycle.js';
import type { TuiSlashCommandOptions } from './tui-slash-command-options.js';

/**
 * Provider-domain slash commands (/model, /f), moved verbatim from
 * useTuiSlashCommands (decomposition Phase 2 — docs/decomposition-plan.md).
 *
 * Membership delta recorded per decision D2: /f (the F-key panel picker)
 * rides in this slice — its position 3 has no dedicated slice among the five
 * approved domain names, and it sits directly after /model in the pinned
 * registration order (tests/slash-registration-enumeration.test.ts,
 * positions 2–3).
 */
/**
 * `/model acp/claude-code` or `/model acp claude-code` → the pair to switch to.
 * The provider id never contains a slash; the model id may (`openrouter/x/y`).
 */
export function parseModelTarget(args: string): { provider: string; model: string } | undefined {
  const text = args.trim();
  if (!text) return undefined;
  const space = text.match(/^(\S+)\s+(\S+)$/);
  if (space?.[1] && space[2]) return { provider: space[1], model: space[2] };
  const slash = text.indexOf('/');
  if (slash <= 0 || slash === text.length - 1 || /\s/.test(text)) return undefined;
  return { provider: text.slice(0, slash), model: text.slice(slash + 1) };
}

export function useProviderSlashCommands(deps: TuiSlashCommandOptions): void {
  const {
    slashRegistry,
    getPickableProviders,
    switchProviderAndModel,
    openModelPicker,
    openFKeyPicker,
  } = deps;

  // Register the TUI-only `/model` command — opens a two-step picker
  // (provider → model). All work is local state mutation; the actual
  // switch fires only after the user confirms a model in step 2.
  useEffect(() => {
    if (!getPickableProviders || !switchProviderAndModel) return;
    const cmd = {
      name: 'model',
      aliases: ['provider', 'switch'],
      description:
        'Pick a provider + model interactively (two-step), or switch at once: /model <provider>/<model>.',
      async run(args: string) {
        const target = parseModelTarget(args);
        if (!target) {
          if (args.trim()) {
            return { message: 'Usage: /model <provider>/<model>  (or /model to pick from a list)' };
          }
          await openModelPicker();
          return { message: undefined };
        }
        const error = await switchProviderAndModel(target.provider, target.model);
        return {
          message: error
            ? `Could not switch to ${target.provider}/${target.model}: ${error}`
            : `Switched to ${target.provider} / ${target.model}.`,
        };
      },
    };
    // Register as an official TUI plugin so it can override a CLI built-in
    // of the same name (owner='tui' + official=true → claims the bare name).
    return registerSlashCommandLifecycle(slashRegistry, cmd, {
      owner: 'tui',
      official: true,
    });
  }, [slashRegistry, getPickableProviders, switchProviderAndModel, openModelPicker]);

  // Register the TUI-only `/f` command — opens the keyboard-navigable F-key panel picker.
  useEffect(() => {
    const cmd = {
      name: 'f',
      description: 'Open F-key panel picker. Arrow keys to navigate, Enter to open, Esc to close.',
      async run() {
        openFKeyPicker();
        return { message: undefined };
      },
    };
    // Register as an official TUI plugin so it overrides the CLI's text-based
    // /f command. Without this, only /f 1..12 would work.
    return registerSlashCommandLifecycle(slashRegistry, cmd, {
      owner: 'tui',
      official: true,
    });
  }, [slashRegistry, openFKeyPicker]);
}
