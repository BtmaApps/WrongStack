import { describe, expect, it } from 'vitest';
import {
  brainTargetsDraft,
  brainTargetsPatch,
  brainTargetsWire,
  emptyBrainSeat,
  emptyBrainVoter,
  mergeBrainPatches,
  verifyBrainTargets,
} from '../src/brain-targets-model';

const config = {
  models: [{ provider: 'vendor', model: 'org/first' }, { model: 'inherited-provider' }],
  strategy: 'fallback',
  council: {
    voters: [{ provider: 'vendor', model: 'vote', persona: 'custom lens', weight: 2, veto: false }],
    judge: { provider: 'other', model: 'judge' },
  },
};
describe('Brain model and council editing', () => {
  it('keeps seat rotation order and tri-state veto independent of explicit voter models', () => {
    const base = brainTargetsDraft(config);
    const seats = [
      { persona: ' security ', veto: 'no' as const },
      { persona: 'custom lens', veto: 'default' as const },
      { persona: 'skeptic', veto: 'yes' as const },
    ];
    const patch = brainTargetsPatch(base, { ...base, seats }, base);
    expect(patch).toEqual({
      council: {
        seats: [
          { persona: 'security', veto: false },
          { persona: 'custom lens' },
          { persona: 'skeptic', veto: true },
        ],
      },
    });
    const saved = { ...config, council: { ...config.council, ...(patch.council as object) } };
    expect(() => verifyBrainTargets(patch, saved)).not.toThrow();
    const loaded = brainTargetsDraft(saved);
    expect(loaded.seats.map((seat) => seat.veto)).toEqual(['no', 'default', 'yes']);
    expect(brainTargetsPatch(loaded, { ...loaded, seats: [] }, loaded)).toEqual({
      council: { seats: null },
    });
    expect(() => verifyBrainTargets({ council: { seats: null } }, config)).not.toThrow();
    expect(() => verifyBrainTargets(patch, config)).toThrow(/seats did not match/);
    expect(brainTargetsPatch(base, { ...base, seats }, { ...base, voters: [] })).toEqual(patch);
    expect(() =>
      brainTargetsPatch(
        base,
        { ...base, seats },
        { ...base, seats: [{ persona: 'executor', veto: 'default' }] },
      ),
    ).toThrow(/seats changed elsewhere/);
    expect(() => brainTargetsWire({ ...base, seats: [emptyBrainSeat()] })).toThrow(
      /needs a decision lens/,
    );
  });
  it('preserves provider ownership, model namespaces, lens defaults and explicit false veto', () => {
    const base = brainTargetsDraft(config);
    expect(brainTargetsPatch(base, base, base)).toEqual({});
    const wire = brainTargetsWire({
      ...base,
      voters: [...base.voters, { ...emptyBrainVoter(), model: 'org/new' }],
    });
    expect(wire.models?.[0]).toEqual({ provider: 'vendor', model: 'org/first' });
    expect(wire.voters).toEqual([
      { provider: 'vendor', model: 'vote', persona: 'custom lens', weight: 2, veto: false },
      { model: 'org/new' },
    ]);
    const edited = { ...base, judge: { provider: '', model: '' }, pool: [], voters: [] };
    expect(brainTargetsPatch(base, edited, base)).toEqual({
      models: null,
      council: { voters: null, judge: null },
    });
    expect(() =>
      verifyBrainTargets(
        { models: null, council: { voters: null, judge: null } },
        { models: [], council: { voters: [] } },
      ),
    ).not.toThrow();
  });
  it('merges independent policy edits, keeps array order atomic and refuses stale targets', () => {
    const base = brainTargetsDraft(config),
      reversed = { ...base, pool: [...base.pool].reverse() };
    expect(brainTargetsPatch(base, reversed, { ...base, strategy: 'round-robin' })).toHaveProperty(
      'models',
      brainTargetsWire(reversed).models,
    );
    expect(() =>
      brainTargetsPatch(base, reversed, {
        ...base,
        pool: [{ provider: 'elsewhere', model: 'new' }],
      }),
    ).toThrow(/models changed elsewhere/);
    expect(
      mergeBrainPatches(
        { council: { quorum: 0.75 }, cache: { enabled: true } },
        { council: { judge: null, voters: [] }, models: null },
      ),
    ).toEqual({
      cache: { enabled: true },
      models: null,
      council: { quorum: 0.75, judge: null, voters: [] },
    });
    expect(() => verifyBrainTargets({ models: null }, config)).toThrow(/did not match/);
  });
  it('rejects empty rows and invalid weights, while canonical no-op edits do not write', () => {
    const base = brainTargetsDraft(config);
    expect(() => brainTargetsWire({ ...base, voters: [emptyBrainVoter()] })).toThrow(
      /needs a model ID/,
    );
    for (const weight of ['0', '-1', 'Infinity', 'bad'])
      expect(() => brainTargetsWire({ ...base, voters: [{ ...base.voters[0]!, weight }] })).toThrow(
        /positive vote weight/,
      );
    expect(
      brainTargetsPatch(
        base,
        { ...base, pool: base.pool.map((row) => ({ ...row, model: ` ${row.model} ` })) },
        base,
      ),
    ).toEqual({});
    expect(() => brainTargetsWire({ ...base, judge: { provider: 'vendor', model: '' } })).toThrow(
      /Council judge needs/,
    );
  });
});
