import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextStepsBar } from '../../src/components/NextStepsBar';

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

const steps = [
  { index: 1, text: 'Run the tests', auto: true },
  { index: 2, text: 'Review the changes' },
  { index: 3, text: 'Update the documentation' },
];
const draft = () => screen.getByRole('textbox', { name: 'Your message' });
const submit = () => screen.getByTestId('next-steps-submit');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NextStepsBar custom batch message', () => {
  it('sends selected steps in display order followed by the custom multiline message', () => {
    const onBatchSubmit = vi.fn();
    render(<NextStepsBar steps={steps} onBatchSubmit={onBatchSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /Update the documentation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run the tests/ }));
    fireEvent.change(draft(), {
      target: { value: '  Keep the corners square.\nCheck mobile too.  ' },
    });
    fireEvent.click(submit());
    expect(onBatchSubmit).toHaveBeenCalledExactlyOnceWith([
      'Run the tests',
      'Update the documentation',
      'Keep the corners square.\nCheck mobile too.',
    ]);
    expect((draft() as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows a custom message alone and disables empty or whitespace-only submissions', () => {
    const onBatchSubmit = vi.fn();
    render(<NextStepsBar steps={steps} onBatchSubmit={onBatchSubmit} />);
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(draft(), { target: { value: ' \n ' } });
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(draft(), { target: { value: 'Use my own next step' } });
    fireEvent.click(submit());
    expect(onBatchSubmit).toHaveBeenCalledExactlyOnceWith(['Use my own next step']);
  });

  it('retains the draft and selection if the sender refuses the submission', () => {
    const onBatchSubmit = vi.fn(() => false);
    render(<NextStepsBar steps={steps} onBatchSubmit={onBatchSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /Review the changes/ }));
    fireEvent.change(draft(), { target: { value: 'Do not lose this message' } });
    fireEvent.click(submit());
    expect((draft() as HTMLTextAreaElement).value).toBe('Do not lose this message');
    expect(screen.getByRole('button', { name: /Review the changes/, pressed: true })).toBeDefined();
  });

  it('preserves a draft across equivalent step objects and clears it for a new response', () => {
    const onBatchSubmit = vi.fn();
    const { rerender } = render(<NextStepsBar steps={steps} onBatchSubmit={onBatchSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /Review the changes/ }));
    fireEvent.change(draft(), { target: { value: 'My extra instruction' } });
    rerender(
      <NextStepsBar steps={steps.map((step) => ({ ...step }))} onBatchSubmit={onBatchSubmit} />,
    );
    expect((draft() as HTMLTextAreaElement).value).toBe('My extra instruction');
    expect(screen.getByRole('button', { name: /Review the changes/, pressed: true })).toBeDefined();
    rerender(
      <NextStepsBar steps={[{ index: 1, text: 'A new response' }]} onBatchSubmit={onBatchSubmit} />,
    );
    expect((draft() as HTMLTextAreaElement).value).toBe('');
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['draft', 'selection'])(
    'stops both automatic countdown paths on manual %s',
    async (mode) => {
      vi.useFakeTimers();
      const onAutoSubmit = vi.fn();
      render(
        <NextStepsBar
          steps={steps}
          onBatchSubmit={vi.fn()}
          onAutoSubmit={onAutoSubmit}
          yoloMode
          autoMode
          autoDelayMs={2000}
          sessionEndAutoFill
          sessionEndAutoFillSeconds={2}
        />,
      );
      act(() => document.dispatchEvent(new CustomEvent('chat:next-step-countdown')));
      if (mode === 'draft') {
        fireEvent.focus(draft());
        fireEvent.change(draft(), { target: { value: 'Still writing' } });
      } else {
        fireEvent.click(screen.getByRole('button', { name: /Review the changes/ }));
      }
      act(() => document.dispatchEvent(new CustomEvent('chat:next-step-countdown')));
      for (let second = 0; second < 4; second++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }
      expect(onAutoSubmit).not.toHaveBeenCalled();
    },
  );

  it('keeps click-to-fill behavior when batch submission is unavailable', () => {
    const { container } = render(
      <>
        <textarea data-chat-textarea />
        <NextStepsBar steps={steps} />
      </>,
    );
    expect(screen.queryByRole('textbox', { name: 'Your message' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Review the changes/ }));
    expect(container.querySelector('textarea')?.value).toBe('Review the changes');
  });
});
