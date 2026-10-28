export interface ActionField {
  key: string;
  label: string;
  kind?: 'text' | 'long' | 'number' | 'boolean' | 'lines' | 'csv' | 'select';
  required?: boolean;
  options?: string[];
  value?: string | number | boolean;
}
export interface FeatureAction {
  id: string;
  module: string;
  label: string;
  description?: string;
  type?: string;
  resource?: string;
  method?: string;
  fields: ActionField[];
  reply?: string;
  result?: string;
  payload?: (values: Record<string, unknown>) => Record<string, unknown>;
}
const text = (key: string, label: string, required = true): ActionField => ({
  key,
  label,
  required,
});
const long = (key: string, label: string): ActionField => ({
  key,
  label,
  required: true,
  kind: 'long',
});
const choice = (key: string, label: string, options: string[]): ActionField => ({
  key,
  label,
  kind: 'select',
  options,
  value: options[0] ?? '',
});
const flag = (key: string, label: string, value = false): ActionField => ({
  key,
  label,
  kind: 'boolean',
  value,
});
const number = (key: string, label: string, value: number): ActionField => ({
  key,
  label,
  kind: 'number',
  value,
});
const ws = (
  module: string,
  type: string,
  label: string,
  fields: ActionField[] = [],
  result?: string,
): FeatureAction => ({ id: type, module, type, label, fields, result: result ?? type });
export const featureActions: FeatureAction[] = [
  ws('provider-health', 'provider.quota.refresh', 'Refresh account quota', [], 'provider.quota'),
  ws(
    'provider-health',
    'provider.status.get',
    'Refresh provider status',
    [],
    'provider.status.snapshot',
  ),
  ws(
    'files',
    'files.read',
    'Read a project file',
    [text('filePath', 'Project file')],
    'files.read',
  ),
  ws(
    'files',
    'files.write',
    'Save a project file',
    [text('filePath', 'Project file'), long('content', 'File content')],
    'files.written',
  ),
  ws(
    'goals',
    'goal-state.set',
    'Set project mission',
    [long('goal', 'Project mission')],
    'goal-state.updated',
  ),
  ...['pause', 'resume', 'clear', 'refine'].map((action) =>
    ws(
      'goals',
      `goal-state.${action}`,
      `${action[0]!.toUpperCase() + action.slice(1)} mission`,
      [],
      'goal-state.updated',
    ),
  ),
  {
    ...ws(
      'goals',
      'goal.start',
      'Start a new goal',
      [
        long('goal', 'Goal'),
        text('goalId', 'Goal ID (optional)', false),
        flag('multiBoard', 'Use multiple boards'),
        flag('verifyTasks', 'Verify tasks', true),
        flag('chimeraReview', 'Run Chimera reviews'),
        flag('worktrees', 'Use isolated worktrees', true),
      ],
      'goal.state',
    ),
    payload: (values) => ({ ...values, goalId: values['goalId'] || crypto.randomUUID() }),
  },
  ...['pause', 'resume', 'stop', 'save', 'status'].map((action) =>
    ws(
      'goals',
      `goal.${action}`,
      `${action[0]!.toUpperCase() + action.slice(1)} goal`,
      [text('goalId', 'Goal')],
      action === 'pause'
        ? 'goal.paused'
        : action === 'resume'
          ? 'goal.resumed'
          : action === 'stop'
            ? 'goal.stopped'
            : action === 'save'
              ? 'goal.saved'
              : 'goal.state',
    ),
  ),
  ws('goals', 'goal.load', 'Load a saved goal', [text('graphId', 'Saved graph')], 'goal.state'),
  ws(
    'goals',
    'goal.addTask',
    'Add a goal task',
    [
      text('goalId', 'Goal'),
      text('phaseId', 'Phase'),
      text('title', 'Task title'),
      long('description', 'Task description'),
    ],
    'goal.state',
  ),
  ws(
    'goals',
    'goal.assignTask',
    'Assign a goal task',
    [
      text('goalId', 'Goal'),
      text('taskId', 'Task'),
      text('agentId', 'Agent'),
      text('agentName', 'Agent name', false),
    ],
    'goal.state',
  ),
  ws(
    'goals',
    'goal.moveTask',
    'Move a goal task',
    [text('goalId', 'Goal'), text('taskId', 'Task'), text('toPhaseId', 'Destination phase')],
    'goal.state',
  ),
  ws(
    'goals',
    'goal.retryTask',
    'Retry a goal task',
    [text('goalId', 'Goal'), text('taskId', 'Task')],
    'goal.state',
  ),
  ws(
    'sdd',
    'sdd.spec.start',
    'Build a specification',
    [long('goal', 'What should this project deliver?')],
    'sdd.spec.snapshot',
  ),
  ws(
    'sdd',
    'sdd.spec.message',
    'Continue the specification interview',
    [long('text', 'Your answer or revision')],
    'sdd.spec.snapshot',
  ),
  ws('sdd', 'sdd.spec.approve', 'Approve the current specification', [], 'sdd.spec.snapshot'),
  ws('sdd', 'sdd.spec.discard', 'Discard the current draft', [], 'sdd.spec.snapshot'),
  ws(
    'sdd',
    'sdd.run.start',
    'Start the SDD run',
    [
      number('parallelSlots', 'Parallel slots', 4),
      text('provider', 'Provider (optional)', false),
      text('model', 'Model (optional)', false),
      flag('worktrees', 'Use isolated worktrees', true),
    ],
    'sdd.run.started',
  ),
  ws(
    'sdd',
    'sdd.run.from_spec',
    'Run a saved specification',
    [
      text('specId', 'Specification'),
      number('parallelSlots', 'Parallel slots', 4),
      flag('worktrees', 'Use isolated worktrees', true),
    ],
    'sdd.run.started',
  ),
  ws(
    'sdd',
    'sdd.run.from_graph',
    'Run a saved task graph',
    [
      text('graphId', 'Task graph'),
      number('parallelSlots', 'Parallel slots', 4),
      flag('worktrees', 'Use isolated worktrees', true),
    ],
    'sdd.run.started',
  ),
  ...['get', 'pause', 'resume', 'stop', 'retry_all_failed'].map((action) =>
    ws(
      'sdd',
      `sdd.board.${action}`,
      `${action === 'get' ? 'Open' : action === 'retry_all_failed' ? 'Retry failed tasks' : action[0]!.toUpperCase() + action.slice(1)} SDD board`,
      [text('runId', 'Run')],
      'sdd.board.snapshot',
    ),
  ),
  ws(
    'sdd',
    'sdd.board.set_task_model',
    'Set task model',
    [
      text('runId', 'Run'),
      text('taskId', 'Task'),
      text('provider', 'Provider'),
      text('model', 'Model'),
    ],
    'sdd.board.snapshot',
  ),
  ws(
    'sdd',
    'sdd.board.retry',
    'Retry SDD task',
    [text('runId', 'Run'), text('taskId', 'Task')],
    'sdd.board.snapshot',
  ),
  ws(
    'sdd',
    'sdd.board.cancel_task',
    'Cancel SDD task',
    [text('runId', 'Run'), text('taskId', 'Task')],
    'sdd.board.snapshot',
  ),
  ws('agents', 'agent-roster.read-customization', 'Read agent configuration', [
    text('role', 'Agent role'),
  ]),
  ws('agents', 'agent-roster.update-identity', 'Save agent identity', [
    text('role', 'Agent role'),
    long('content', 'Identity instructions'),
  ]),
  ws('agents', 'agent-roster.create-generic', 'Create an agent', [
    text('name', 'Agent name'),
    text('role', 'Agent role'),
    text('baseRole', 'Base role', false),
  ]),
  ws('agents', 'agent-roster.read-learned', 'Read agent learning', [text('role', 'Agent role')]),
  ws('agents', 'agent-roster.update-learned', 'Save agent learning', [
    text('role', 'Agent role'),
    long('content', 'Learned instructions'),
  ]),
  ws(
    'connections',
    'mcp.add',
    'Add a local MCP server',
    [
      text('name', 'Server name'),
      text('command', 'Executable'),
      { key: 'args', label: 'Arguments (one per line)', kind: 'lines' },
      flag('enabled', 'Enable server'),
    ],
    'mcp.operation_result',
  ),
  ws(
    'connections',
    'mcp.add',
    'Add a remote MCP server',
    [text('name', 'Server name'), text('url', 'Server URL'), flag('enabled', 'Enable server')],
    'mcp.operation_result',
  ),
  ...[
    'enable',
    'disable',
    'restart',
    'sleep',
    'wake',
    'remove',
    'resources',
    'prompts',
    'auth.status',
    'auth.login',
    'auth.logout',
  ].map((action) =>
    ws(
      'connections',
      `mcp.${action}`,
      `${action.replace('auth.', 'Authentication: ')} server`,
      [text('name', 'Server')],
      action.startsWith('auth.')
        ? action === 'auth.login'
          ? 'mcp.auth.pending'
          : action === 'auth.logout'
            ? 'mcp.operation_result'
            : 'mcp.auth.status'
        : action === 'resources'
          ? 'mcp.resources'
          : action === 'prompts'
            ? 'mcp.prompts'
            : 'mcp.operation_result',
    ),
  ),
  ws(
    'connections',
    'mcp.resource.read',
    'Read an MCP resource',
    [text('name', 'Server'), text('uri', 'Resource URI')],
    'mcp.content.selected',
  ),
  ws('connections', 'mcp.tasks.list', 'List MCP tasks', [text('name', 'Server')]),
  ws('tools', 'tool.enable', 'Enable a tool', [text('name', 'Tool name')], 'tool.enabled'),
  ws('tools', 'tool.disable', 'Disable a tool', [text('name', 'Tool name')], 'tool.disabled'),
  {
    ...ws(
      'prompts',
      'prompts.create',
      'Create a prompt',
      [
        text('title', 'Prompt title'),
        long('content', 'Prompt content'),
        { key: 'tags', label: 'Tags', kind: 'csv' },
      ],
      'prompts.created',
    ),
    reply: 'prompts.created',
  },
  ws('prompts', 'prompts.search', 'Search prompts', [text('query', 'Search')], 'prompts.search'),
  ws('prompts', 'prompts.content', 'Read a prompt', [text('slug', 'Prompt')], 'prompts.content'),
  ws(
    'prompts',
    'prompts.favorite',
    'Set prompt favorite',
    [text('slug', 'Prompt'), flag('favorite', 'Favorite', true)],
    'prompts.favorite',
  ),
  ws(
    'skills',
    'skills.create',
    'Create a skill',
    [
      text('name', 'Skill name'),
      long('description', 'Description and trigger'),
      choice('scope', 'Scope', ['project', 'global']),
    ],
    'skills.created',
  ),
  ws(
    'skills',
    'skills.edit',
    'Save a skill document',
    [text('name', 'Skill name'), long('body', 'Complete SKILL.md document')],
    'skills.edited',
  ),
  ws('skills', 'skills.update', 'Update installed skills', [], 'skills.updated'),
  ws('skills', 'skills.export', 'Export a skill', [text('name', 'Skill name')], 'skills.exported'),
  ws(
    'design',
    'design.use',
    'Use a design kit',
    [text('kit', 'Design kit'), text('stack', 'Stack (optional)', false)],
    'design.use',
  ),
  ws('design', 'design.verify', 'Verify project design', [], 'design.verify'),
  ws(
    'memory',
    'memory.sage.graph',
    'Explore the memory graph',
    [text('query', 'Search'), number('maxDepth', 'Graph depth', 2)],
    'memory.sage.graph',
  ),
  ws(
    'memory',
    'memory.sage.forFile',
    'Find memories for a file',
    [text('filePath', 'Project file')],
    'memory.sage.forFile',
  ),
  ws('memory', 'memory.sage.doctor', 'Inspect memory health', [], 'memory.sage.doctor'),
  ws('context', 'context.compact', 'Compact conversation context', [], 'context.compacted'),
  ws('context', 'context.repair', 'Repair conversation context', [], 'context.repaired'),
  ws(
    'context',
    'context.mode.switch',
    'Switch context mode',
    [text('id', 'Context mode')],
    'context.mode.changed',
  ),
  ws(
    'processes',
    'process.output',
    'Read process output',
    [number('pid', 'Process ID', 0), number('lines', 'Lines', 40)],
    'process.output',
  ),
  ws(
    'processes',
    'process.kill',
    'Stop a process',
    [number('pid', 'Process ID', 0)],
    'key.operation_result',
  ),
  {
    ...ws(
      'chronicle',
      'chronicle.query',
      'Search Chronicle',
      [text('query', 'Search')],
      'chronicle.query_result',
    ),
    payload: (values) => ({ query: { text: values['query'], limit: 100 } }),
  },
  ws(
    'chronicle',
    'chronicle.metrics',
    'Read Chronicle metrics',
    [choice('view', 'Metrics', ['summary', 'providers', 'tasks', 'files'])],
    'chronicle.metrics_result',
  ),
  {
    id: 'techstack.inventory',
    module: 'techstack',
    label: 'Inventory project dependencies',
    resource: '/api/techstack/inventory',
    method: 'POST',
    fields: [],
  },
  {
    id: 'techstack.analyze',
    module: 'techstack',
    label: 'Analyze dependencies',
    description: 'Uses the selected engine provider to research this project.',
    resource: '/api/techstack/analyze',
    method: 'POST',
    fields: [],
  },
  {
    id: 'deadcode.scan',
    module: 'deadcode',
    label: 'Scan for dead code',
    resource: '/api/deadcode/scan',
    method: 'POST',
    fields: [
      { key: 'paths', label: 'Paths (optional)', kind: 'csv' },
      flag('includePublicApi', 'Include public API findings'),
    ],
  },
];
// Labels distinguish different forms that intentionally use the same server operation.
for (const action of featureActions) action.id = `${action.id}:${action.label}`;
export function actionPayload(
  action: FeatureAction,
  values: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of action.fields) {
    const raw = values[field.key];
    const value = (typeof raw === 'string' && !raw.trim() ? undefined : raw) ?? field.value ?? '';
    if (field.required && typeof value === 'string' && !value.trim())
      throw new Error(`${field.label} is required.`);
    if (field.kind === 'number') {
      const num = typeof value === 'string' && !value.trim() ? Number.NaN : Number(value);
      if (!Number.isFinite(num)) throw new Error(`${field.label} must be a number.`);
      payload[field.key] = num;
    } else if (field.kind === 'boolean') payload[field.key] = value === true;
    else if (field.kind === 'csv' || field.kind === 'lines')
      payload[field.key] = String(value)
        .split(field.kind === 'csv' ? ',' : /\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    else if (String(value).trim()) payload[field.key] = String(value);
  }
  return action.payload?.(payload) ?? payload;
}
