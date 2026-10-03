import type { ServerMessage } from '../types.js';

export interface StatusNoticeProjection {
  text: string;
  tone: 'info' | 'warning' | 'error';
}

function compactLine(value: unknown, prefix = ''): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  // A prefix alone is not a message. Returning it when `value` is absent or
  // empty made `text || 'fallback'` unreachable — every caller with a prefix
  // (sessions.list, provider.error, provider.stream_error) rendered a bare
  // label ("Sessions ·", "Provider ·") instead of its fallback, so a
  // SUCCESSFUL sessions.list — which the server sends without an `error` field
  // on every success path — surfaced a spurious error notice.
  if (!text) return '';
  const combined = `${prefix}${text}`.trim();
  return combined.length > 180 ? `${combined.slice(0, 177)}…` : combined;
}

export function projectStatusNotice(message: ServerMessage): StatusNoticeProjection | null {
  const payload = message.payload ?? {};
  switch (message.type) {
    case 'chimera.report_available': {
      const text = compactLine(payload['message']);
      return {
        text:
          text || '🦂 Chimera report ready. No follow-up started; open the mailbox to inspect it.',
        tone: 'info',
      };
    }
    case 'sessions.list': {
      const text = compactLine(payload['error'], 'Sessions · ');
      return text ? { text, tone: 'error' } : null;
    }
    case 'key.operation_result': {
      if (payload['success'] !== false) return null;
      const text = compactLine(payload['message']);
      return { text: text || 'Operation failed', tone: 'error' };
    }
    case 'provider.error': {
      const text = compactLine(payload['description'], 'Provider · ');
      return {
        text: text || 'Provider request failed',
        tone: payload['retryable'] === true ? 'warning' : 'error',
      };
    }
    case 'provider.model_rerouted': {
      const served = compactLine(payload['served']);
      const requested = compactLine(payload['requested']);
      return {
        text: served
          ? compactLine(`${served}${requested ? ` instead of ${requested}` : ''}`, 'Rerouted · ')
          : 'Server answered with another model',
        tone: 'warning',
      };
    }
    case 'provider.stream_error': {
      const text = compactLine(payload['message'], 'Stream · ');
      return { text: text || 'Provider stream interrupted', tone: 'warning' };
    }
    default:
      return null;
  }
}
