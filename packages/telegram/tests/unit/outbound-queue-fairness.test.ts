/**
 * Regression: #nextReady scanned the lane Map in insertion order and a lane
 * with backlog kept its position, so a busy chat reclaimed every freed slot
 * and starved later chats until its whole backlog drained (a manual send
 * waited behind 20 notifications per busy lane). Lanes with backlog now move
 * to the back of the Map after each send; per-chat FIFO is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { OutboundQueue } from '../../src/outbound-queue.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function manualPosition(maxConcurrency: number, busyChats: number): Promise<number> {
  const order: string[] = [];
  const queue = new OutboundQueue({
    maxConcurrency,
    maxPerChat: 32,
    send: async (chatId) => {
      await sleep(1);
      order.push(String(chatId));
      return 'ok';
    },
  });
  for (let c = 0; c < busyChats; c++)
    for (let i = 0; i < 20; i++)
      void queue.enqueue({ chatId: `busy${c}`, text: `n${i}`, kind: 'notification' });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await queue.enqueue({ chatId: 'user', text: 'manual', kind: 'manual' });
  await queue.stop();
  return order.indexOf('user') + 1;
}

describe('OutboundQueue cross-chat fairness', () => {
  it('a busy chat cannot hold the only slot until its backlog drains', async () => {
    expect(await manualPosition(1, 1)).toBeLessThanOrEqual(2);
  });

  it('with every slot busy, another chat gets a turn within one round', async () => {
    expect(await manualPosition(4, 4)).toBeLessThanOrEqual(5);
  });

  it('keeps FIFO order within each chat while rotating lanes', async () => {
    const seen: string[] = [];
    const queue = new OutboundQueue({
      maxConcurrency: 2,
      send: async (chatId, text) => {
        await sleep(1);
        seen.push(`${chatId}:${text}`);
        return 'ok';
      },
    });
    for (let i = 0; i < 6; i++)
      for (const chat of ['a', 'b', 'c'])
        void queue.enqueue({ chatId: chat, text: String(i), kind: 'notification' });
    await sleep(5);
    while (queue.stats().pending > 0) await sleep(5);
    await queue.stop();

    for (const chat of ['a', 'b', 'c']) {
      expect(seen.filter((s) => s.startsWith(`${chat}:`)).map((s) => s.slice(2))).toEqual([
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);
    }
  });
});
