import { describe, expect, it } from 'vitest';
import { describeSlotTools } from '../src/registry-describe.js';
import type { ServerSlot } from '../src/registry-slots.js';

describe('MCP registry tool description snapshots', () => {
  it.each(['title', 'readOnlyHint', 'destructiveHint'] as const)(
    'isolates %s from source and later snapshots',
    (key) => {
      const source = {
        name: 'echo',
        inputSchema: { type: 'object' },
        annotations: { title: 'Original', readOnlyHint: true, destructiveHint: false },
      };
      const slot = { cfg: {}, discoveredTools: [source] } as unknown as ServerSlot;
      const first = describeSlotTools(slot)[0];
      const second = describeSlotTools(slot)[0];
      if (!first?.annotations) throw new Error('Expected annotated tool');
      const before = structuredClone(source.annotations);
      if (key === 'title') first.annotations.title = 'Changed';
      else first.annotations[key] = !first.annotations[key];
      expect(source.annotations).toEqual(before);
      expect(second?.annotations).toEqual(before);
      expect(describeSlotTools(slot)[0]?.annotations).toEqual(before);
    },
  );
});
