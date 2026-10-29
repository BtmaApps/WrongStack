import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { materializeProjectTheme } from '../../../apps/desktop-v2/src/design-studio-actions.js';
import { EngineOperations } from '../../../apps/desktop-v2/src/engine-operations.js';
import { type ContentRouteContext, handleContentRoute } from '../src/server/content-routes.js';

it('writes and reads a project theme through the real desktop action and canonical file protocol', async () => {
  const base = resolve(tmpdir()),
    dir = await mkdtemp(join(base, 'desktop-design-output-'));
  const context = {
    getProjectRoot: () => dir,
    getDesignContext: () => ({ projectRoot: dir }),
    getSkillsContext: () => {
      throw Error('Not skills');
    },
    getPromptsContext: () => {
      throw Error('Not prompts');
    },
  } satisfies ContentRouteContext;
  const socket = {
    readyState: 1,
    send: (message: string) => operations.receive(JSON.parse(message)),
  };
  const operations = new EngineOperations(async (type, payload) => {
    await handleContentRoute(context, socket as unknown as WebSocket, { type, payload } as never);
  }, 5000);
  try {
    await operations.request('design.use', { kit: 'minimal-clarity', stack: 'web' }, [
      'design.use',
    ]);
    const result = await materializeProjectTheme(
      operations.request,
      'web',
      'src/theme/native-theme.css',
    );
    expect(result.path).toBe('src/theme/native-theme.css');
    expect(await readFile(join(dir, result.path), 'utf8')).toContain('--primary');
  } finally {
    operations.clear();
    expect(dir.startsWith(base + sep)).toBe(true);
    await rm(dir, { recursive: true, force: true });
  }
});
