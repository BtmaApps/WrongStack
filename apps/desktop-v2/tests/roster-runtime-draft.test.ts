import { describe, expect, it } from 'vitest';
import { rosterRuntimeCodec, rosterRuntimeDraftKey } from '../src/roster-runtime-draft';

describe('roster runtime drafts', () => {
  it('keys runtime overrides by role', async () => {
    const [one, two] = await Promise.all([
      rosterRuntimeDraftKey('reviewer'),
      rosterRuntimeDraftKey('executor'),
    ]);
    expect(one).not.toBe(two);
    expect(one).toMatch(/^roster-runtime:[a-f0-9]{64}$/);
  });
  it('round-trips base and draft and refuses another role or oversized drafts', () => {
    const value = { base: { budget: { toolCalls: 10 } }, draft: { budget: { toolCalls: 55 } } };
    const saved = rosterRuntimeCodec('reviewer').serialize(value);
    expect(rosterRuntimeCodec('reviewer').parse(JSON.parse(JSON.stringify(saved)))).toEqual(value);
    expect(() => rosterRuntimeCodec('executor').parse(saved)).toThrow(/another role/);
    expect(() =>
      rosterRuntimeCodec('reviewer').parse({ ...(saved as object), draft: [] }),
    ).toThrow();
    expect(() =>
      rosterRuntimeCodec('reviewer').parse({
        ...(saved as object),
        draft: { note: 'x'.repeat(256 * 1024) },
      }),
    ).toThrow();
  });
});
