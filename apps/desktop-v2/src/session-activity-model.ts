import { contentText, type EngineEvent, record } from './engine-state';

export interface ActivityRow {
  id: string;
  kind: 'tool' | 'reasoning' | 'run' | 'retry';
  title: string;
  status: 'running' | 'done' | 'failed' | 'aborted' | 'info';
  input?: unknown;
  output?: string;
  progress: string[];
  files: Array<{ path: string; operation: string }>;
  sage: string[];
  durationMs?: number;
  outputBytes?: number;
  agent?: string;
}
/** Build readable, session-local activity from canonical engine frames. */
export function activityRows(events: readonly EngineEvent[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  const tools = new Map<string, ActivityRow>();
  let iteration: ActivityRow | undefined;
  let runIndex = 0;
  for (const [index, event] of events.entries()) {
    const p = event.payload;
    if (
      event.type === 'tool.started' ||
      event.type === 'tool.executed' ||
      event.type === 'tool.progress'
    ) {
      const id = typeof p['id'] === 'string' ? p['id'] : `missing-${index}`;
      const agent = typeof p['agentId'] === 'string' ? p['agentId'] : '';
      const key = `${agent}:${id}`;
      let row = tools.get(key);
      if (!row) {
        row = {
          id: `tool:${runIndex}:${key}`,
          kind: 'tool',
          title: String(p['name'] ?? 'Tool'),
          status: 'running',
          progress: [],
          files: [],
          sage: [],
        };
        rows.push(row);
        tools.set(key, row);
      }
      if (typeof p['name'] === 'string') row.title = p['name'];
      if (p['input'] !== undefined) row.input = p['input'];
      if (typeof p['agentName'] === 'string') row.agent = p['agentName'];
      else if (agent) row.agent = agent;
      if (Array.isArray(p['fileTargets'])) {
        for (const target of p['fileTargets']) {
          const file = record(target);
          if (
            typeof file['filePath'] === 'string' &&
            !row.files.some((entry) => entry.path === file['filePath'])
          )
            row.files.push({
              path: file['filePath'],
              operation: String(file['operation'] ?? 'open'),
            });
        }
      }
      if (event.type === 'tool.progress') {
        const progress = record(p['event']);
        const text = contentText(progress['text']);
        if (text) row.progress.push(text);
        if (
          typeof progress['path'] === 'string' &&
          !row.files.some((entry) => entry.path === progress['path'])
        )
          row.files.push({
            path: progress['path'],
            operation: String(progress['operation'] ?? 'open'),
          });
      }
      if (event.type === 'tool.executed') {
        row.status = p['ok'] === false ? 'failed' : p['ok'] === true ? 'done' : 'info';
        row.output = contentText(p['output']);
        if (typeof p['durationMs'] === 'number') row.durationMs = p['durationMs'];
        if (typeof p['outputBytes'] === 'number') row.outputBytes = p['outputBytes'];
        if (Array.isArray(p['sage']))
          row.sage = p['sage'].filter((item): item is string => typeof item === 'string');
      }
    } else if (event.type === 'provider.thinking_delta') {
      const text = contentText(p['text']);
      if (!text) continue;
      const previous = rows.at(-1);
      if (previous?.kind === 'reasoning') previous.output = (previous.output ?? '') + text;
      else
        rows.push({
          id: `thinking:${index}`,
          kind: 'reasoning',
          title: 'Thinking',
          status: 'info',
          output: text,
          progress: [],
          files: [],
          sage: [],
        });
    } else if (event.type === 'provider.retry') {
      rows.push({
        id: `retry:${index}`,
        kind: 'retry',
        title: `${String(p['providerId'] ?? 'Provider')} retry ${String(p['attempt'] ?? '')}`,
        status: 'info',
        output: String(p['description'] ?? ''),
        ...(typeof p['delayMs'] === 'number' ? { durationMs: p['delayMs'] } : {}),
        progress: [],
        files: [],
        sage: [],
      });
    } else if (event.type === 'iteration.started') {
      iteration = {
        id: `iteration:${index}`,
        kind: 'run',
        title: `Iteration ${String(p['index'] ?? '')}`,
        status: 'running',
        progress: [],
        files: [],
        sage: [],
      };
      rows.push(iteration);
    } else if (event.type === 'iteration.completed') {
      if (iteration) iteration.status = 'done';
      iteration = undefined;
    } else if (event.type === 'run.result') {
      const status =
        p['status'] === 'done'
          ? 'done'
          : p['status'] === 'aborted'
            ? 'aborted'
            : p['status'] === 'failed'
              ? 'failed'
              : 'info';
      if (iteration?.status === 'running') iteration.status = status;
      iteration = undefined;
      const message = record(p['error'])['message'];
      rows.push({
        id: `result:${index}`,
        kind: 'run',
        title:
          p['status'] === 'max_iterations'
            ? 'Iteration limit reached'
            : status === 'done'
              ? 'Run completed'
              : status === 'aborted'
                ? 'Run stopped'
                : 'Run ended',
        status,
        ...(typeof message === 'string' ? { output: message } : {}),
        progress: [],
        files: [],
        sage: [],
      });
      tools.clear();
      runIndex++;
    }
  }
  return rows;
}
