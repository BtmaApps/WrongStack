/**
 * An agent leading the session (ACP, WrongForge) is not gated on required
 * skills, so the `wrongstack:required-skills` marker is rewritten into a plain
 * instruction naming the skill tool that route offers.
 */
import { describe, expect, it } from 'vitest';
import {
  externalSkillDirective,
  externalSkillLoader,
} from '../src/acp-leader/acp-leader-skills.js';

const PROMPT = [
  '## Required skills',
  '<!-- wrongstack:required-skills bug-hunter debugging -->',
  'Load each with the `skill` tool: $bug-hunter, $debugging.',
].join('\n');

describe('external leader skill directive', () => {
  it('names the route skill tool in place of the marker', () => {
    const text = externalSkillDirective(PROMPT, 'wstack_skill');
    expect(text).not.toContain('<!--');
    expect(text).toContain("This task's playbook skills: bug-hunter, debugging.");
    expect(text).toContain('load each with the `wstack_skill` tool');
    expect(text).toContain('Load each with the `skill` tool: $bug-hunter, $debugging.');
  });

  it('says so when the route offers no WrongStack skill tool', () => {
    const text = externalSkillDirective(PROMPT, undefined);
    expect(text).toContain('offers no WrongStack skill tool');
    expect(text).not.toContain('<!--');
  });

  it('keeps one directive for repeated markers and leaves plain text alone', () => {
    const twice = `${PROMPT}\n<!-- wrongstack:required-skills testing -->`;
    const text = externalSkillDirective(twice, 'wstack_skill');
    expect(text.match(/\[WrongStack\]/g)).toHaveLength(1);
    expect(text).not.toContain('<!--');
    expect(externalSkillDirective('fix the bug', 'wstack_skill')).toBe('fix the bug');
  });

  it('resolves the loader name only when the route offers `skill`', () => {
    expect(externalSkillLoader(['delegate', 'skill'], 'mcp__wrongstack-fleet__')).toBe(
      'mcp__wrongstack-fleet__skill',
    );
    expect(externalSkillLoader(['delegate'], 'wstack_')).toBeUndefined();
    expect(externalSkillLoader(undefined, 'wstack_')).toBeUndefined();
  });
});
