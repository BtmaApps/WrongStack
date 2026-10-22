import { describe, expect, it } from 'vitest';
import { buildAutomationResult } from '../src/automation/result.js';

describe('automation changed-file metadata', () => {
  it.each(['+++ b/phantom.txt', '--- a/phantom.txt'])(
    'ignores header-like hunk content %s',
    (content) => {
      const patch = [
        'diff --git a/real.txt b/real.txt',
        '--- a/real.txt',
        '+++ b/real.txt',
        '@@ -1 +1 @@',
        content,
        'diff --git a/next.txt b/next.txt',
        '--- a/next.txt',
        '+++ b/next.txt',
        '@@ -0,0 +1 @@',
        '+ordinary',
      ].join('\n');
      expect(buildAutomationResult('', patch, 0).changedFiles).toEqual(['real.txt', 'next.txt']);
    },
  );
});
