import type { UserInputRequest } from '@wrongstack/contracts/types';
import { describe, expect, it } from 'vitest';
import { emptyEngineState, reduceEngine } from '../src/engine-state';
import { inputResponse, parseInputRequest, recommendedDraft } from '../src/input-form-model';

const request: UserInputRequest = {
  id: 'request-a',
  title: 'Project decisions',
  tabs: [
    {
      id: 'build',
      label: 'Build',
      questions: [
        {
          id: 'stack',
          prompt: 'Choose a stack',
          kind: 'single_select',
          required: true,
          options: [
            { id: 'native', label: 'Native' },
            { id: 'web', label: 'Web' },
          ],
          recommendedOptionIds: ['native'],
          allowCustomResponse: true,
        },
        {
          id: 'features',
          prompt: 'Choose features',
          kind: 'multi_select',
          options: [
            { id: 'chat', label: 'Chat' },
            { id: 'terminal', label: 'Terminal' },
          ],
          recommendedOptionIds: ['chat'],
          allowCustomResponse: true,
        },
      ],
    },
    {
      id: 'delivery',
      label: 'Delivery',
      questions: [{ id: 'notes', prompt: 'Release notes', kind: 'text', required: true }],
    },
  ],
};
describe('native structured user input', () => {
  it('requires answers across every tab and only submits after an explicit action', () => {
    const draft = recommendedDraft(request);
    expect(() => inputResponse(request, draft, 'submitted')).toThrow('Release notes');
    draft['notes'] = { selectedOptionIds: [], text: 'Keep it native.', delegated: false };
    draft['features'] = {
      selectedOptionIds: ['terminal', 'chat', 'unknown', 'chat'],
      text: 'Preview',
      delegated: false,
    };
    const response = inputResponse(request, draft, 'submitted');
    expect(response.answers).toEqual([
      {
        questionId: 'stack',
        selectedOptionIds: ['native'],
        delegated: false,
        usedRecommendation: true,
      },
      {
        questionId: 'features',
        selectedOptionIds: ['terminal', 'chat'],
        text: 'Preview',
        delegated: false,
        usedRecommendation: false,
      },
      {
        questionId: 'notes',
        selectedOptionIds: [],
        text: 'Keep it native.',
        delegated: false,
        usedRecommendation: false,
      },
    ]);
  });
  it('allows explicit delegation, a write-in, and cancelling an incomplete form', () => {
    const draft = recommendedDraft(request);
    draft['stack'] = { selectedOptionIds: [], text: 'Custom runtime', delegated: false };
    draft['notes'] = { selectedOptionIds: [], text: '', delegated: true };
    expect(inputResponse(request, draft, 'submitted').answers[2]).toMatchObject({
      delegated: true,
      usedRecommendation: false,
    });
    expect(inputResponse(request, {}, 'cancelled')).toEqual({
      requestId: request.id,
      status: 'cancelled',
      answers: [],
    });
  });
  it('keeps unanswered forms through journal replay, deduplicates requests, and scopes resolutions', () => {
    const start = reduceEngine(emptyEngineState, {
      type: 'session.start',
      payload: { sessionId: 'core-a', provider: 'local', model: 'fixture' },
    });
    const frame = { type: 'user.input_requested', payload: { sessionId: 'core-a', request } };
    const pending = reduceEngine(reduceEngine(start, frame), frame);
    expect(pending.inputs).toEqual([request]);
    expect(
      reduceEngine(pending, {
        type: 'user.input_resolved',
        payload: { sessionId: 'core-b', requestId: request.id },
      }),
    ).toBe(pending);
    expect(
      reduceEngine(pending, {
        type: 'user.input_resolved',
        payload: { sessionId: 'core-a', requestId: request.id },
      }).inputs,
    ).toEqual([]);
  });
  it('rejects malformed forms without crashing the native session', () => {
    expect(parseInputRequest(request)).toEqual(request);
    for (const value of [
      {},
      null,
      { ...request, tabs: [] },
      {
        ...request,
        tabs: [
          {
            id: 'bad',
            label: 'Bad',
            questions: [{ id: 'broken', prompt: 'Broken', kind: 'single_select', options: [{}] }],
          },
        ],
      },
    ]) {
      expect(parseInputRequest(value)).toBeNull();
      expect(
        reduceEngine(emptyEngineState, {
          type: 'user.input_requested',
          payload: { request: value },
        }).error,
      ).toContain('invalid question form');
    }
  });
});
