import { describe, expect, it } from 'vitest';
import { createChroniclePromptManifest } from '../src/index.js';

describe('prompt composition manifest', () => {
  it('creates deterministic lineage without retaining prompt or tool prose', () => {
    const request = {
      model: 'model-a',
      system: [{ type: 'text' as const, text: 'private system instruction' }],
      messages: [
        { role: 'user' as const, content: 'private user request', _estTokens: 5 },
        {
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 'call-1', name: 'read', input: { path: 'secret.ts' } },
            {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/png', data: 'private-image' },
            },
          ],
        },
      ],
      tools: [
        {
          name: 'read',
          description: 'private tool prose',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
          permission: 'auto' as const,
          mutating: false,
          riskTier: 'safe' as const,
          execute: async () => ({}),
        },
      ],
      temperature: 0.2,
    };
    const first = createChroniclePromptManifest(request);
    const second = createChroniclePromptManifest(request);
    expect(first.manifestId).toBe(second.manifestId);
    expect(first).toMatchObject({
      messageCount: 2,
      roleCounts: { user: 1, assistant: 1 },
      blockCounts: { text: 1, tool_use: 1, image: 1 },
      tools: { count: 1, names: ['read'] },
    });
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('secret.ts');
  });
});

describe('prompt manifest system blocks', () => {
  it('records each system block by layer, size and hash, never its text', () => {
    const identity = { type: 'text' as const, text: 'identity text' };
    const skills = { type: 'text' as const, text: 'skills text that is longer' };
    const labels = new Map<object, string>([[identity, 'identity']]);
    const manifest = createChroniclePromptManifest(
      { model: 'm', system: [identity, skills], messages: [] },
      (block) => labels.get(block),
    );
    expect(manifest.system.blocks?.map((b) => [b.source, b.bytes])).toEqual([
      ['identity', 13],
      ['untagged', 26],
    ]);
    expect(JSON.stringify(manifest)).not.toContain('identity text');
    // The id is unchanged by labels: they describe the prompt, not compose it.
    expect(manifest.manifestId).toBe(
      createChroniclePromptManifest({ model: 'm', system: [identity, skills], messages: [] })
        .manifestId,
    );
  });
});
