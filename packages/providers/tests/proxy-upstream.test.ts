/**
 * The endpoint a base URL finally reaches through the WrongProxy rewrite
 * (`<proxy>/proxy/<host><path>`). Host-keyed behaviour — the MiniMax transport,
 * reasoning-echo host defaults — must see the vendor, not `localhost`.
 */

import { rewriteBaseUrl } from '@wrongstack/core/wiring/proxy-rewrite';
import { describe, expect, it } from 'vitest';
import { upstreamHost, upstreamUrl } from '../src/proxy-upstream.js';

const PROXY = 'http://localhost:3444';

describe('upstreamHost', () => {
  it('reads the vendor host through the proxy rewrite', () => {
    const proxied = rewriteBaseUrl('https://api.minimax.io/anthropic/v1', PROXY);
    expect(proxied).toBe('http://localhost:3444/proxy/api.minimax.io/anthropic/v1');
    expect(upstreamHost(proxied)).toBe('api.minimax.io');
    expect(upstreamHost('http://localhost:3444/proxy/API.Example.com:8443/v1')).toBe(
      'api.example.com',
    );
  });

  it('reads a direct URL as-is and rejects garbage', () => {
    expect(upstreamHost('https://API.MiniMax.io/v1')).toBe('api.minimax.io');
    expect(upstreamHost('not a url')).toBeUndefined();
    expect(upstreamHost(undefined)).toBeUndefined();
  });
});

describe('upstreamUrl', () => {
  it('undoes the proxy rewrite, keeping path and query', () => {
    for (const original of [
      'https://api.minimax.io/anthropic/v1',
      'https://api.minimax.cn/v1',
      'https://gw.example.com/v1?tenant=a',
    ]) {
      expect(upstreamUrl(rewriteBaseUrl(original, PROXY) ?? '')).toBe(original);
    }
  });

  it('returns anything that is not proxy-mounted unchanged', () => {
    expect(upstreamUrl('https://api.minimax.io/v1')).toBe('https://api.minimax.io/v1');
    expect(upstreamUrl('not a url')).toBe('not a url');
  });
});
