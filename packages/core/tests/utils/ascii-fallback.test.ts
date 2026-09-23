import { describe, expect, it } from 'vitest';
import { installAsciiOutput, isAsciiMode, toAscii } from '../../src/utils/ascii-fallback.js';

describe('toAscii', () => {
  it('replaces UI symbols and leaves letters in any script alone', () => {
    expect(toAscii('╭─ Tools ─╮')).toBe('+- Tools -+');
    expect(toAscii('│ ✓ done → next … ⚠\uFE0F careful')).toBe('| + done -> next ... ! careful');
    expect(toAscii('🧠 thinking · 3 ↑ 2 ↓')).toBe('* thinking . 3 ^ 2 v');
    expect(toAscii('şğıöçü é 中文 €5')).toBe('şğıöçü é 中文 €5');
    expect(toAscii('\u001b[31m● red\u001b[0m')).toBe('\u001b[31mo red\u001b[0m');
    expect(toAscii('Nerd \u{F0219} icon')).toBe('Nerd * icon');
    // Unicode files `ℹ` under lowercase letters; it is still a symbol here.
    expect(toAscii('ℹ info ℹ️')).toBe('i info i');
  });

  it('keeps a spinner animating: braille frames map to different ASCII frames', () => {
    const frames = ['⠋', '⠙', '⠹', '⠸'].map((f) => toAscii(f));
    expect(new Set(frames).size).toBeGreaterThan(1);
    for (const f of frames) expect(f).toMatch(/^[|/\-\\]$/);
  });

  it('drops an orphan variation selector (half of an emoji split across writes)', () => {
    expect(toAscii('\uFE0Fnext')).toBe('next');
  });

  it('returns ASCII input unchanged', () => {
    const s = 'plain ascii -> fine';
    expect(toAscii(s)).toBe(s);
  });

  it('preserveWidth keeps every replacement at the symbol’s display width', () => {
    expect(toAscii('✅ok', { preserveWidth: true })).toBe('+ ok');
    expect(toAscii('a…b', { preserveWidth: true })).toBe('a.b');
    expect(toAscii('→x', { preserveWidth: true })).toBe('-x');
    expect(toAscii('⏸', { preserveWidth: true })).toBe('|');
  });
});

describe('isAsciiMode', () => {
  it('reads WRONGSTACK_TUI_ICON_STYLE', () => {
    expect(isAsciiMode({ WRONGSTACK_TUI_ICON_STYLE: 'ascii' })).toBe(true);
    expect(isAsciiMode({ WRONGSTACK_TUI_ICON_STYLE: ' Plain ' })).toBe(true);
    expect(isAsciiMode({ WRONGSTACK_TUI_ICON_STYLE: 'nerd' })).toBe(false);
    expect(isAsciiMode({})).toBe(false);
  });
});

describe('installAsciiOutput', () => {
  function fakeStream() {
    const writes: Array<{ chunk: unknown; encoding: unknown }> = [];
    const stream = {
      write(chunk: unknown, encoding?: unknown, cb?: unknown) {
        writes.push({ chunk, encoding: typeof encoding === 'function' ? undefined : encoding });
        const done = typeof encoding === 'function' ? encoding : cb;
        if (typeof done === 'function') (done as () => void)();
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    return { stream, writes };
  }

  it('converts strings and buffers, including a character split across writes', () => {
    const { stream, writes } = fakeStream();
    const uninstall = installAsciiOutput(stream);
    stream.write('✓ ok\n');
    const bytes = Buffer.from('→', 'utf8');
    stream.write(bytes.subarray(0, 1));
    stream.write(bytes.subarray(1));
    let called = false;
    stream.write(Buffer.from('●'), () => {
      called = true;
    });
    expect(writes.map((w) => w.chunk).join('')).toBe('+ ok\n-o');
    expect(called).toBe(true);

    // A string in another encoding is data: untouched.
    stream.write('é→', 'latin1');
    expect(writes.at(-1)).toEqual({ chunk: 'é→', encoding: 'latin1' });

    uninstall();
    stream.write('✓');
    expect(writes.at(-1)?.chunk).toBe('✓');
  });
});
