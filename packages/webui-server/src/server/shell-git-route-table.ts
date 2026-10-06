import {
  handleGitChanges,
  handleGitCommit,
  handleGitCommitDetail,
  handleGitCommitFileDiff,
  handleGitDiff,
  handleGitDiscard,
  handleGitHistory,
  handleGitInfo,
  handleGitStage,
  handleGitUnstage,
} from './git-handlers.js';
import { authorizeWebUIAction } from './privileged-actions.js';
import type { WebuiDeps, WebuiMutableState } from './route-contracts.js';
import type { ShellGitRouteHandlers } from './shell-git-routes.js';
import {
  handleShellOpen,
  normalizeShellOpenTarget,
  type ShellOpenResult,
  type ShellOpenTarget,
} from './shell-open.js';
import {
  validateGitCommitPayload,
  validateGitDiffPayload,
  validateGitDiscardPayload,
  validateGitStagePayload,
  validateGitUnstagePayload,
  validateShellOpenPayload,
} from './ws-payload-validation.js';
import { sendResult } from './ws-utils.js';

/**
 * Git panel + "open in shell" routes for `buildRoutes`. Every call reads the
 * live project root; shell open goes past the trust boundary.
 */
export function createShellGitRoutes(
  state: WebuiMutableState,
  deps: WebuiDeps,
): ShellGitRouteHandlers {
  return {
    gitInfo: async (ws) => {
      await handleGitInfo(ws, state.getProjectRoot());
    },
    gitChanges: async (ws) => {
      await handleGitChanges(ws, state.getProjectRoot());
    },
    gitHistory: async (ws, msg) => {
      const payload = msg.payload as { ref?: unknown; limit?: unknown; skip?: unknown } | undefined;
      await handleGitHistory(ws, state.getProjectRoot(), {
        ref: typeof payload?.ref === 'string' ? payload.ref : undefined,
        limit: typeof payload?.limit === 'number' ? payload.limit : undefined,
        skip: typeof payload?.skip === 'number' ? payload.skip : undefined,
      });
    },
    gitCommitDetail: async (ws, msg) => {
      const payload = msg.payload as { hash?: unknown } | undefined;
      await handleGitCommitDetail(
        ws,
        state.getProjectRoot(),
        typeof payload?.hash === 'string' ? payload.hash : '',
      );
    },
    gitCommitFileDiff: async (ws, msg) => {
      const payload = msg.payload as
        | { hash?: unknown; path?: unknown; previousPath?: unknown }
        | undefined;
      await handleGitCommitFileDiff(ws, state.getProjectRoot(), {
        hash: typeof payload?.hash === 'string' ? payload.hash : '',
        path: typeof payload?.path === 'string' ? payload.path : '',
        previousPath: typeof payload?.previousPath === 'string' ? payload.previousPath : undefined,
      });
    },
    gitDiff: async (ws, msg) => {
      const parsed = validateGitDiffPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitDiff(ws, state.getProjectRoot(), parsed.value.path);
    },
    gitStage: async (ws, msg) => {
      const parsed = validateGitStagePayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitStage(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitUnstage: async (ws, msg) => {
      const parsed = validateGitUnstagePayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitUnstage(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitDiscard: async (ws, msg) => {
      const parsed = validateGitDiscardPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitDiscard(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitCommit: async (ws, msg) => {
      const parsed = validateGitCommitPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitCommit(ws, state.getProjectRoot(), parsed.value.message);
    },
    shellOpen: async (ws, msg) => {
      const parsed = validateShellOpenPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      // Normalize the wire-format target ('file'|'terminal') to the
      // handler contract ('terminal'|'file-manager').
      const normalizedTarget: ShellOpenTarget = normalizeShellOpenTarget(parsed.value.target);
      const authorization = await authorizeWebUIAction(
        deps.trustBoundary,
        {
          capability: normalizedTarget === 'terminal' ? 'process.spawn' : 'filesystem.open-native',
          subject: {
            kind: 'path',
            id: parsed.value.path,
            attributes: { target: normalizedTarget },
          },
          risk: 'elevated',
          cwd: state.getProjectRoot(),
          metadata: { transport: 'websocket' },
        },
        deps.logger,
      );
      if (!authorization.allowed) {
        sendResult(ws, false, `Shell action denied: ${authorization.reason}`);
        return;
      }
      const result: ShellOpenResult = await handleShellOpen(
        { path: parsed.value.path, target: normalizedTarget },
        deps.logger,
        { projectRoot: state.getProjectRoot() },
      );
      sendResult(ws, result.success, result.message);
    },
  };
}
