/**
 * Usefulness crediting through the REAL render path.
 *
 * The project's SAGE store showed 277k injections and zero uses. This drives
 * the tool-result path end to end — `formatMemoryHintsDetailed` →
 * `mergeMemoryEvidence` → `formatMemoryEvidenceBlock` (the fence core puts on
 * the wire) → the context monitor's snapshot → an assistant message that
 * restates the memory — and asserts `recordUse` fires.
 */

import { formatMemoryEvidenceBlock } from '@wrongstack/core/utils';
import { describe, expect, it, vi } from 'vitest';
import { createSageContextMonitorMiddleware } from '../src/middleware/context-monitor.js';
import { InjectionTracker } from '../src/middleware/injection-tracker.js';
import { mergeMemoryEvidence } from '../src/middleware/tool-call-memory-trace.js';
import { formatMemoryHintsDetailed } from '../src/retrieval/format.js';
import type { Sage } from '../src/types.js';

const memory = {
  id: 'mem_01KXQMKRGEY0ZD6YY9KGM9KQF3',
  revision: 1,
  scope: 'project',
  kind: 'decision',
  status: 'active',
  persistence: 'long_lived',
  text:
    'The live Config object is frozen at boot; assigning to it in place throws. ' +
    'Always go through patchConfig() and setConfig() instead.',
  importance: 0.9,
  confidence: 0.9,
  freshness: 1,
  tags: [],
  anchors: [{ type: 'file', path: 'src/config.ts' }],
  sources: [{ type: 'user' }],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as Sage;

describe('use crediting through the real render path', () => {
  it('credits a use when the assistant restates an injected memory', async () => {
    const tracker = new InjectionTracker();
    const recordUse = vi.fn();
    const sessionId = 's1';
    const monitor = createSageContextMonitorMiddleware({
      tracker,
      events: { emit: () => {} } as never,
      getSessionId: () => sessionId,
      memory: { recordUse } as never,
    });

    // Tool-call path: render, record, merge into the evidence window.
    const rendered = formatMemoryHintsDetailed([memory], {
      maxChars: 2_800,
      heading: 'SAGE: related project knowledge (Memory Injector)',
    });
    expect(rendered.memoryIds).toContain(memory.id);
    tracker.record(memory.id, memory.text, Date.now(), sessionId, rendered.text);
    const evidence = mergeMemoryEvidence('', rendered.text, 8_000);
    const wire = formatMemoryEvidenceBlock('sage.tool-memory', evidence.text);

    const request = (assistant?: string) => ({
      model: 'm',
      system: [{ type: 'text', text: 'system' }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Why does setConfig throw?' }] },
        ...(assistant ? [{ role: 'assistant', content: [{ type: 'text', text: assistant }] }] : []),
        { role: 'user', content: [{ type: 'text', text: wire }] },
      ],
    });

    const next = vi.fn(async (r) => r);
    // Request 1: the evidence is on the wire → snapshot marks it active.
    await monitor.handler(request() as never, next);
    expect(tracker.activeMemoryIds(sessionId).has(memory.id)).toBe(true);

    // Request 2: the model's reply restated it → a use is credited.
    await monitor.handler(
      request(
        'The live Config object is frozen at boot, so assigning to it in place throws; ' +
          'use patchConfig() and setConfig() instead.',
      ) as never,
      next,
    );
    expect(recordUse).toHaveBeenCalledWith([memory.id], 'assistant_reference', sessionId);
  });
});
