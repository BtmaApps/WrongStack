import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  ConfirmModalHost,
  confirmModalChoice,
  useConfirmModalStore,
} from '../../src/components/ConfirmModal.js';

it('uses the safe cancel choice when a dialog opts into cancel as the default', async () => {
  render(<ConfirmModalHost />);
  // confirmModalChoice() writes the request into the modal store, which
  // re-renders the host mounted above — that update has to land inside act() or
  // React reports it as an update outside act().
  let decision!: ReturnType<typeof confirmModalChoice>;
  await act(async () => {
    decision = confirmModalChoice({
      title: 'Start a fresh context?',
      confirmLabel: 'New context',
      cancelLabel: 'Same context',
      defaultAction: 'cancel',
    });
  });

  expect(await screen.findByText('Start a fresh context?')).toBeDefined();
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Enter' });
  });

  await expect(decision).resolves.toBe('cancel');
  expect(useConfirmModalStore.getState().request).toBeNull();
});

it('distinguishes dismiss from the same-context button', async () => {
  const decision = confirmModalChoice({ title: 'Start a fresh context?' });

  useConfirmModalStore.getState().settle(null);

  await expect(decision).resolves.toBe('dismiss');
});
