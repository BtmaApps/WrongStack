import type { SessionScopedPayload } from './protocol-core.js';
export type ClientMessageWorkflows =
  | {
      type: 'goal.start';
      payload: {
        title: string;
        goalId?: string | undefined;
        sessionId?: string | undefined;
        phases?: unknown[] | undefined;
        autonomous?: boolean | undefined;
        /** Per-run override of git-worktree isolation. Omitted → env default
         *  (WRONGSTACK_GOAL_WORKTREES). false → run on the current branch. */
        worktrees?: boolean | undefined;
        /** Split the goal into multiple kanban boards (one per phase). */
        multiBoard?: boolean | undefined;
        /** Require verification (typecheck/lint/test) for each task. */
        verifyTasks?: boolean | undefined;
        /** Enable chimera auto-review for this goal run. */
        chimeraReview?: boolean | undefined;
      };
    }
  | { type: 'goal.assess'; payload: { goal: string; seq?: number | undefined } }
  | { type: 'goal.pause'; payload: { goalId?: string | undefined } }
  | { type: 'goal.resume'; payload: { graphId?: string | undefined; goalId?: string | undefined } }
  | { type: 'goal.stop'; payload: { goalId?: string | undefined } }
  | { type: 'goal.clear'; payload?: { goalId?: string | undefined } }
  | { type: 'goal.revert'; payload?: { goalId?: string | undefined } }
  | { type: 'goal.status'; payload?: { goalId?: string | undefined } }
  | { type: 'goal.save'; payload?: { goalId?: string | undefined } }
  | { type: 'goal.list'; payload?: Record<string, never> }
  | {
      type: 'goal.load';
      payload: {
        graphId?: string | undefined;
        goalId?: string | undefined;
        query?: string | undefined;
        resume?: boolean | undefined;
      };
    }
  | { type: 'goal.selectPhase'; payload: { phaseId: string; goalId?: string | undefined } }
  | {
      type: 'goal.taskStatus';
      payload: { taskId: string; status: string; goalId?: string | undefined };
    }
  | {
      type: 'goal.moveTask';
      payload: { taskId: string; toPhaseId: string; goalId?: string | undefined };
    }
  | {
      type: 'goal.assignTask';
      payload: {
        taskId: string;
        agentId?: string | undefined;
        agentName?: string | undefined;
        goalId?: string | undefined;
      };
    }
  | {
      type: 'goal.addTask';
      payload: {
        phaseId: string;
        goalId?: string | undefined;
        title: string;
        description?: string | undefined;
        type?: string | undefined;
        priority?: string | undefined;
      };
    }
  | { type: 'goal.retryTask'; payload: { taskId: string; goalId?: string | undefined } }
  | { type: 'goal.runTask'; payload: { taskId: string; goalId?: string | undefined } }
  | { type: 'sdd.board.get'; payload?: Record<string, never> }
  | { type: 'sdd.board.list'; payload?: Record<string, never> }
  | { type: 'sdd.board.pause'; payload?: { runId?: string | undefined } }
  | { type: 'sdd.board.resume'; payload?: { runId?: string | undefined } }
  | { type: 'sdd.board.stop'; payload?: { runId?: string | undefined } }
  | { type: 'sdd.board.retry'; payload: { taskId: string; runId?: string | undefined } }
  | { type: 'sdd.board.retry_all_failed'; payload?: { runId?: string | undefined } }
  | {
      type: 'sdd.board.reassign';
      payload: { taskId: string; agentName: string; runId?: string | undefined };
    }
  | {
      type: 'sdd.board.set_task_model';
      payload: {
        taskId: string;
        model?: string | undefined;
        provider?: string | undefined;
        runId?: string | undefined;
      };
    }
  | {
      type: 'sdd.board.set_task_fallbacks';
      payload: {
        taskId: string;
        fallbackModels?: string[] | undefined;
        runId?: string | undefined;
      };
    }
  | {
      type: 'sdd.board.set_task_verification';
      payload: {
        taskId: string;
        verificationCommand?: string | undefined;
        runId?: string | undefined;
      };
    }
  | { type: 'sdd.board.cancel_task'; payload: { taskId: string; runId?: string | undefined } }
  | { type: 'sdd.board.delete_task'; payload: { taskId: string; runId?: string | undefined } }
  | {
      type: 'sdd.board.split_task';
      payload: {
        taskId: string;
        subtasks: Array<{ title: string; description: string }>;
        runId?: string | undefined;
      };
    }
  | { type: 'sdd.board.cleanup_worktrees'; payload?: { runId?: string | undefined } }
  | { type: 'sdd.board.rollback'; payload?: { runId?: string | undefined } }
  | {
      type: 'sdd.board.destroy';
      payload?: { runId?: string | undefined; revertMerged?: boolean | undefined };
    }
  | { type: 'worktree.scan'; payload?: Record<string, never> }
  | { type: 'worktree.cleanup'; payload?: Record<string, never> }
  | { type: 'worktree.remove'; payload: { dir?: string | undefined; branch?: string | undefined } }
  | { type: 'worktree.merge'; payload: { branch: string } }
  | { type: 'worktree.diff'; payload: { dir: string; baseBranch?: string | undefined } }
  | { type: 'sdd.spec.start'; payload: { goal: string; force?: boolean | undefined } }
  | { type: 'sdd.spec.message'; payload: { text: string } }
  | { type: 'sdd.spec.approve'; payload?: Record<string, never> }
  | { type: 'sdd.spec.rewind'; payload?: { targetPhase?: string | undefined } }
  | { type: 'sdd.spec.get'; payload?: Record<string, never> }
  | { type: 'sdd.spec.discard'; payload?: Record<string, never> }
  | {
      type: 'sdd.run.start';
      payload?: {
        parallelSlots?: number | undefined;
        model?: string | undefined;
        provider?: string | undefined;
        fallbackModels?: string[] | undefined;
        /** Per-run override of git-worktree isolation. Omitted → env default
         *  (WRONGSTACK_SDD_WORKTREES). false → run on the current branch. */
        worktrees?: boolean | undefined;
        /** Split non-atomic tasks before dispatch (planning-time decompose). */
        planDecompose?: boolean | undefined;
      } & SessionScopedPayload;
    }
  | {
      type: 'sdd.run.from_graph';
      payload: {
        graphId: string;
        parallelSlots?: number | undefined;
        model?: string | undefined;
        provider?: string | undefined;
        fallbackModels?: string[] | undefined;
        worktrees?: boolean | undefined;
        planDecompose?: boolean | undefined;
      } & SessionScopedPayload;
    }
  | {
      type: 'sdd.run.from_spec';
      payload: {
        specId: string;
        parallelSlots?: number | undefined;
        model?: string | undefined;
        provider?: string | undefined;
        fallbackModels?: string[] | undefined;
        worktrees?: boolean | undefined;
        planDecompose?: boolean | undefined;
      } & SessionScopedPayload;
    }
  | { type: 'plan.get'; payload?: SessionScopedPayload }
  | {
      type: 'plan.item.update';
      payload: { target: string; status: 'open' | 'in_progress' | 'done' } & SessionScopedPayload;
    }
  | { type: 'goal.get' }
  | { type: 'goal-state.get' }
  | { type: 'goal-state.set'; payload: { goal: string } & SessionScopedPayload }
  | { type: 'goal-state.refine'; payload?: SessionScopedPayload }
  | { type: 'goal-state.pause'; payload?: Record<string, never> }
  | { type: 'goal-state.resume'; payload?: Record<string, never> }
  | { type: 'goal-state.clear'; payload?: Record<string, never> }
  | { type: 'autonomy.switch'; payload: { mode: string } & SessionScopedPayload }
  | { type: 'plan.template_use'; payload: { template: string } };
