import { describe, expect, it } from 'vitest';
import {
  assignNickname,
  getAllNicknameKeys,
  nicknameKeyFromDisplay,
} from '../src/subagent-nicknames.js';

describe('assignNickname', () => {
  it('returns a canonical key plus a "Name (Role)" display string', () => {
    const { key, display } = assignNickname('bug-hunter', new Set());
    expect(key).toBe('darwin'); // first DOMAIN_PREFERENCES entry for bug-hunter
    expect(display).toBe('Darwin (Bug Hunter)');
  });

  it('skips already-used keys', () => {
    const used = new Set<string>(['darwin']);
    const { key } = assignNickname('bug-hunter', used);
    expect(key).toBe('curie');
  });

  it('falls back to the default chain, then round-robin, then a synthetic key', () => {
    // Use up every real key in the pool.
    const used = new Set<string>(getAllNicknameKeys());
    const { key, display } = assignNickname('whatever', used);
    expect(key).toBe(`scientist-${used.size + 1}`);
    expect(display).toMatch(/^Scientist #\d+ \(Whatever\)$/);
  });

  it('never hands out a duplicate key across a full fleet of spawns', () => {
    const used = new Set<string>();
    const roles = ['backend', 'architect', 'backend', 'database', 'backend'];
    const keys: string[] = [];
    for (const role of roles) {
      const { key } = assignNickname(role, used);
      used.add(key);
      keys.push(key);
    }
    expect(new Set(keys).size).toBe(keys.length); // all unique
  });

  it('records the correct key for multi-word names (Von Neumann regression)', () => {
    // 'architect' prefers von-neumann first. The old code parsed the display
    // string with split(' ')[0] → "von", which never matched the pool key
    // "von-neumann", so the slot was never marked used and could be re-handed.
    const used = new Set<string>();
    const first = assignNickname('architect', used);
    expect(first.key).toBe('von-neumann');
    expect(first.display).toBe('Von Neumann (Architect)');
    used.add(first.key);

    // A second architect must NOT get Von Neumann again.
    const second = assignNickname('architect', used);
    expect(second.key).not.toBe('von-neumann');
    expect(second.display).not.toContain('Von Neumann');
  });
});

describe('nicknameKeyFromDisplay', () => {
  it('resolves single-word display strings back to their key', () => {
    expect(nicknameKeyFromDisplay('Einstein (Bug Hunter)')).toBe('einstein');
  });

  it('resolves multi-word and hyphenated names correctly', () => {
    expect(nicknameKeyFromDisplay('Von Neumann (Architect)')).toBe('von-neumann');
    expect(nicknameKeyFromDisplay('Berners-Lee (Backend)')).toBe('berners-lee');
  });

  it('resolves accented names', () => {
    expect(nicknameKeyFromDisplay('Schrödinger (Critic)')).toBe('schrodinger');
    expect(nicknameKeyFromDisplay('Poincaré (Planner)')).toBe('poincare');
  });

  it('round-trips every pool nickname through assign → key-from-display', () => {
    const used = new Set<string>();
    for (let i = 0; i < getAllNicknameKeys().length; i++) {
      const { key, display } = assignNickname('default', used);
      expect(nicknameKeyFromDisplay(display)).toBe(key);
      used.add(key);
    }
  });

  it('resolves synthetic "Scientist #N" displays', () => {
    expect(nicknameKeyFromDisplay('Scientist #7 (Worker)')).toBe('scientist-7');
  });

  it('returns undefined for unknown names', () => {
    expect(nicknameKeyFromDisplay('Bob (Backend)')).toBeUndefined();
  });
});
