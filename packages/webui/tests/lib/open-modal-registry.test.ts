import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasOpenModal,
  openModalCount,
  registerOpenModal,
  resetOpenModalRegistryForTests,
  subscribeToOpenModals,
  unregisterOpenModal,
} from '../../src/lib/open-modal-registry';

describe('open-modal-registry', () => {
  beforeEach(() => {
    resetOpenModalRegistryForTests();
  });

  it('starts empty', () => {
    expect(openModalCount()).toBe(0);
    expect(hasOpenModal()).toBe(false);
  });

  it('register/unregister drive count and hasOpenModal', () => {
    const disposeA = registerOpenModal('modal-a');
    expect(openModalCount()).toBe(1);
    expect(hasOpenModal()).toBe(true);

    registerOpenModal('modal-b');
    expect(openModalCount()).toBe(2);

    disposeA();
    expect(openModalCount()).toBe(1);
    expect(hasOpenModal()).toBe(true);

    unregisterOpenModal('modal-b');
    expect(openModalCount()).toBe(0);
    expect(hasOpenModal()).toBe(false);
  });

  it('re-registering the same id is idempotent', () => {
    const listener = vi.fn();
    subscribeToOpenModals(listener);

    const dispose1 = registerOpenModal('modal-a');
    registerOpenModal('modal-a');
    expect(openModalCount()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // The FIRST disposer still removes the id (single membership).
    dispose1();
    expect(hasOpenModal()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('dispose is safe to call more than once', () => {
    const dispose = registerOpenModal('modal-a');
    dispose();
    dispose();
    expect(openModalCount()).toBe(0);
  });

  it('unregistering an unknown id is a no-op', () => {
    expect(() => unregisterOpenModal('never-registered')).not.toThrow();
    expect(openModalCount()).toBe(0);
  });

  it('notifies subscribers only on membership transitions', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOpenModals(listener);

    registerOpenModal('modal-a');
    expect(listener).toHaveBeenCalledTimes(1);
    registerOpenModal('modal-a'); // no transition
    expect(listener).toHaveBeenCalledTimes(1);
    unregisterOpenModal('modal-a');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registerOpenModal('modal-a');
    expect(listener).toHaveBeenCalledTimes(2);

    unregisterOpenModal('modal-a');
  });
});
