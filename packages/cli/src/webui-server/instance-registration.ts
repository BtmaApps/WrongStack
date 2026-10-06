/** Registers the CLI-embedded WebUI host in the shared instance registry. */

import { WEBUI_SESSION_CHILD_CAPABILITIES } from '../boot/webui-session-child.js';
import type { CliWebUIOptions } from '../webui-server-options.js';
import { registerWebuiInstance } from './lifecycle.js';

export interface EmbeddedInstanceRegistrationInput {
  opts: CliWebUIOptions;
  surface: 'webui' | 'simpleui';
  host: string;
  httpPort: number;
  publicUrl: string | undefined;
  registryBaseDir: string;
  wsToken: string;
  currentSessionId: () => string;
}

/**
 * Resolves true once the instance is registered. A session child awaits the
 * registration (its parent reads the record to attach); every other host
 * registers in the background and reports success optimistically.
 */
export async function registerEmbeddedWebuiInstance(
  input: EmbeddedInstanceRegistrationInput,
): Promise<boolean> {
  const { opts, surface, host, httpPort, publicUrl, registryBaseDir, wsToken, currentSessionId } =
    input;
  if (!opts.projectRoot) return false;
  const registration = Promise.resolve(
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
      ...(opts.webuiSessionChild
        ? {
            role: 'session-child' as const,
            sessionId: currentSessionId(),
            parentPid: opts.webuiSessionChild.parentPid,
            parentShellId: opts.webuiSessionChild.parentShellId,
            runtimeId: opts.webuiSessionChild.runtimeId,
            attachable: opts.webuiSessionChild.attachable,
            lastReadyAt: new Date().toISOString(),
            protocolVersion: opts.webuiSessionChild.protocolVersion,
            capabilities: [...WEBUI_SESSION_CHILD_CAPABILITIES],
          }
        : {}),
    }),
  ).then(
    (value: unknown) => value !== false,
    () => false,
  );
  if (opts.webuiSessionChild) return await registration;
  void registration;
  return true;
}
