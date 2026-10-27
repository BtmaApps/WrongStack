import { describe, expect, it } from 'vitest';
import { DraftWriter } from '../src/draft-storage';

describe('session draft persistence', () => {
  it('serializes saves within a session without blocking another session', async () => {
    const seen: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = new DraftWriter(async (id, text) => {
      seen.push(`${id}:${text}`);
      if (text === 'first') await first;
    });
    const a = writer.write('a', 'first');
    const b = writer.write('a', 'second');
    const c = writer.write('b', 'other');
    await c;
    expect(seen).toEqual(['a:first', 'b:other']);
    release();
    await Promise.all([a, b]);
    expect(seen).toEqual(['a:first', 'b:other', 'a:second']);
  });
  it('reports failed writes while allowing a later save', async () => {
    const writer = new DraftWriter(async (_id, text) => {
      if (text === 'bad') throw Error('disk full');
    });
    await expect(writer.write('a', 'bad')).rejects.toThrow('disk full');
    await expect(writer.write('a', 'recovered')).resolves.toBeUndefined();
  });
});
