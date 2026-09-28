/**
 * Git's conflict-marker grammar: exactly `conflict-marker-size` (default 7)
 * marker chars, then a space + label or end of line; `=======` takes no label.
 *
 * The resolver used to match a 7-char PREFIX, so a markdown/reST setext
 * underline (`==========`) inside a hunk read as the divider: the output mixed
 * both sides, carried no marker, and the WorktreeManager committed it. The same
 * underline outside a hunk made every resolution of the file "unresolved".
 */
import { describe, expect, it } from 'vitest';
import { hasConflictMarkers, resolveConflictText } from '../src/conflict-resolver.js';

const J = (...lines: string[]) => lines.join('\n');

describe('resolveConflictText — marker grammar', () => {
  const SETEXT_HUNK = J(
    '<<<<<<< HEAD',
    'Title A',
    '==========',
    'ours intro',
    '=======',
    'Title B',
    '===========',
    'theirs intro',
    '>>>>>>> branch',
    'tail',
  );

  it('does not read a setext underline inside a hunk as the divider', () => {
    expect(resolveConflictText(SETEXT_HUNK, 'incoming')).toBe(
      J('Title B', '===========', 'theirs intro', 'tail'),
    );
    expect(resolveConflictText(SETEXT_HUNK, 'base')).toBe(
      J('Title A', '==========', 'ours intro', 'tail'),
    );
  });

  it('matches the marker size of the hunk (conflict-marker-size=10, diff3)', () => {
    const text = J(
      '<<<<<<<<<< HEAD',
      'ours',
      '=======',
      '|||||||||| base',
      'b',
      '==========',
      'theirs',
      '>>>>>>>>>> side',
    );
    expect(resolveConflictText(text, 'base')).toBe(J('ours', '======='));
    expect(resolveConflictText(text, 'incoming')).toBe('theirs');
  });

  it('keeps CRLF content lines intact', () => {
    const text = 'a\r\n<<<<<<< HEAD\r\no\r\n=======\r\nt\r\n>>>>>>> b\r\nz';
    expect(resolveConflictText(text, 'incoming')).toBe('a\r\nt\r\nz');
  });

  it('returns an unterminated hunk unchanged instead of dropping the rest', () => {
    const text = J('keep-1', '<<<<<<< HEAD', 'keep-2', 'keep-3');
    expect(resolveConflictText(text, 'incoming')).toBe(text);
    expect(hasConflictMarkers(resolveConflictText(text, 'incoming'))).toBe(true);
  });

  it('does not treat a marker-char run without a space as a start marker', () => {
    expect(resolveConflictText(J('<<<<<<<<text', 'x'), 'incoming')).toBe(J('<<<<<<<<text', 'x'));
  });
});

describe('hasConflictMarkers — marker grammar', () => {
  it('ignores a setext underline', () => {
    expect(hasConflictMarkers(J('Overview', '==========', 'body'))).toBe(false);
    expect(hasConflictMarkers(J('Overview', '=======', 'body'))).toBe(false);
  });

  it('flags labelled and bare start / base / end markers', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD')).toBe(true);
    expect(hasConflictMarkers('|||||||')).toBe(true);
    expect(hasConflictMarkers('x\r\n>>>>>>>>>> side\r\n')).toBe(true);
  });
});
