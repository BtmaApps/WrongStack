import { createSessionPromptQueue } from '../../src/server/session-prompt-queue.js';

export async function queueStartCapacity(initial: number, result: boolean | 'error', drain = true) {
  let busy = true;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const queue = createSessionPromptQueue({
    isBusy: () => busy,
    startTurn: async (_id, _prompt, onStart) => {
      entered.resolve();
      await release.promise;
      if (result === 'error') throw new Error('Turn unavailable');
      if (result) onStart();
      return result;
    },
    broadcast: () => {},
  });
  for (let index = 0; index < initial; index++) {
    const added = await queue.add('session', { text: `item-${index}` });
    if (!added.ok) throw new Error('Fixture could not fill queue');
  }
  let pending: Promise<void> | undefined;
  try {
    if (drain) {
      busy = false;
      pending = queue.drain('session');
      await entered.promise;
    }
    const extra = await queue.add('session', { text: 'extra' });
    release.resolve();
    await pending;
    busy = true;
    const items = await queue.list('session');
    const other = await queue.add('other', { text: 'independent' });
    return { accepted: extra.ok, length: items.length, first: items[0]?.text, other: other.ok };
  } finally {
    release.resolve();
    await pending;
  }
}
