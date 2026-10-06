/** Per-tab agents for the CLI-embedded WebUI host. */

import { createSessionAgentRegistry } from '@wrongstack/webui-server';
import type { WebSocket } from 'ws';
import type { CliWebUIOptions } from '../webui-server-options.js';
import type { ConnectedClient } from './connection-handler.js';

/**
 * One Agent per open tab.
 *
 * The embedded host used to hand every tab the same leader Agent, so the
 * second tab to start a run hit `Agent.run()`'s concurrency guard —
 * "already in progress on this instance". Four tabs need four Agents; the
 * registry clones the leader's wiring and gives each session its own
 * `Context`, which is the state a run actually mutates.
 */
export function createEmbeddedSessionAgents(
  opts: CliWebUIOptions,
  clients: Map<WebSocket, ConnectedClient>,
  abortControllers: Map<string, AbortController>,
) {
  /** Does any connected tab display this session right now? */
  const isSessionDisplayed = (sessionId: string): boolean => {
    for (const client of clients.values()) {
      if (client.sessionId === sessionId) return true;
      if (client.sessionIds?.has(sessionId) === true) return true;
    }
    return false;
  };
  const sessionAgents = createSessionAgentRegistry({
    template: opts.agent,
    ...(opts.modelsRegistry ? { modelsRegistry: opts.modelsRegistry } : {}),
    isRunActive: (sessionId) => abortControllers.has(sessionId),
    // A tab that is still on screen must outlive one that was closed, whatever
    // order their agents were created in.
    isDisplayed: isSessionDisplayed,
  });
  return { sessionAgents, isSessionDisplayed };
}
