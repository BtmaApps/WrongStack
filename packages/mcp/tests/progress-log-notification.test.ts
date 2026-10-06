import { describe, expect, it } from 'vitest';
import { logMessageNotification, progressNotification } from '../src/protocol.js';

describe('progressNotification', () => {
  it('accepts a well-formed payload with a string token', () => {
    expect(
      progressNotification({
        progressToken: 'progress-1',
        progress: 1,
        total: 4,
        message: 'one quarter',
      }),
    ).toEqual({ progressToken: 'progress-1', progress: 1, total: 4, message: 'one quarter' });
  });

  it('accepts a numeric token without optional fields', () => {
    expect(progressNotification({ progressToken: 7, progress: 0.5 })).toEqual({
      progressToken: 7,
      progress: 0.5,
      total: undefined,
      message: undefined,
    });
  });

  it('ignores a malformed payload instead of throwing', () => {
    // A notification has no reply, so a bad one is dropped, never answered.
    expect(progressNotification(undefined)).toBeUndefined();
    expect(progressNotification(null)).toBeUndefined();
    expect(progressNotification([])).toBeUndefined();
    expect(progressNotification('half')).toBeUndefined();
    expect(progressNotification({})).toBeUndefined();
    expect(progressNotification({ progressToken: true, progress: 1 })).toBeUndefined();
    expect(progressNotification({ progressToken: '', progress: 1 })).toBeUndefined();
    expect(progressNotification({ progressToken: 'a'.repeat(257), progress: 1 })).toBeUndefined();
    expect(progressNotification({ progressToken: 'bad\r\ntoken', progress: 1 })).toBeUndefined();
  });

  it('rejects a missing or invalid progress value', () => {
    expect(progressNotification({ progressToken: 't' })).toBeUndefined();
    expect(progressNotification({ progressToken: 't', progress: 'half' })).toBeUndefined();
    expect(progressNotification({ progressToken: 't', progress: -1 })).toBeUndefined();
    expect(progressNotification({ progressToken: 't', progress: Number.NaN })).toBeUndefined();
    expect(progressNotification({ progressToken: 't', progress: Infinity })).toBeUndefined();
  });

  it('drops an invalid total instead of failing the whole notification', () => {
    expect(progressNotification({ progressToken: 't', progress: 1, total: 'four' })).toEqual({
      progressToken: 't',
      progress: 1,
      total: undefined,
      message: undefined,
    });
    expect(progressNotification({ progressToken: 't', progress: 1, total: -2 })).toEqual({
      progressToken: 't',
      progress: 1,
      total: undefined,
      message: undefined,
    });
  });

  it('clamps and sanitizes the message text', () => {
    expect(progressNotification({ progressToken: 't', progress: 1, message: '' })).toEqual({
      progressToken: 't',
      progress: 1,
      total: undefined,
      message: undefined,
    });
    expect(progressNotification({ progressToken: 't', progress: 1, message: 42 })).toEqual({
      progressToken: 't',
      progress: 1,
      total: undefined,
      message: undefined,
    });
    // A forged newline must not survive into logs.
    expect(
      progressNotification({ progressToken: 't', progress: 1, message: 'half\r\ndone' })?.message,
    ).toBe('half  done');
    const long = progressNotification({
      progressToken: 't',
      progress: 1,
      message: 'x'.repeat(5_000),
    })?.message;
    expect(long).toHaveLength(2_001);
    expect(long?.endsWith('…')).toBe(true);
  });
});

describe('logMessageNotification', () => {
  it('accepts a well-formed payload', () => {
    expect(logMessageNotification({ level: 'warning', logger: 'db', data: 'slow query' })).toEqual({
      level: 'warning',
      logger: 'db',
      data: 'slow query',
    });
  });

  it('ignores a malformed payload instead of throwing', () => {
    expect(logMessageNotification(undefined)).toBeUndefined();
    expect(logMessageNotification(null)).toBeUndefined();
    expect(logMessageNotification([])).toBeUndefined();
    expect(logMessageNotification('info')).toBeUndefined();
    expect(logMessageNotification({})).toBeUndefined();
    expect(logMessageNotification({ level: 'loud' })).toBeUndefined();
    expect(logMessageNotification({ level: 3 })).toBeUndefined();
  });

  it('drops an invalid logger instead of failing the whole notification', () => {
    expect(logMessageNotification({ level: 'info', logger: 'a'.repeat(257), data: 'x' })).toEqual({
      level: 'info',
      logger: undefined,
      data: 'x',
    });
    expect(logMessageNotification({ level: 'info', logger: 'bad\r\nlogger', data: 'x' })).toEqual({
      level: 'info',
      logger: undefined,
      data: 'x',
    });
    expect(logMessageNotification({ level: 'info', logger: 42, data: 'x' })).toEqual({
      level: 'info',
      logger: undefined,
      data: 'x',
    });
  });

  it('serializes, clamps and sanitizes non-string log data', () => {
    expect(logMessageNotification({ level: 'info', data: { rows: 3 } })?.data).toBe('{"rows":3}');
    expect(logMessageNotification({ level: 'info', data: null })?.data).toBe('null');
    // A forged newline must not survive into logs.
    expect(logMessageNotification({ level: 'info', data: 'a\r\nb' })?.data).toBe('a  b');
    const long = logMessageNotification({ level: 'info', data: 'x'.repeat(5_000) })?.data;
    expect(long).toHaveLength(2_001);
    expect(long?.endsWith('…')).toBe(true);
  });

  it('keeps the parser total for data a JSON wire can never carry', () => {
    // Direct callers can pass anything; the parser must still return text.
    expect(logMessageNotification({ level: 'info', data: () => 'never' })?.data).toContain('=>');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(logMessageNotification({ level: 'info', data: circular })?.data).toBe('[object Object]');
  });

  it('omits data when the server sent none', () => {
    expect(logMessageNotification({ level: 'info' })).toEqual({
      level: 'info',
      logger: undefined,
      data: undefined,
    });
    expect(logMessageNotification({ level: 'info', data: undefined })).toEqual({
      level: 'info',
      logger: undefined,
      data: undefined,
    });
  });
});
