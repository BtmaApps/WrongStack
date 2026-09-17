import { describe, expect, it } from 'vitest';
import { matchesCommandTrust, matchesTrust } from '../../src/security/permission-helpers.js';
import { escapeGlobSubject, subjectForToolInput } from '../../src/utils/tool-subject.js';

/**
 * Regression for the over-broad `git` trust subject found by the 2026-08-20
 * security-check audit.
 *
 * A shell tool's subject is its whole command line, so a trust rule is as
 * specific as the invocation. `git` has no argv array — its parameters are
 * named fields — and `subjectKey: 'command'` yields an enum subcommand. Every
 * `git push`, to any branch, with or without `force`, therefore rendered to the
 * subject `"push"`, and a single "always allow" covered all of them.
 */

const GIT_FIELDS = ['branch', 'force', 'worktreeAction', 'worktreePath', 'newBranch'] as const;

const subject = (input: Record<string, unknown>) =>
  subjectForToolInput('git', input, 'command', GIT_FIELDS);

describe('git subjects distinguish invocations that differ in effect', () => {
  it('separates a force push from an ordinary one', () => {
    const plain = subject({ command: 'push', branch: 'main' });
    const forced = subject({ command: 'push', branch: 'main', force: true });

    expect(plain).not.toBe(forced);
    expect(forced).toContain('force=true');
  });

  it('separates pushes to different branches', () => {
    expect(subject({ command: 'push', branch: 'main' })).not.toBe(
      subject({ command: 'push', branch: 'release' }),
    );
  });

  it('separates worktree add from worktree remove', () => {
    expect(subject({ command: 'worktree', worktreeAction: 'add', worktreePath: '../wt' })).not.toBe(
      subject({ command: 'worktree', worktreeAction: 'remove', worktreePath: '../wt' }),
    );
  });

  it('keeps a bare subcommand short when no extra field is supplied', () => {
    // The common case must stay readable — the prompt shows this string.
    expect(subject({ command: 'status' })).toBe('status');
  });

  it('omits false and empty fields rather than rendering them', () => {
    expect(subject({ command: 'push', branch: '', force: false })).toBe('push');
  });

  it('still separates a dry-run commit from a real one', () => {
    const dry = subject({ command: 'commit', message: 'x', dry_run: true });
    const real = subject({ command: 'commit', message: 'x' });

    expect(dry).not.toBe(real);
    expect(dry).toMatch(/dry-run$/);
  });
});

describe('tools without subjectFields are unaffected', () => {
  it('renders a bash command line exactly as before', () => {
    expect(subjectForToolInput('bash', { command: 'git status' }, 'command')).toBe('git status');
  });

  it('renders an exec command with its args as before', () => {
    expect(subjectForToolInput('exec', { command: 'node', args: ['-e', 'x'] }, 'command')).toBe(
      'node -e x',
    );
  });
});

describe('exec argv subjects are injective over quote-containing arguments', () => {
  // Regression (round 2026-09-17-r6): renderCommandLine quoted an argument
  // only when it contained whitespace, leaving double quotes RAW inside
  // unquoted args — argv ['"a', 'b"'] rendered identically to argv ['a b'],
  // so trusting one exec invocation silently authorized a different one.
  const execSubject = (args: unknown[]) =>
    subjectForToolInput('exec', { command: 'node', args }, 'command');

  it('separates one whitespace arg from two args that splice into its rendering', () => {
    expect(execSubject(['script.js', 'a b'])).not.toBe(execSubject(['script.js', '"a', 'b"']));
  });

  it('escapes raw double quotes inside unquoted args', () => {
    expect(execSubject(['script.js', '"a', 'b"'])).toBe('node script.js \\"a b\\"');
  });

  it('keeps quote-free args rendering exactly as before', () => {
    expect(execSubject(['script.js', 'hello'])).toBe('node script.js hello');
    expect(execSubject(['script.js', 'a b'])).toBe('node script.js "a b"');
  });

  it('escapes raw double quotes inside subject fields too', () => {
    expect(subject({ command: 'push', branch: 'a"b' })).toBe('push branch=a\\"b');
  });
});

describe('escapeGlobSubject output is literal under compileGlob grammar', () => {
  // Regression (round 2026-09-17-r7): escapeGlobSubject emitted backslash
  // escapes (`\*`), but compileGlob's grammar treats `\` as a LITERAL — `\*`
  // parsed as literal backslash + a LIVE wildcard, so a stored always-trust
  // pattern also matched later, different `\`-bearing subjects without
  // prompting (over-grant).
  it('emits class-form literals, not backslash escapes', () => {
    expect(escapeGlobSubject('a*b')).toBe('a[*]b');
    expect(escapeGlobSubject('a?b')).toBe('a[?]b');
    expect(escapeGlobSubject('a[b')).toBe('a[[]b');
    expect(escapeGlobSubject('a]b')).toBe('a[]]b');
  });

  it('a stored `*`-bearing rule must not match a different backslash subject', () => {
    const pattern = escapeGlobSubject('git add *');
    const later = escapeGlobSubject('git add \\ --upload-payload');
    expect(matchesCommandTrust([pattern], later)).toBe(false);
    expect(matchesCommandTrust([pattern], pattern)).toBe(true); // identical still matches
  });

  it('a stored `[`-bearing rule must not match a different bracket-exploit subject', () => {
    const pattern = escapeGlobSubject('grep foo[0-9] bar');
    const later = escapeGlobSubject('grep foo\\5 bar');
    expect(matchesCommandTrust([pattern], later)).toBe(false);
  });

  it('path subjects: a stored escaped path must not match a different path', () => {
    const pattern = escapeGlobSubject('src/*');
    const later = escapeGlobSubject('src/\\secrets');
    expect(matchesTrust([pattern], later)).toBe(false);
    expect(matchesTrust([pattern], pattern)).toBe(true);
  });
});
