import { record } from './engine-values';

export class EngineHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(engineHttpError(data, status));
    this.name = 'EngineHttpError';
  }
}
export function engineHttpError(data: unknown, status: number): string {
  const error = record(data)['error'];
  if (typeof error === 'string' && error) return error;
  const message = record(error)['message'];
  return typeof message === 'string' && message
    ? message
    : `The engine refused this operation (${status}).`;
}
