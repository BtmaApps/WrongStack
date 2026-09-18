import { describe, expect, it } from 'vitest';
import {
  detectSkillMention,
  extractSkillMentions,
  insertSkillMention,
  matchSkillMentions,
  preserveSkillMentions,
} from '../../src/skills/mentions.js';

describe('skill mention syntax', () => {
  it('preserves explicit selections through refinement without duplicating them', () => {
    expect(preserveSkillMentions('$testing check this', 'Check the changes.')).toBe(
      '$testing\n\nCheck the changes.',
    );
    expect(preserveSkillMentions('$testing check this', '$testing Check the changes.')).toBe(
      '$testing Check the changes.',
    );
    expect(preserveSkillMentions('Explain `$testing`', 'Explain the token.')).toBe(
      'Explain the token.',
    );
  });
  it('detects an empty query and a token at the cursor', () => {
    expect(detectSkillMention('Review $', 8)).toEqual({ start: 7, end: 8, query: '' });
    expect(detectSkillMention('$code-review please', 5)).toEqual({
      start: 0,
      end: 12,
      query: 'code',
    });
  });
  it('leaves code, escaped dollars, shell variables and paths alone', () => {
    expect(
      extractSkillMentions(
        '`$code-review` ```sh\n$testing\n``` \\$debugging $HOME $env:PATH $foo/bar',
      ),
    ).toEqual([]);
    expect(detectSkillMention('`$testing', 9)).toBeNull();
    expect(detectSkillMention('$env:PATH', 4)).toBeNull();
  });
  it('supports multiple deduplicated mentions and punctuation', () => {
    expect(extractSkillMentions('Use $testing. Do not load $testing.md')).toEqual(['testing']);
    expect(extractSkillMentions('$code-review and ($testing), then $code-review')).toEqual([
      'code-review',
      'testing',
    ]);
  });
  it('replaces the whole token without destroying surrounding draft text', () => {
    const text = 'Check $code-review\nKeep  spacing';
    const mention = detectSkillMention(text, 11)!;
    expect(insertSkillMention(text, mention, 'testing')).toEqual({
      text: 'Check $testing \nKeep  spacing',
      cursor: 15,
    });
  });
  it('matches both names and descriptions, with name prefixes first', () => {
    const skills = [
      { name: 'testing', description: 'Review tests' },
      { name: 'review', description: 'Inspect code' },
    ];
    expect(matchSkillMentions(skills, 'rev').map((skill) => skill.name)).toEqual([
      'review',
      'testing',
    ]);
  });
});
