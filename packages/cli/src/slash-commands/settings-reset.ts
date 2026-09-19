import { CONFIG_BEHAVIOR_DEFAULTS } from '@wrongstack/core/storage';
import { color } from '@wrongstack/core/utils';
import { BEHAVIOR_SECTION_KEYS } from '../settings-behavior-sections.js';
import { persistConfigSetting } from '../settings-menu.js';
import type { SlashCommandContext } from './command-context.js';

// ── /settings reset ──────────────────────────────────────────────────────────

/**
 * Behavior sections resettable by `/settings reset`. These are the keys of
 * {@link CONFIG_BEHAVIOR_DEFAULTS} that describe *how the product behaves*.
 * Identity and user-owned namespaces deliberately survive every reset:
 * `provider`, `model`, `providers` (API keys), `mcpServers`, `extensions`,
 * `plugins`, `hq`, `launch`, `fallbackAuto`, `fallbackProfiles`,
 * `fallbackModels`, `fallbackBridge`, `favoriteModels*`, `modelMatrix`,
 * `modelTiers`, `configScope`, `uiLocale`, `version`, `activeProfile`.
 */
// Sections resettable by /settings reset — the shared behavior-section list
// from settings-behavior-sections.ts (same list config-export/import transfer).
const RESET_SECTIONS = BEHAVIOR_SECTION_KEYS;
type ResetSection = (typeof RESET_SECTIONS)[number];

export async function executeSettingsReset(
  rest: string[],
  persistDeps: Parameters<typeof persistConfigSetting>[0],
  opts: SlashCommandContext,
  profileName: string,
): Promise<{ message: string }> {
  const args = rest.map((a) => a.toLowerCase()).filter(Boolean);
  if (args.length === 0) {
    return {
      message: [
        `${color.amber('Usage:')} /settings reset all   ${color.dim('or pick sections:')}`,
        `  ${RESET_SECTIONS.join(', ')}`,
        color.dim(
          `Identity is kept (providers, models, API keys, MCP servers, extensions, plugins, fallbacks). Profile: ${profileName}`,
        ),
      ].join('\n'),
    };
  }

  const wantsAll = args.includes('all');
  const invalid = args.filter((a) => a !== 'all' && !RESET_SECTIONS.includes(a as ResetSection));
  if (invalid.length > 0) {
    return {
      message: `${color.red('Unknown section')}: ${invalid.join(', ')}.   Valid: ${color.cyan(RESET_SECTIONS.join(', '))}, all`,
    };
  }

  const sections: ResetSection[] = wantsAll
    ? [...RESET_SECTIONS]
    : ([...new Set(args)] as ResetSection[]);

  if (!opts.confirm) {
    return {
      message: `${color.red('Reset unavailable')}: no confirmation surface in this context. Run /settings reset from the interactive REPL or TUI.`,
    };
  }
  const confirmed = await opts.confirm(
    `Reset ${sections.length} section(s) of profile "${profileName}" to factory defaults? ${sections.join(', ')}`,
    false,
  );
  if (confirmed !== true) {
    return { message: `${color.dim('Reset cancelled — nothing changed.')}` };
  }

  // One deep, writable copy of the frozen defaults; the same patch drives
  // both the on-disk write and the in-memory config store.
  const defaults = structuredClone(CONFIG_BEHAVIOR_DEFAULTS) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of sections) {
    const value = defaults[key];
    if (value === undefined) continue;
    patch[key] =
      value !== null && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : value;
  }

  // Defaults-wins merge on disk: factory values overwrite user values inside
  // the chosen sections, but extension keys that are NOT part of
  // CONFIG_BEHAVIOR_DEFAULTS (tools.nextsteps, tools.wrongProxy, ...) keep
  // their persisted values.
  await persistConfigSetting(persistDeps, (cfg) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== null && typeof value === 'object') {
        const current = (cfg[key] as Record<string, unknown> | null | undefined) ?? {};
        cfg[key] = { ...current, ...value };
      } else {
        cfg[key] = value;
      }
    }
  });
  opts.configStore.update(patch as Parameters<typeof opts.configStore.update>[0]);

  return {
    message: `${color.green('✓')} Reset ${sections.length} section(s) → ${color.cyan(sections.join(', '))}   ${color.dim(`profile: ${profileName}; some halves apply on next session start`)}`,
  };
}
