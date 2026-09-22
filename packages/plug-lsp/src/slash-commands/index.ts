import type { PluginAPI } from '@wrongstack/core/plugin';
import type { DocumentTracker } from '../document-tracker.js';
import type { LSPRegistry } from '../registry.js';
import type { PlugLSPConfig } from '../types.js';
import { diagnosticsCommand } from './diagnostics.js';
import { listCommand } from './list.js';
import { buildLspCommand } from './lsp.js';
import { restartCommand } from './restart.js';
import { startCommand } from './start.js';
import { stopCommand } from './stop.js';

export function registerSlashCommands(
  api: PluginAPI,
  registry: LSPRegistry,
  tracker: DocumentTracker,
  cfg: PlugLSPConfig,
  cwd: string,
): string[] {
  const lspCommand = buildLspCommand({ registry, tracker, cfg, cwd });
  const commands = [
    lspCommand,
    listCommand(registry),
    startCommand(registry),
    stopCommand(registry),
    restartCommand(registry),
    diagnosticsCommand(registry),
  ];
  for (const command of commands) {
    // Renamed wrappers register bare by default — the new names (`lsp-*`)
    // are LSP-specific and discoverable, which is the whole point of the
    // rename. The legacy aliases (`start`, `stop`, `restart`, `list`,
    // `diagnostics`) are kept on each command for muscle-memory continuity.
    // The `stop` alias collides with core's `/interrupt` alias and the
    // registry's alias-reservation invariant (`isAliasReservedKey`) silently
    // refuses that one write; bare `lsp-stop` is unaffected and remains
    // reachable as documented.
    api.slashCommands.register(command);
  }
  return commands.map((cmd) => cmd.name);
}
