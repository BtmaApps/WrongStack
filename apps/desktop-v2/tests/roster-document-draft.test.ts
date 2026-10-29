import { describe, expect, it } from 'vitest';
import { rosterDocumentCodec, rosterDocumentDraftKey } from '../src/roster-document-draft';

const owner = { role: 'reviewer', kind: 'skill', skill: 'security' };
describe('roster document drafts', () => {
  it('keys each role document separately', async () => {
    const keys = await Promise.all([
      rosterDocumentDraftKey(owner),
      rosterDocumentDraftKey({ ...owner, skill: 'testing' }),
      rosterDocumentDraftKey({ ...owner, kind: 'learned', skill: '' }),
      rosterDocumentDraftKey({ ...owner, role: 'executor' }),
    ]);
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(key).toMatch(/^roster-document:[a-f0-9]{64}$/);
  });
  it('round-trips base and text and refuses other owners', () => {
    const saved = rosterDocumentCodec(owner).serialize({ base: 'stored', text: 'edited' });
    expect(rosterDocumentCodec(owner).parse(saved)).toEqual({ base: 'stored', text: 'edited' });
    for (const other of [
      { ...owner, role: 'executor' },
      { ...owner, kind: 'identity' },
      { ...owner, skill: 'testing' },
    ])
      expect(() => rosterDocumentCodec(other).parse(saved)).toThrow(/another owner/);
    expect(() =>
      rosterDocumentCodec(owner).parse({ ...(saved as object), text: 'x'.repeat(1024 * 1024 + 1) }),
    ).toThrow();
  });
});
