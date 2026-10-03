import type { EmbeddedMessageRouterDeps } from './embedded-message-router-types.js';
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
import type { ShellGitRouteHandlers } from './shell-git-routes.js';
import { handleShellOpen, normalizeShellOpenTarget, type ShellOpenTarget } from './shell-open.js';

export function createEmbeddedShellGitRoutes(
  deps: EmbeddedMessageRouterDeps,
  projectRoot: () => string,
) {
  const { sendResult } = deps;

  const shellGit: ShellGitRouteHandlers = {
    gitInfo: (ws) => handleGitInfo(ws, projectRoot()),
    gitChanges: (ws) => handleGitChanges(ws, projectRoot()),
    gitHistory: (ws, msg) => {
      const payload = msg.payload as { ref?: unknown; limit?: unknown; skip?: unknown } | undefined;
      return handleGitHistory(ws, projectRoot(), {
        ref: typeof payload?.ref === 'string' ? payload.ref : undefined,
        limit: typeof payload?.limit === 'number' ? payload.limit : undefined,
        skip: typeof payload?.skip === 'number' ? payload.skip : undefined,
      });
    },
    gitCommitDetail: (ws, msg) => {
      const hash = (msg.payload as { hash?: unknown } | undefined)?.hash;
      return handleGitCommitDetail(ws, projectRoot(), typeof hash === 'string' ? hash : '');
    },
    gitCommitFileDiff: (ws, msg) => {
      const payload = msg.payload as
        | { hash?: unknown; path?: unknown; previousPath?: unknown }
        | undefined;
      return handleGitCommitFileDiff(ws, projectRoot(), {
        hash: typeof payload?.hash === 'string' ? payload.hash : '',
        path: typeof payload?.path === 'string' ? payload.path : '',
        previousPath: typeof payload?.previousPath === 'string' ? payload.previousPath : undefined,
      });
    },
    gitDiff: (ws, msg) =>
      handleGitDiff(ws, projectRoot(), (msg.payload as { path?: string } | undefined)?.path ?? ''),
    gitStage: (ws, msg) => {
      const p = msg.payload as { paths?: string[]; path?: string } | undefined;
      const list = p?.paths ?? (p?.path ? [p.path] : []);
      return handleGitStage(ws, projectRoot(), list);
    },
    gitUnstage: (ws, msg) => {
      const p = msg.payload as { paths?: string[]; path?: string } | undefined;
      const list = p?.paths ?? (p?.path ? [p.path] : []);
      return handleGitUnstage(ws, projectRoot(), list);
    },
    gitDiscard: (ws, msg) => {
      const p = msg.payload as { paths?: string[]; path?: string } | undefined;
      const list = p?.paths ?? (p?.path ? [p.path] : []);
      return handleGitDiscard(ws, projectRoot(), list);
    },
    gitCommit: (ws, msg) => {
      const message = (msg.payload as { message?: string } | undefined)?.message ?? '';
      return handleGitCommit(ws, projectRoot(), message);
    },
    shellOpen: async (ws, msg) => {
      const payload = msg.payload as { path?: unknown; target?: unknown } | undefined;
      if (typeof payload?.path !== 'string')
        return sendResult(ws, false, 'shell.open path must be a string');
      const targets = ['file', 'file-manager', 'terminal'] as const;
      if (payload.target !== undefined && !targets.includes(payload.target as never)) {
        return sendResult(
          ws,
          false,
          `shell.open target must be one of: ${targets.join(', ')} when provided`,
        );
      }
      const target = payload.target as (typeof targets)[number] | undefined;
      // Normalize before authorization so the trust boundary audit log
      // records the same target that handleShellOpen actually executes.
      const normalizedTarget: ShellOpenTarget = normalizeShellOpenTarget(target);
      const authorization = await authorizeWebUIAction(deps.trustBoundary, {
        capability: normalizedTarget === 'terminal' ? 'process.spawn' : 'filesystem.open-native',
        subject: {
          kind: normalizedTarget === 'terminal' ? 'command' : 'path',
          id: payload.path,
          attributes: { target: normalizedTarget },
        },
        risk: 'elevated',
        cwd: projectRoot(),
        metadata: { backend: 'cli-embedded' },
      });
      if (!authorization.allowed)
        return sendResult(ws, false, `Shell action denied: ${authorization.reason}`);
      const result = await handleShellOpen(
        { path: payload.path, target: normalizedTarget },
        deps.logger,
        { projectRoot: projectRoot() },
      );
      sendResult(ws, result.success, result.message);
    },
  };
  return shellGit;
}
