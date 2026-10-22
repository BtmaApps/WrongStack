import { expect, it } from 'vitest';
import { countUnifiedDiffLines } from '../../src/utils/unified-diff-count.js';

it.each(['-- \n2.49.0\n', '-outside hunk\n+outside hunk\n', ''])(
  'ignores non-hunk trailer %j',
  (trailer) => {
    const patch = '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n';
    expect(countUnifiedDiffLines(patch + trailer)).toEqual({ added: 1, removed: 1 });
  },
);
