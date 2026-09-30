/**
 * Port of the official client's tool-output truncation. The vectors below are
 * the upstream ones (codex-rs/utils/string/src/truncate/tests.rs), so a drift
 * from the reference implementation shows up here byte for byte.
 */

import { describe, expect, it } from 'vitest';
import {
  parseCodexTruncationPolicy,
  truncateCodexToolOutput,
  truncateMiddle,
} from '../src/openai-codex-truncation.js';

describe('truncateMiddle (upstream truncate_text vectors)', () => {
  it('returns the original when under the token budget', () => {
    expect(truncateMiddle('short output', { mode: 'tokens', limit: 100 })).toBe('short output');
  });

  it('keeps head and tail with a token marker', () => {
    const s = '😀😀😀😀😀😀😀😀😀😀\nsecond line with text\n';
    expect(truncateMiddle(s, { mode: 'tokens', limit: 8 })).toBe(
      '😀😀😀😀…8 tokens truncated… line with text\n',
    );
  });

  it('keeps head and tail with a char marker in byte mode', () => {
    const s = '😀😀😀😀😀😀😀😀😀😀\nsecond line with text\n';
    expect(truncateMiddle(s, { mode: 'bytes', limit: 20 })).toBe(
      '😀😀…21 chars truncated…with text\n',
    );
  });
});

describe('truncateCodexToolOutput', () => {
  const policy = { mode: 'tokens', limit: 10000 } as const;

  it('leaves output within the 1.2x allowance untouched', () => {
    // 12000 tokens × 4 bytes = 48000 bytes is the effective ceiling.
    const text = 'x'.repeat(48_000);
    expect(truncateCodexToolOutput(text, policy)).toBe(text);
  });

  it('cuts the middle of larger output and keeps both ends', () => {
    const text = `HEAD${'x'.repeat(200_000)}TAIL [output truncated — full 200008 bytes at /spool.log]`;
    const out = truncateCodexToolOutput(text, policy);
    expect(out.startsWith('HEAD')).toBe(true);
    // The spool marker lives at the tail and must survive.
    expect(out.endsWith('at /spool.log]')).toBe(true);
    expect(out).toMatch(/…\d+ tokens truncated…/);
    expect(Buffer.byteLength(out)).toBeLessThan(48_100);
  });

  it('is deterministic, so the cached prefix stays byte-stable', () => {
    const text = 'y'.repeat(100_000);
    expect(truncateCodexToolOutput(text, policy)).toBe(truncateCodexToolOutput(text, policy));
  });
});

describe('parseCodexTruncationPolicy', () => {
  it('accepts the live catalog shape', () => {
    expect(parseCodexTruncationPolicy({ mode: 'tokens', limit: 10000 })).toEqual({
      mode: 'tokens',
      limit: 10000,
    });
    expect(parseCodexTruncationPolicy({ mode: 'bytes', limit: 20 })).toEqual({
      mode: 'bytes',
      limit: 20,
    });
  });

  it('treats anything malformed as no policy', () => {
    for (const bad of [
      undefined,
      null,
      'tokens',
      { mode: 'lines', limit: 10 },
      { mode: 'tokens', limit: 0 },
      { mode: 'tokens', limit: -5 },
      { mode: 'tokens', limit: 1.5 },
      { mode: 'tokens' },
    ]) {
      expect(parseCodexTruncationPolicy(bad)).toBeUndefined();
    }
  });
});
