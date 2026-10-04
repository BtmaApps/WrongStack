import type { ACPMessage } from '../types/acp-messages.js';
import { isBestEffortAckMethod } from './acp-message-routing.js';
import {
  type ACPCallbackOptions,
  type ACPResponseSender,
  handleAcpFsRequest,
  handleAcpPermissionRequest,
  handleAcpTerminalRequest,
} from './acp-session-callbacks.js';
import { ACPSessionError } from './acp-session-errors.js';
import type { ACPProgressEvent } from './acp-session-types.js';
import { handleAcpSessionUpdate } from './acp-session-updates.js';

export interface AcpSessionMessagesHost {
  sendResult: (id: string | number, result: unknown) => Promise<void>;
  sendErrorResponse: (id: string | number, code: number, message: string) => Promise<void>;
  promptCallbackAbort: AbortController | null;
  callbackAbort: AbortController;
  pending: Map<string | number, import('./acp-request-state.js').PendingRequest>;
  sessionId: import('../types/acp-v1.js').SessionId | null;
  scratch: import('./acp-session-updates.js').ACPSessionScratch;
  emitProgress: (event: import('./acp-session-types.js').ACPProgressEvent) => void;
  permissionPolicy: import('./permission.js').PermissionPolicy;
  responseSender: () => import('./acp-session-callbacks.js').ACPResponseSender;
  callbackOptions: () => import('./acp-session-callbacks.js').ACPCallbackOptions;
  fileServer: import('./file-server.js').FileServer;
  terminalServer: import('./terminal-server.js').TerminalServer;
  progressHandler: import('./acp-session-types.js').ACPProgressHandler | null;
}

export function responseSender(this: AcpSessionMessagesHost): ACPResponseSender {
  return {
    sendResult: (id, result) => this.sendResult(id, result),
    sendErrorResponse: (id, code, message) => this.sendErrorResponse(id, code, message),
  };
}

export function callbackOptions(this: AcpSessionMessagesHost): ACPCallbackOptions {
  const promptSignal = this.promptCallbackAbort?.signal;
  const signal = promptSignal
    ? AbortSignal.any([this.callbackAbort.signal, promptSignal])
    : this.callbackAbort.signal;
  return { signal, permissionTimeoutMs: Number.POSITIVE_INFINITY };
}

export function handleMessage(this: AcpSessionMessagesHost, msg: ACPMessage): void {
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    this.pending.delete(msg.id);
    if (msg.error !== undefined) {
      const method = pending.method;
      const kind =
        method === 'session/new'
          ? 'session_create_failed'
          : method === 'authenticate'
            ? 'auth_failed'
            : 'protocol_error';
      pending.reject(
        new ACPSessionError(kind, msg.error.message ?? 'unknown JSON-RPC error', msg.error),
      );
    } else {
      pending.resolve(msg.result);
    }
    return;
  }

  if (msg.method === 'session/update') {
    // Defense in depth. A `session/update` names the session it belongs to.
    // Our own server already drops updates for a session it closed, deleted
    // or replaced (the `emit` guard in handleSessionPromptOp), but this
    // client also speaks to third-party ACP agents that need not do the
    // same. Folding a foreign session's chunk into `scratch` splices another
    // conversation into this run's transcript — and `scratch` is what
    // prompt() returns and what the replay history is built from. Only drop
    // when the update explicitly names a DIFFERENT session, so a
    // non-conformant update that omits sessionId is still handled as before.
    const updateSessionId = (msg.params as { sessionId?: unknown } | null | undefined)?.sessionId;
    if (typeof updateSessionId === 'string' && updateSessionId !== this.sessionId) return;
    handleAcpSessionUpdate(msg, this.scratch, (event) => this.emitProgress(event));
    return;
  }

  if (msg.method === 'session/request_permission') {
    handleAcpPermissionRequest(
      msg,
      this.permissionPolicy,
      this.responseSender(),
      this.callbackOptions(),
    ).catch(() => {});
    return;
  }

  if (msg.method === 'fs/read_text_file' || msg.method === 'fs/write_text_file') {
    handleAcpFsRequest(
      msg,
      this.fileServer,
      this.permissionPolicy,
      this.responseSender(),
      this.callbackOptions(),
    ).catch(() => {});
    return;
  }

  if (msg.method?.startsWith('terminal/')) {
    handleAcpTerminalRequest(
      msg,
      this.terminalServer,
      this.permissionPolicy,
      this.responseSender(),
      this.callbackOptions(),
    ).catch(() => {});
    return;
  }

  if (isBestEffortAckMethod(msg.method)) {
    if (msg.id !== undefined) {
      this.sendErrorResponse(msg.id, -32601, `Unsupported method: ${msg.method}`).catch(() => {});
    }
    return;
  }

  if (msg.method === '$/cancel_request') {
    return;
  }

  if (msg.method) {
    if (msg.id !== undefined) {
      void this.sendErrorResponse(msg.id, -32601, `Unsupported method: ${msg.method}`).catch(
        () => {},
      );
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'acp_session.unhandled_method',
        method: msg.method,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

export function emitProgress(this: AcpSessionMessagesHost, event: ACPProgressEvent): void {
  if (!this.progressHandler) return;
  try {
    this.progressHandler(event);
  } catch {
    // A faulty host handler must never break the wire pump.
  }
}
