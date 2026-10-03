import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AutomationJobRecord, AutomationStateView } from '@wrongstack/webui-protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../src/server/http-server.js';

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  if (directory) {
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('wrongstack-automation-http-')
    )
      throw new Error('Refusing cleanup outside the owned fixture');
    await rm(directory, { recursive: true, force: true });
  }
});
describe('project automation HTTP integration', () => {
  it('uses existing token/origin guards and serves the complete project management flow', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-automation-http-'));
    const project = path.join(directory, 'project');
    await mkdir(project);
    const secondProject = path.join(directory, 'second-project');
    await mkdir(secondProject);
    await writeFile(path.join(directory, 'index.html'), '<title>fixture</title>');
    server = createHttpServer({
      host: '127.0.0.1',
      distDir: directory,
      globalRoot: directory,
      projectRoot: project,
      getSessionProjectRoot: (id) => (id === 'second-session' ? secondProject : undefined),
      requireToken: true,
      apiToken: 'fixture-token',
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const request = (route: string, method = 'GET', body?: unknown, origin = base) =>
      fetch(`${base}/api/automation/${route}`, {
        method,
        headers: {
          'x-ws-token': 'fixture-token',
          origin,
          'content-type': 'application/json',
          'idempotency-key': 'one',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    expect((await fetch(`${base}/api/automation/state`)).status).toBe(401);
    expect((await request('state', 'GET', undefined, 'http://evil.invalid')).status).toBe(403);
    expect((await request('state?sessionId=unknown-session')).status).toBe(503);
    const spec = {
      name: 'review',
      image: 'trusted:1',
      prompt: 'Review',
      envNames: [],
      yolo: false,
      enabled: true,
      timeoutMs: 60000,
    };
    const preview = await request('preview', 'POST', { spec });
    expect(preview.status).toBe(200);
    const created = await request('jobs', 'POST', { spec });
    expect(created.status).toBe(201);
    const job = (await created.json()) as AutomationJobRecord;
    expect((await request(`jobs/${job.id}/run`, 'POST')).status).toBe(202);
    const secondState = (await (
      await request('state?sessionId=second-session')
    ).json()) as AutomationStateView;
    expect(secondState.jobs).toHaveLength(0);
    expect((await request(`jobs/${job.id}/run?sessionId=second-session`, 'POST')).status).toBe(404);
    const state = (await (await request('state')).json()) as AutomationStateView;
    expect(state.jobs).toHaveLength(1);
    expect(state.runs).toHaveLength(1);
    expect(state.workerOnline).toBe(false);
    expect(JSON.stringify(state)).not.toContain('fixture-token');
    expect((await request(`runs/${state.runs[0]!.id}/cancel`, 'POST')).status).toBe(200);
    expect(
      (
        await request(`jobs/${job.id}`, 'PUT', {
          spec: { ...spec, prompt: 'Changed' },
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);
    expect((await request(`jobs/${job.id}`, 'PUT', { spec, expectedRevision: 1 })).status).toBe(
      409,
    );
  });
});
