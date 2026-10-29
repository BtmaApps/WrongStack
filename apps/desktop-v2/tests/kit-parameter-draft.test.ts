import { describe, expect, it } from 'vitest';
import { DurableFormDraft, type FormDraftStorage } from '../src/durable-form-draft';
import {
  type KitParameterDraft,
  kitParameterCodec,
  kitParameterKey,
  kitSchemaFingerprint,
} from '../src/kit-parameter-draft';

/** Mirrors the native compare-and-set contract of `form-draft.save`. */
function nativeSlot() {
  const slot = { revision: 0, value: null as unknown };
  const storage: FormDraftStorage = {
    get: async () => structuredClone(slot),
    save: async (value, expected) => {
      if (expected !== slot.revision)
        throw Error('DRAFT_CONFLICT: This draft changed in another window');
      slot.revision++;
      slot.value = JSON.parse(JSON.stringify(value));
      return slot.revision;
    },
  };
  return { slot, storage };
}
const schema = 'a'.repeat(64);
const draft = (input: unknown): KitParameterDraft => ({ kit: 'release.notes', schema, input });

describe('kit parameter codec', () => {
  it('round-trips unfinished and overflowed numbers at their exact positions', () => {
    const codec = kitParameterCodec('release.notes');
    const input = {
      count: Number.NaN,
      limits: [1, Number.POSITIVE_INFINITY, { floor: Number.NEGATIVE_INFINITY }],
      label: null,
    };
    const stored = JSON.parse(JSON.stringify(codec.serialize(draft(input))));
    const back = codec.parse(stored)!;
    expect(Number.isNaN((back.input as { count: number }).count)).toBe(true);
    expect(back.input).toEqual(input);
    expect((back.input as { label: null }).label).toBeNull();
  });

  it('refuses another kit, unknown formats and prototype paths', () => {
    const stored = kitParameterCodec('release.notes').serialize(draft({ n: Number.NaN })) as Record<
      string,
      unknown
    >;
    expect(() => kitParameterCodec('other.kit').parse(stored)).toThrow(/another kit/);
    expect(() => kitParameterCodec('release.notes').parse({ ...stored, version: 2 })).toThrow();
    for (const path of [['__proto__'], ['constructor'], [-1], ['missing']])
      expect(() =>
        kitParameterCodec('release.notes').parse({
          ...stored,
          special: [{ path, value: 'NaN' }],
        }),
      ).toThrow(/unsupported format/);
    expect(kitParameterCodec('release.notes').parse(null)).toBeNull();
  });

  it('fingerprints the input contract independent of key order', async () => {
    const one = await kitSchemaFingerprint({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
    });
    const same = await kitSchemaFingerprint({
      properties: { b: { type: 'number' }, a: { type: 'string' } },
      type: 'object',
    });
    const changed = await kitSchemaFingerprint({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
    });
    expect(one).toBe(same);
    expect(one).not.toBe(changed);
    expect(await kitParameterKey('release.notes')).toMatch(/^kit-parameters:[a-f0-9]{64}$/);
  });
});

describe('durable form draft', () => {
  it('autosaves, then stops for review instead of overwriting a peer window', async () => {
    const { slot, storage } = nativeSlot();
    const codec = kitParameterCodec('release.notes');
    const mine = new DurableFormDraft(storage, codec);
    const peer = new DurableFormDraft(storage, codec);
    await mine.load();
    await peer.load();
    mine.edit(draft({ n: 1 }));
    await mine.flush();
    peer.edit(draft({ n: 2 }));
    await peer.flush();
    expect(peer.snapshot().review?.value?.input).toEqual({ n: 1 });
    expect(slot.revision).toBe(1);
    // Keeping local values writes over the reviewed revision only.
    expect(await peer.resolve('local')).toBe(true);
    expect(codec.parse(slot.value)?.input).toEqual({ n: 2 });
    mine.edit(draft({ n: 3 }));
    await mine.flush();
    expect(mine.snapshot().review?.value?.input).toEqual({ n: 2 });
    expect(await mine.resolve('saved')).toBe(true);
    expect(mine.snapshot().value?.input).toEqual({ n: 2 });
  });

  it('clears only the submitted values and keeps later edits', async () => {
    const { slot, storage } = nativeSlot();
    const form = new DurableFormDraft(storage, kitParameterCodec('release.notes'));
    await form.load();
    form.edit(draft({ n: 1 }));
    const submitted = form.snapshot().value;
    form.edit(draft({ n: 2 }));
    expect(await form.clear(submitted)).toBe(false);
    expect(kitParameterCodec('release.notes').parse(slot.value)?.input).toEqual({ n: 2 });
    expect(await form.clear(form.snapshot().value)).toBe(true);
    expect(slot.value).toBeNull();
    expect(form.snapshot().value).toBeNull();
  });

  it('refuses cleanup that would erase a newer peer draft', async () => {
    const { slot, storage } = nativeSlot();
    const codec = kitParameterCodec('release.notes');
    const form = new DurableFormDraft(storage, codec);
    await form.load();
    form.edit(draft({ n: 1 }));
    await form.flush();
    const peer = new DurableFormDraft(storage, codec);
    await peer.load();
    peer.edit(draft({ n: 9 }));
    await peer.flush();
    expect(await form.clear(form.snapshot().value)).toBe(false);
    expect(codec.parse(slot.value)?.input).toEqual({ n: 9 });
    expect(form.snapshot().review?.value?.input).toEqual({ n: 9 });
  });
});
