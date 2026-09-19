export type KanbanCheckType =
  | 'manual'
  | 'auto'
  | 'agent'
  | 'test'
  | 'review'
  | 'command'
  | 'file_exists'
  | 'file_matches'
  | 'git_diff'
  | 'metric'
  | 'council';

export type KanbanAgentRunStatus =
  | 'assigned'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type KanbanRetryPolicy = 'off' | 'incremental' | 'exponential';
