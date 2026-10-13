import { describe, expect, it } from 'vitest';
import { definePlugin, KERNEL_API_VERSION } from '../src/index.js';
import {
  BoundedMap,
  releaseHandle,
  releaseHandles,
  runOptionalPluginCouncil,
  safeJsonStringify,
  safePath,
  withReDoSGuard,
} from '../src/runtime/index.js';

describe('@wrongstack/plugin-sdk surface', () => {
  it('exposes the kernel contract version', () => {
    expect(KERNEL_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('definePlugin injects the apiVersion and preserves metadata', () => {
    const plugin = definePlugin(
      {
        name: 'wstack-plugin-sdk-test',
        version: '1.0.0',
        capabilities: { tools: true },
        defaultConfig: { greeting: 'hi' },
      },
      (api, options) => {
        expect(api).toBeDefined();
        expect(options.greeting).toBe('hi');
      },
    );
    expect(plugin.name).toBe('wstack-plugin-sdk-test');
    expect(plugin.apiVersion).toBe(KERNEL_API_VERSION);
    expect(plugin.capabilities).toEqual({ tools: true });
    expect(typeof plugin.setup).toBe('function');
  });

  it('ships the runtime helper barrel', () => {
    expect(typeof BoundedMap).toBe('function');
    expect(typeof releaseHandles).toBe('function');
    expect(typeof safePath).toBe('function');
    const map = new BoundedMap<string, number>({ max: 2 });
    map.set('a', 1);
    expect(map.get('a')).toBe(1);
  });

  it('enforces BoundedMap LRU promotion, max-size eviction, and TTL expiration', () => {
    let now = 1_000;
    const map = new BoundedMap<string, number>({ max: 2, ttlMs: 50, now: () => now });
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1); // promotes 'a' over 'b'
    map.set('c', 3); // evicts coldest key 'b'
    expect(map.size).toBe(2);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('a')).toBe(1);

    now = 1_060;
    expect(map.get('a')).toBeUndefined();
  });

  it('exercises releaseHandle, safeJsonStringify DAG vs cycle + BigInt, safePath bounds, cancelled council guard, and withReDoSGuard', async () => {
    let released = 0;
    expect(
      releaseHandle(() => {
        released += 1;
      }),
    ).toBeNull();
    expect(released).toBe(1);
    expect(
      releaseHandle(() => {
        throw new Error('disposed');
      }),
    ).toBeNull();

    const shared = { leaf: 1 };
    expect(safeJsonStringify({ a: shared, b: shared, big: 99n })).toBe(
      '{"a":{"leaf":1},"b":{"leaf":1},"big":"99n"}',
    );
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    expect(safeJsonStringify(cyclic)).toBe('{"name":"root","self":"[circular]"}');

    expect(safePath('')).toBeNull();
    expect(safePath('a'.repeat(5_000))).toBeNull();

    let oneShotCalled = false;
    const councilRes = await runOptionalPluginCouncil({
      requested: true,
      label: 'audit',
      prompt: 'check',
      parse: (raw) => raw,
      api: {
        log: { warn: () => {} },
        llm: {
          council: async () => ({ status: 'cancelled' }) as never,
          complete: async () => {
            oneShotCalled = true;
            return { text: 'fallback' } as never;
          },
        },
      } as never,
    });
    expect(councilRes).toEqual({ used: false, value: null, fallbackReason: 'cancelled' });
    expect(oneShotCalled).toBe(false);

    const redos = await withReDoSGuard(/hello/, 'hello world', 500);
    expect(redos.timedOut).toBe(false);
    expect(redos.match?.[0]).toBe('hello');
  });
});
