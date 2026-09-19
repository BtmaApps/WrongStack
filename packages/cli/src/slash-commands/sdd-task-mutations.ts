import { expectDefined } from '@wrongstack/core/utils';
import { sddState } from '../services/sdd/state.js';
import { matchTaskNode } from '../services/sdd/task-manager.js';

export function executeSddTaskMutation(cmd: string, restJoined: string): { message: string } {
  switch (cmd) {
    case 'done':
    case 'complete': {
      const doneTracker = sddState.getTaskTracker();
      if (!doneTracker) {
        return { message: 'No tasks to complete.' };
      }

      if (!restJoined) {
        return { message: 'Usage: /sdd done <task title or number>' };
      }

      const nodes = doneTracker.getAllNodes({ status: ['pending', 'in_progress'] });
      const match = matchTaskNode(nodes, restJoined);
      if (!match) {
        return { message: `No pending task matching "${restJoined}".` };
      }
      doneTracker.updateNodeStatus(match.id, 'completed');

      const remaining = doneTracker.getProgress();
      return {
        message: `✅ Task marked done! (${remaining.completed}/${remaining.total} — ${remaining.percentComplete}%)`,
      };
    }

    case 'skip': {
      const skipTracker = sddState.getTaskTracker();
      if (!skipTracker) return { message: 'No tasks to skip.' };
      if (!restJoined) return { message: 'Usage: /sdd skip <task title or number>' };

      const nodes = skipTracker.getAllNodes({ status: ['pending', 'in_progress', 'blocked'] });
      const match = matchTaskNode(nodes, restJoined);
      if (!match) return { message: `No task matching "${restJoined}".` };
      skipTracker.updateNodeStatus(match.id, 'pending');

      const progress = skipTracker.getProgress();
      return {
        message: `⏭ Task skipped — moved to pending. (${progress.completed}/${progress.total} — ${progress.percentComplete}%)`,
      };
    }

    case 'fail': {
      const failTracker = sddState.getTaskTracker();
      if (!failTracker) return { message: 'No tasks to fail.' };
      if (!restJoined) return { message: 'Usage: /sdd fail <task title or number>' };

      const nodes = failTracker.getAllNodes({ status: ['pending', 'in_progress'] });
      const match = matchTaskNode(nodes, restJoined);
      if (!match) return { message: `No pending/in-progress task matching "${restJoined}".` };
      failTracker.updateNodeStatus(match.id, 'failed');

      const progress = failTracker.getProgress();
      return {
        message: `❌ Task marked as failed. (${progress.failed} failed · ${progress.completed}/${progress.total} done)`,
      };
    }

    case 'review': {
      const reviewTracker = sddState.getTaskTracker();
      if (!reviewTracker) return { message: 'No tasks to review.' };
      if (!restJoined) return { message: 'Usage: /sdd review <task title or number>' };

      // Number matches the same sorted order shown by /sdd tasks.
      const sorted = [...reviewTracker.getAllNodes()].sort((a, b) => {
        const order: Record<string, number> = {
          in_progress: 0,
          pending: 1,
          review: 2,
          blocked: 3,
          failed: 4,
          completed: 5,
        };
        return (order[a.status] ?? 6) - (order[b.status] ?? 6);
      });
      const match = matchTaskNode(sorted, restJoined);
      if (!match) return { message: `No task matching "${restJoined}".` };
      reviewTracker.updateNodeStatus(match.id, 'review');

      const progress = reviewTracker.getProgress();
      return {
        message: `👁 Task sent to review. (${progress.review} in review)`,
      };
    }

    case 'edit': {
      const editTracker = sddState.getTaskTracker();
      if (!editTracker) return { message: 'No tasks to edit.' };
      if (!restJoined) return { message: 'Usage: /sdd edit <N> <new title or description>' };

      // Parse: /sdd edit <N> <new content>
      const parts = restJoined.split(/\s+/);
      const num = Number(parts[0]);
      if (Number.isNaN(num)) return { message: 'Usage: /sdd edit <N> <new title or description>' };

      const nodes = editTracker.getAllNodes();
      if (num < 1 || num > nodes.length) return { message: `Task #${num} not found.` };

      const node = nodes[num - 1];
      if (!node) return { message: `Task #${num} not found.` };

      const newContent = parts.slice(1).join(' ');
      if (!newContent) return { message: 'Provide new title or description content.' };

      // Update title if content looks like a title (short) or description if longer
      if (newContent.length < 60) {
        editTracker.updateNode(node.id, { title: newContent });
      } else {
        editTracker.updateNode(node.id, { description: newContent });
      }

      return {
        message: `✏️ Task #${num} updated: "${newContent.slice(0, 50)}${newContent.length > 50 ? '…' : ''}"`,
      };
    }

    case 'undo': {
      const undoTracker = sddState.getTaskTracker();
      if (!undoTracker) {
        return { message: 'No tasks to undo.' };
      }
      // Find the most recently completed task from transitions
      const completed = undoTracker.getAllNodes({ status: ['completed'] });
      if (completed.length === 0) {
        return { message: 'No completed tasks to undo.' };
      }
      // Pop the last completed node (most recently completed)
      const last = expectDefined(completed[completed.length - 1]);
      undoTracker.updateNodeStatus(last.id, 'pending');
      const progress = undoTracker.getProgress();
      return {
        message: `↩ Undo: "${last.title}" back to pending. (${progress.completed}/${progress.total} — ${progress.percentComplete}%)`,
      };
    }
    default:
      throw new Error('Unsupported action: ' + cmd);
  }
}
