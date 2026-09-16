import { describe, expect, it } from 'vitest';
import { confirmModal, useConfirmModalStore } from '../../src/components/ConfirmModal';

describe('confirmModal', () => {
  it('resolves true when settled with confirm', async () => {
    const p = confirmModal({ title: 'Delete?' });
    expect(useConfirmModalStore.getState().request?.title).toBe('Delete?');
    useConfirmModalStore.getState().settle(true);
    await expect(p).resolves.toBe(true);
    expect(useConfirmModalStore.getState().request).toBeNull();
  });

  it('resolves false when dismissed', async () => {
    const p = confirmModal({ title: 'Delete?' });
    useConfirmModalStore.getState().settle(false);
    await expect(p).resolves.toBe(false);
  });

  it('a second request dismisses the pending one as false', async () => {
    const first = confirmModal({ title: 'First' });
    const second = confirmModal({ title: 'Second' });
    await expect(first).resolves.toBe(false);
    expect(useConfirmModalStore.getState().request?.title).toBe('Second');
    useConfirmModalStore.getState().settle(true);
    await expect(second).resolves.toBe(true);
  });

  it('alertModal opens with hideCancel and resolves upon settle', async () => {
    const { alertModal } = await import('../../src/components/ConfirmModal');
    const p = alertModal({ title: 'Important Alert', message: 'Something occurred.' });
    expect(useConfirmModalStore.getState().request?.title).toBe('Important Alert');
    expect(useConfirmModalStore.getState().request?.hideCancel).toBe(true);
    useConfirmModalStore.getState().settle(true);
    await expect(p).resolves.toBeUndefined();
    expect(useConfirmModalStore.getState().request).toBeNull();
  });
});
