import { beforeEach, describe, expect, it, vi } from 'vitest';

// `web-tree-sitter` is mocked so the grammar load can fail on demand; the module
// under test is the real one (cache, integrity gate and all).
const loadMock = vi.hoisted(() => vi.fn());
vi.mock('web-tree-sitter', () => ({
  Parser: Object.assign(function Parser() {}, { init: vi.fn(async () => {}) }),
  Language: { load: loadMock },
}));

import { loadTreeSitterLanguage } from '../src/codebase-index/tree-sitter-parser.js';

beforeEach(() => {
  loadMock.mockReset();
});

describe('tree-sitter grammar load cache', () => {
  it('reuses a successfully loaded grammar', async () => {
    const lang = { name: 'java-lang' };
    loadMock.mockResolvedValue(lang);
    await expect(loadTreeSitterLanguage('java')).resolves.toBe(lang);
    await expect(loadTreeSitterLanguage('java')).resolves.toBe(lang);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient load failure instead of caching the rejection', async () => {
    const lang = { name: 'c-lang' };
    loadMock.mockRejectedValueOnce(new Error('EMFILE: too many open files'));
    loadMock.mockResolvedValue(lang);
    await expect(loadTreeSitterLanguage('c')).rejects.toThrow(/EMFILE/);
    await expect(loadTreeSitterLanguage('c')).resolves.toBe(lang);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent callers, then retries a failure', async () => {
    const lang = { name: 'ruby-lang' };
    let rejectFirst: (error: Error) => void = () => {};
    loadMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    loadMock.mockResolvedValue(lang);

    const a = loadTreeSitterLanguage('ruby');
    const b = loadTreeSitterLanguage('ruby');
    // Let both callers reach the pending Language.load before it fails.
    await vi.waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1));
    rejectFirst(new Error('EBUSY: resource busy'));
    await expect(a).rejects.toThrow(/EBUSY/);
    await expect(b).rejects.toThrow(/EBUSY/);
    expect(loadMock).toHaveBeenCalledTimes(1);

    await expect(loadTreeSitterLanguage('ruby')).resolves.toBe(lang);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a permanent failure cached (a language with no registered grammar)', async () => {
    // `go` has no default grammar unless WRONGSTACK_USE_TS_GO is set.
    const saved = process.env['WRONGSTACK_USE_TS_GO'];
    delete process.env['WRONGSTACK_USE_TS_GO'];
    try {
      await expect(loadTreeSitterLanguage('go')).rejects.toThrow(/no grammar registered/);
      await expect(loadTreeSitterLanguage('go')).rejects.toThrow(/no grammar registered/);
      expect(loadMock).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env['WRONGSTACK_USE_TS_GO'] = saved;
    }
  });
});
