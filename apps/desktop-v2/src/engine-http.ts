import { EngineHttpError } from './engine-http-error';

export { EngineHttpError, engineHttpError } from './engine-http-error';

import { request } from './platform';

export type EngineHttp = (resource: string, method?: string, body?: unknown) => Promise<unknown>;
export function engineHttp(id: string): EngineHttp {
  return scopedHttp('engine', id);
}
export function projectHttp(id: string): EngineHttp {
  return scopedHttp('project', id);
}
export function profileHttp(): EngineHttp {
  return scopedHttp('profile', '');
}
function scopedHttp(scope: 'engine' | 'project' | 'profile', id: string): EngineHttp {
  return async (resource, method = 'GET', body) => {
    const response = await request<{ ok: boolean; status: number; data: unknown }>(
      `${scope}.http`,
      {
        ...(scope === 'project' ? { projectId: id } : { id }),
        resource,
        method,
        body: body ?? null,
        ...(method === 'POST' ? { operationId: crypto.randomUUID() } : {}),
      },
    );
    if (!response.ok) throw new EngineHttpError(response.status, response.data);
    return response.data;
  };
}
