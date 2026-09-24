import type { WrongStackErrorKind, WrongStackErrorModel } from '@wrongstack/webui-protocol';

/**
 * Every failure the client reports: a refused token, a dropped socket, a
 * server `error` frame, a provider failure, a run that did not finish. Branch
 * on `kind`; `code` narrows it (an HTTP status, the server's error code or
 * phase, a run status).
 */
export class WrongStackError extends Error implements WrongStackErrorModel {
  readonly kind: WrongStackErrorKind;
  readonly code: string;
  readonly detail: string | undefined;
  readonly retryable: boolean | undefined;

  constructor(model: WrongStackErrorModel) {
    super(
      model.detail ? `${model.kind}/${model.code}: ${model.detail}` : `${model.kind}/${model.code}`,
    );
    this.name = 'WrongStackError';
    this.kind = model.kind;
    this.code = model.code;
    this.detail = model.detail;
    this.retryable = model.retryable;
  }

  toJSON(): WrongStackErrorModel {
    return {
      kind: this.kind,
      code: this.code,
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.retryable !== undefined ? { retryable: this.retryable } : {}),
    };
  }
}

/** The error kind an HTTP status maps to. */
export function kindForStatus(status: number): WrongStackErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status >= 400 && status < 500) return 'invalid';
  return 'server';
}
