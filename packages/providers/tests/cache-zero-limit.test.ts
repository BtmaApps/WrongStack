import { expect, it } from 'vitest';
import { capAnthropicCacheBreakpoints } from '../src/cache-breakpoint-cap.js';

it.each([0, 0.9, 1, 2, 4])('caps pinned markers at supported limit %s, repeatedly', (limit) => {
  const body = {
    system: Array.from({ length: 6 }, () => ({
      text: 'x',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    })),
  };
  capAnthropicCacheBreakpoints(body, limit);
  expect(body.system.filter((b) => b.cache_control)).toHaveLength(Math.floor(limit));
  capAnthropicCacheBreakpoints(body, limit);
  expect(body.system.filter((b) => b.cache_control)).toHaveLength(Math.floor(limit));
});
it('removes mixed global markers at zero and preserves fallback limits', () => {
  const body = {
    tools: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }],
    system: [{ text: 'x', cache_control: { type: 'ephemeral' } }],
    messages: [{ content: [{ text: 'y', cache_control: { type: 'ephemeral', ttl: '1h' } }] }],
  };
  capAnthropicCacheBreakpoints(body, 0);
  expect(JSON.stringify(body)).not.toContain('cache_control');
  for (const limit of [NaN, -1, Infinity]) {
    const fallback = {
      system: Array.from({ length: 5 }, () => ({
        text: 'x',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      })),
    };
    capAnthropicCacheBreakpoints(fallback, limit);
    expect(fallback.system.filter((b) => b.cache_control)).toHaveLength(4);
  }
});
