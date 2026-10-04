import { WsBridgeTransport } from '../src/agent/ws-bridge-transport.js';

function bridgeCase(mode: 'normal' | 'close-first' | 'already-closed' | 'throws') {
  const transport = new WsBridgeTransport(() => {});
  const seen: string[] = [];
  transport.onMessage(() => {
    seen.push('first');
    if (mode === 'close-first') transport.close();
    if (mode === 'throws') throw new Error('observer failure');
  });
  transport.onMessage(() => seen.push('second'));
  if (mode === 'already-closed') transport.close();
  transport.receive({ jsonrpc: '2.0', id: 1, method: 'ping' } as never);
  transport.close();
  return seen;
}

import { expect, it } from 'vitest';

it('verifies close during callback, preclosed owner, faulty handler and normal control', () => {
  expect(bridgeCase('close-first')).toEqual(['first']);
  expect(bridgeCase('already-closed')).toEqual([]);
  expect(bridgeCase('throws')).toEqual(['first', 'second']);
  expect(bridgeCase('normal')).toEqual(['first', 'second']);
});
