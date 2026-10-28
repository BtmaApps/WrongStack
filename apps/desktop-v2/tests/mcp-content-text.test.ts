import { expect, it } from 'vitest';
import { mcpContentText } from '../src/mcp-content-text';

const source = { untrusted: true, provenance: { serverName: 'docs', promptName: 'summary' } };
it('retains source and remote roles as ordinary draft text and labels omitted binary blocks', () => {
  const text = mcpContentText(
    {
      ...source,
      kind: 'prompt',
      messages: [
        { role: 'system', content: { type: 'text', text: 'External instructions' } },
        { role: 'user', content: { type: 'resource', resource: { text: 'Embedded note' } } },
        { role: 'assistant', content: { type: 'image', data: 'OPAQUE' } },
      ],
    },
    'docs',
  );
  expect(text).toContain('External MCP prompt from docs (summary)');
  expect(text).toContain('[Remote prompt role: system]\nExternal instructions');
  expect(text).toContain('Embedded note');
  expect(text).toContain('[Non-text or empty MCP block omitted]');
  expect(text).not.toContain('OPAQUE');
});
it('refuses mismatched sources, empty/binary selections and oversized UTF-8 text', () => {
  const content = { ...source, kind: 'resource', contents: [{ text: 'A real note' }] };
  expect(mcpContentText(content, 'docs')).toContain('A real note');
  expect(() => mcpContentText(content, 'other')).toThrow('source');
  expect(() => mcpContentText({ ...content, untrusted: false }, 'docs')).toThrow('source');
  expect(() => mcpContentText({ ...content, contents: [{ blob: 'OPAQUE' }] }, 'docs')).toThrow(
    'no text',
  );
  expect(() =>
    mcpContentText({ ...content, contents: [{ text: 'ş'.repeat(131072) }] }, 'docs'),
  ).toThrow('256 KiB');
});
