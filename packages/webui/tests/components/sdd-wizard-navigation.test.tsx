import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SddWizard } from '../../src/components/SddWizard';
import { useSddWizardStore } from '../../src/stores/sdd-wizard-store';

const send = vi.hoisted(() => vi.fn());
const withSession = vi.hoisted(() =>
  vi.fn((payload: Record<string, unknown>) => ({ ...payload, sessionId: 'tab-3' })),
);

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ client: { send, withSession } }),
}));

vi.mock('@/hooks/useProviderModels', () => ({
  useProviderModels: () => [],
}));

vi.mock('@/hooks/useScrollPosition', () => ({
  useScrollPosition: () => ({ current: null }),
}));

describe('SddWizard run navigation', () => {
  beforeEach(() => {
    send.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    useSddWizardStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    useSddWizardStore.getState().reset();
  });

  it('hands a started run to its container and consumes the run marker', () => {
    const onRunStarted = vi.fn();
    render(<SddWizard onClose={vi.fn()} onRunStarted={onRunStarted} />);

    act(() => {
      useSddWizardStore.getState().setStartedRunId('run-1');
    });

    expect(onRunStarted).toHaveBeenCalledOnce();
    expect(useSddWizardStore.getState().startedRunId).toBeNull();
  });

  it('sends the chat tab that initiated a wizard run', () => {
    act(() => {
      useSddWizardStore.getState().setSnapshot({
        sessionId: 'wizard-interview',
        phase: 'task_review',
        title: 'Run the tasks',
        questionCount: 1,
        minQuestions: 1,
        maxQuestions: 3,
        answers: [],
        taskCount: 1,
        prompt: '',
        busy: false,
      });
    });
    const screen = render(<SddWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'activity:sddWizard.startRun' })[0]!);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sdd.run.start',
        payload: expect.objectContaining({ sessionId: 'tab-3' }),
      }),
    );
  });
});
