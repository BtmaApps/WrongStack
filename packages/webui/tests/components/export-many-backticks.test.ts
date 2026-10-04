// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ text: '', captured: '' }));
vi.mock('@/stores', () => ({
  useChatStore: {
    getState: () => ({
      messages: [{ role: 'system', thinkingLog: { text: seam.text, durationMs: 1, iteration: 1 } }],
    }),
  },
  useSessionStore: { getState: () => ({ projectName: 'fixture' }) },
}));

import { downloadChatAsMarkdown } from '../../src/components/CommandPalette/export-utils.js';

const create = URL.createObjectURL,
  revoke = URL.revokeObjectURL;
afterEach(() => {
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('preserves content and the shortest safe fence for empty, boundary and many-run logs', () => {
  vi.stubGlobal(
    'Blob',
    class {
      constructor(parts: string[]) {
        seam.captured = parts.join('');
      }
    },
  );
  URL.createObjectURL = () => 'blob:fixture';
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  for (const [text, fence] of [
    ['', 3],
    ['plain', 3],
    ['```x````', 5],
    ['`'.repeat(5000), 5001],
    ['`x'.repeat(200_000), 3],
  ] as const) {
    seam.text = text;
    downloadChatAsMarkdown();
    expect(seam.captured).toContain(text);
    expect(seam.captured.split('\n').find((line) => /^`+text$/.test(line))).toBe(
      '`'.repeat(fence) + 'text',
    );
  }
  downloadChatAsMarkdown();
  expect(seam.captured).toContain(seam.text);
  expect(document.querySelectorAll('a')).toHaveLength(0);
});
