import { describe, expect, it } from 'vitest';
import { buildAutomationResult } from '../src/automation/result.js';

// Sections the production PATCH command (`git diff --cached --binary`) emits
// WITHOUT `---`/`+++` headers. They used to vanish from changedFiles, so a run
// that only added an image or renamed a file reported "none detected".
const changed = (patch: string) => buildAutomationResult('', patch, 0).changedFiles;

describe('automation changed files for header-less patch sections', () => {
  it('lists a binary file', () => {
    const patch = [
      'diff --git a/logo.png b/logo.png',
      'new file mode 100644',
      'index 0000000..a0afbe7',
      'GIT binary patch',
      'literal 12',
      'TcmeAS@N;KiU|?ioX7~>P5QqYF',
      '',
      'literal 0',
      'HcmV?d00001',
      '',
    ].join('\n');
    expect(changed(patch)).toEqual(['logo.png']);
  });

  it('lists an empty new file and a mode-only change', () => {
    const patch = [
      'diff --git a/empty.txt b/empty.txt',
      'new file mode 100644',
      'index 0000000..e69de29',
      'diff --git a/script.sh b/script.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n');
    expect(changed(patch)).toEqual(['empty.txt', 'script.sh']);
  });

  it('lists both sides of a pure rename, but only the target of a copy', () => {
    const patch = [
      'diff --git a/old.txt b/renamed.txt',
      'similarity index 100%',
      'rename from old.txt',
      'rename to renamed.txt',
      'diff --git a/src.txt b/dup.txt',
      'similarity index 100%',
      'copy from src.txt',
      'copy to dup.txt',
    ].join('\n');
    expect(changed(patch)).toEqual(['old.txt', 'renamed.txt', 'dup.txt']);
  });

  it('decodes quoted names and keeps spaces in header-only sections', () => {
    const patch = [
      'diff --git "a/\\303\\247 x.bin" "b/\\303\\247 x.bin"',
      'new file mode 100644',
      'GIT binary patch',
      'literal 1',
      'IcmZo*0000',
      '',
      'diff --git a/my file.sh b/my file.sh',
      'old mode 100644',
      'new mode 100755',
      'diff --git a/a b/c.txt b/a b/c.txt',
      'old mode 100644',
      'new mode 100755',
    ].join('\n');
    expect(changed(patch)).toEqual(['ç x.bin', 'my file.sh', 'a b/c.txt']);
  });

  it('does not double-list a text section that has headers', () => {
    const patch = [
      'diff --git a/a.ts b/a.ts',
      'index 1..2 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-x',
      '+y',
    ].join('\n');
    expect(changed(patch)).toEqual(['a.ts']);
  });
});
