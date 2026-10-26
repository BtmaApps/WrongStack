/** Registers the CLI-embedded WebUI host in the shared instance registry. */

import type { CliWebUIOptions } from '../webui-server-options.js';
import { registerWebuiInstance } from './lifecycle.js';

export interface EmbeddedInstanceRegistrationInput {
  opts: CliWebUIOptions;
  surface: 'webui' | 'vibeui';
  host: string;
  httpPort: number;
  publicUrl: string | undefined;
  registryBaseDir: string;
  wsToken: string;
}

/**
 * Records this host in the instance registry in the background; a failed
 * registration never blocks or fails the WebUI launch.
 */
export function registerEmbeddedWebuiInstance(input: EmbeddedInstanceRegistrationInput): void {
  const { opts, surface, host, httpPort, publicUrl, registryBaseDir, wsToken } = input;
  if (!opts.projectRoot) return;
  void Promise.resolve(
    registerWebuiInstance({
      pid: process.pid,
      surface,
      host,
      httpPort,
      publicUrl,
      projectRoot: opts.projectRoot,
      startedAt: new Date().toISOString(),
      registryBaseDir,
      authToken: wsToken,
    }),
  ).catch(() => undefined);
}
