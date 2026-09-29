import type { ServerResponse } from 'node:http';
import { sanitizeApiError } from '@wrongstack/core/security';
import { getSessionRegistry } from '@wrongstack/core/storage';
import { inspectProjectKit, listProjectKits } from '@wrongstack/tools';
import { decodeSessionId } from './http-server/security-helpers.js';

/** Read-only: executable kit modules are never imported by this endpoint. */
export async function handleProjectKitRead(
  res: ServerResponse,
  url: URL,
  deps: {
    projectRoot?: string | undefined;
    globalRoot?: string | undefined;
    getSessionProjectRoot?: ((sessionId: string) => string | undefined) | undefined;
  },
): Promise<void> {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    let projectRoot = deps.projectRoot;
    const sessionId = url.searchParams.get('sessionId');
    if (sessionId !== null) {
      const decodedSessionId = decodeSessionId(sessionId);
      if (!decodedSessionId || sessionId.length > 200) {
        reply(400, { error: 'Session context is unavailable' });
        return;
      }
      // WebUI tabs have local session agents without a cross-process live entry.
      const localRoot = deps.getSessionProjectRoot?.(decodedSessionId);
      const sessionRoot =
        localRoot ??
        (deps.globalRoot
          ? (await getSessionRegistry(deps.globalRoot).get(decodedSessionId))?.projectRoot
          : undefined);
      if (!sessionRoot) {
        reply(404, { error: 'Session project not found' });
        return;
      }
      // Never accept a client-supplied filesystem path or fall back to a
      // different project's kits when a selected session cannot be resolved.
      projectRoot = sessionRoot;
    }
    if (!projectRoot) {
      reply(400, { error: 'Project root not configured' });
      return;
    }
    const name = url.searchParams.get('name');
    if (name !== null && (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(name) || name.length > 80)) {
      reply(400, { error: 'Invalid Project Kit name' });
      return;
    }
    if (name) reply(200, { projectRoot, kit: await inspectProjectKit(projectRoot, name) });
    else reply(200, { projectRoot, ...(await listProjectKits(projectRoot)) });
  } catch (error) {
    reply((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500, {
      error: sanitizeApiError(error),
    });
  }
}
