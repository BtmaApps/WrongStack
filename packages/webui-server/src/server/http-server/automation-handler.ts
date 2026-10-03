import type { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';
import { wstackGlobalRoot } from '@wrongstack/core/utils';
import {
  AutomationStore,
  automationWorkerRequest,
  handleAutomationManagement,
} from '@wrongstack/runtime';

export async function handleProjectAutomation(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  deps: {
    globalRoot?: string | undefined;
    projectRoot?: string | undefined;
    getSessionProjectRoot?: ((sessionId: string) => string | undefined) | undefined;
  },
): Promise<void> {
  const sessionId = url.searchParams.get('sessionId');
  const projectRoot = sessionId
    ? sessionId.length <= 256
      ? deps.getSessionProjectRoot?.(sessionId)
      : undefined
    : deps.projectRoot;
  if (!projectRoot) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Select a project before managing automations' }));
    return;
  }
  const store = new AutomationStore(path.join(deps.globalRoot ?? wstackGlobalRoot(), 'automation'));
  const target = new URL(url);
  target.pathname = target.pathname.replace(/^\/api\/automation/, '/v1');
  const handled = await handleAutomationManagement(
    request,
    response,
    target,
    store,
    async (id) => {
      const run = (await store.snapshot()).runs.find((item) => item.id === id);
      if (run?.status === 'queued') await store.cancel(id);
      else await automationWorkerRequest(store, `/v1/runs/${id}/cancel`, 'POST');
    },
    projectRoot,
    (profile) =>
      path.join(deps.globalRoot ?? wstackGlobalRoot(), 'profiles', profile, 'config.json'),
  );
  if (!handled) {
    response.writeHead(404);
    response.end();
  }
}
