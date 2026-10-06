import { describe, expect, it } from 'vitest';
import {
  projectRefineResult,
  resolveFailureNextStep,
  resolvePreviewAction,
} from '../../src/execution/refine-decisions.js';

const texts = { original: 'orig', refined: 'ref', english: 'eng' };

describe('resolvePreviewAction', () => {
  it('maps send decisions to their texts', () => {
    expect(resolvePreviewAction('refined', texts)).toEqual({ action: 'send', text: 'ref' });
    expect(resolvePreviewAction('english', texts)).toEqual({ action: 'send', text: 'eng' });
    expect(resolvePreviewAction('original', texts)).toEqual({ action: 'send', text: 'orig' });
  });

  it('maps edit to the refined text and non-send decisions to actions', () => {
    expect(resolvePreviewAction('edit', texts)).toEqual({ action: 'edit', text: 'ref' });
    expect(resolvePreviewAction('cancel', texts)).toEqual({ action: 'cancel' });
    expect(resolvePreviewAction('retry', texts)).toEqual({ action: 'retry' });
  });
});

describe('resolveFailureNextStep', () => {
  it('maps original / edit / retry decisions', () => {
    expect(resolveFailureNextStep({ kind: 'original' }, undefined, 'openai')).toEqual({
      action: 'send-original',
    });
    expect(resolveFailureNextStep({ kind: 'edit' }, undefined, 'openai')).toEqual({
      action: 'edit-original',
    });
    expect(resolveFailureNextStep({ kind: 'retry' }, undefined, 'openai')).toEqual({
      action: 'retry-same',
    });
  });

  it('parses the fallback ref on the first slash and defaults the provider', () => {
    expect(resolveFailureNextStep({ kind: 'fallback' }, 'zai/glm-5.2', 'openai')).toEqual({
      action: 'retry-target',
      providerId: 'zai',
      model: 'glm-5.2',
    });
    expect(
      resolveFailureNextStep({ kind: 'fallback' }, 'openrouter/anthropic/claude-3', 'openai'),
    ).toEqual({ action: 'retry-target', providerId: 'openrouter', model: 'anthropic/claude-3' });
    expect(resolveFailureNextStep({ kind: 'fallback' }, 'gpt-4o', 'openai')).toEqual({
      action: 'retry-target',
      providerId: 'openai',
      model: 'gpt-4o',
    });
  });

  it('reports an invalid target when the fallback ref has no model', () => {
    expect(resolveFailureNextStep({ kind: 'fallback' }, undefined, 'openai')).toEqual({
      action: 'invalid-target',
      providerId: 'openai',
      model: '',
    });
  });

  it('defaults the pick-model provider to the active session provider', () => {
    expect(resolveFailureNextStep({ kind: 'pick', model: 'glm-5.2' }, undefined, 'openai')).toEqual(
      { action: 'retry-target', providerId: 'openai', model: 'glm-5.2' },
    );
    expect(
      resolveFailureNextStep(
        { kind: 'pick', providerId: 'zai', model: 'glm-5.2' },
        undefined,
        'openai',
      ),
    ).toEqual({ action: 'retry-target', providerId: 'zai', model: 'glm-5.2' });
  });

  it('reports an invalid target when a pick names no model', () => {
    expect(
      resolveFailureNextStep({ kind: 'pick', providerId: 'zai' }, undefined, 'openai'),
    ).toEqual({ action: 'invalid-target', providerId: 'zai', model: '' });
  });
});

describe('projectRefineResult', () => {
  it('retries a timeout once on the server-suggested window', () => {
    expect(
      projectRefineResult(
        { error: 'timed out', errorKind: 'timeout', retryTimeoutMs: 180_000 },
        { original: 'fix the bug', retried: false },
      ),
    ).toEqual({ action: 'retry', timeoutMs: 180_000 });
  });

  it('surfaces the failure on a second timeout or a non-timeout error', () => {
    const retried = { original: 'fix the bug', retried: true };
    expect(
      projectRefineResult(
        { error: 'timed out', errorKind: 'timeout', retryTimeoutMs: 180_000 },
        retried,
      ),
    ).toEqual({
      action: 'failed',
      error: 'timed out',
      errorKind: 'timeout',
      fallbackRef: undefined,
    });
    expect(
      projectRefineResult(
        { error: 'down', errorKind: 'provider_error' },
        {
          original: 'fix the bug',
          retried: false,
        },
      ),
    ).toEqual({
      action: 'failed',
      error: 'down',
      errorKind: 'provider_error',
      fallbackRef: undefined,
    });
  });

  it('validates errorKind and keeps an unknown kind undefined', () => {
    const action = projectRefineResult(
      { error: 'boom', errorKind: 'something_else', fallbackRef: 'openai/gpt-4o-mini' },
      { original: 'fix the bug', retried: false },
    );
    expect(action).toEqual({
      action: 'failed',
      error: 'boom',
      errorKind: undefined,
      fallbackRef: 'openai/gpt-4o-mini',
    });
  });

  it('sends the original for an absent or only-reflowed refinement', () => {
    const current = { original: 'fix the bug', retried: false };
    expect(projectRefineResult({ refined: '' }, current)).toEqual({ action: 'noop-send' });
    expect(projectRefineResult({}, current)).toEqual({ action: 'noop-send' });
    expect(projectRefineResult({ refined: 'Fix The  Bug' }, current)).toEqual({
      action: 'noop-send',
    });
  });

  it('projects a ready panel with english falling back to refined', () => {
    expect(
      projectRefineResult(
        { refined: 'Fix the parser bug thoroughly.', english: 'Fix the parser bug thoroughly.' },
        { original: 'fix the bug', retried: false },
      ),
    ).toEqual({
      action: 'ready',
      refined: 'Fix the parser bug thoroughly.',
      english: 'Fix the parser bug thoroughly.',
    });
    expect(
      projectRefineResult(
        { refined: 'Fix the parser bug thoroughly.' },
        {
          original: 'fix the bug',
          retried: false,
        },
      ),
    ).toEqual({
      action: 'ready',
      refined: 'Fix the parser bug thoroughly.',
      english: 'Fix the parser bug thoroughly.',
    });
  });
});
