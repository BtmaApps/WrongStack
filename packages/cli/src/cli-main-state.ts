/** Run state shared by the phases of {@link runInteractive} (cli-main.ts). */

import type { CliContext } from './cli-context.js';
import type { setupDirectorAndAutonomy } from './wiring/director-setup.js';

/** The live config: setters across every phase replace `config`, readers see the latest. */
export interface CliConfigState {
  config: CliContext['config'];
}

type DirectorAutonomy = ReturnType<typeof setupDirectorAndAutonomy>;

/** Values the slash commands, TUI and execution builder read and replace after boot. */
export interface CliRunState {
  director: DirectorAutonomy['director'];
  autonomyMode: DirectorAutonomy['autonomyMode'];
  nextPredictEnabled: DirectorAutonomy['nextPredictEnabled'];
  currentSuggestions: DirectorAutonomy['currentSuggestions'];
  eternalEngine: DirectorAutonomy['eternalEngine'];
  parallelEngine: DirectorAutonomy['parallelEngine'];
}
