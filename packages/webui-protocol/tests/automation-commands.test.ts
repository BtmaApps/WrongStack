import { describe, expect, it } from 'vitest';
import { formatAutomationCommands, parseAutomationCommands } from '../src/automation-commands.js';

describe('automation command authoring', () => {
  it('round trips spaced paths and literal shell metacharacters without expansion', () => {
    const commands = [
      ['bun', 'run', 'test'],
      ['program', 'a b', 'C:\\project path\\a', '$(secret);x', '', '"quoted"'],
    ];
    expect(parseAutomationCommands(formatAutomationCommands(commands))).toEqual(commands);
    expect(parseAutomationCommands("bun run 'test suite'\n\nbun run lint")).toEqual([
      ['bun', 'run', 'test suite'],
      ['bun', 'run', 'lint'],
    ]);
  });
  it('rejects unfinished input instead of running a different command', () => {
    expect(() => parseAutomationCommands('bun "unfinished')).toThrow('unclosed quote');
    expect(() => parseAutomationCommands('bun trailing\\')).toThrow('unfinished escape');
  });
  it('ignores leading, repeated and trailing whitespace without adding empty argv entries', () => {
    expect(parseAutomationCommands('  bun   run test  \n\t\n')).toEqual([['bun', 'run', 'test']]);
  });
});
