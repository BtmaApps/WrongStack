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
  it('treats an unquoted escape as a literal argument character', () => {
    expect(parseAutomationCommands('program escaped\\ space back\\\\slash')).toEqual([
      ['program', 'escaped space', 'back\\slash'],
    ]);
  });
  it('ignores leading, repeated and trailing whitespace without adding empty argv entries', () => {
    expect(parseAutomationCommands('  bun   run test  \n\t\n')).toEqual([['bun', 'run', 'test']]);
  });
  it('round-trips JSON escape sequences (\\t, \\n, \\r, \\b, \\f, \\uXXXX) inside double quotes (F789)', () => {
    const commands = [
      ['printf', 'col1\tcol2\nrow2\r\n'],
      ['node', '-e', 'bell:\b form:\f nul:\x00 esc:\x1b'],
    ];
    expect(parseAutomationCommands(formatAutomationCommands(commands))).toEqual(commands);
  });
});
