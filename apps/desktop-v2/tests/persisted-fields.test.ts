import { describe, expect, it } from 'vitest';
import { fieldsCodec } from '../src/usePersistedFields';

describe('persisted form inputs', () => {
  const codec = fieldsCodec('requirement-resource-input:new', ['name', 'reference']);
  it('round-trips listed string fields for its owner', () => {
    const saved = codec.serialize({ name: 'Design brief', reference: 'docs/brief.md' });
    expect(codec.parse(JSON.parse(JSON.stringify(saved)))).toEqual({
      name: 'Design brief',
      reference: 'docs/brief.md',
    });
    expect(codec.parse(null)).toBeNull();
  });
  it('refuses another owner, unknown fields and oversized or non-text values', () => {
    const saved = codec.serialize({ name: 'x' }) as Record<string, unknown>;
    expect(() =>
      fieldsCodec('requirement-resource-input:reqi_1', ['name', 'reference']).parse(saved),
    ).toThrow(/another form/);
    for (const fields of [{ other: 'x' }, { name: 7 }, { name: 'x'.repeat(2001) }, []])
      expect(() => codec.parse({ ...saved, fields })).toThrow(/unsupported format/);
  });
});
