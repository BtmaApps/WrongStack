import { describe, expect, it } from 'vitest';
import { SAGE_KINDS, SAGE_STATUSES } from '../../../packages/sage/src/memory-model';
import {
  fileMemories,
  sageEditor,
  sageEditorPatch,
  sageKinds,
  sageStatuses,
} from '../src/sage-model';

describe('SAGE management contracts', () => {
  it('covers canonical SAGE kinds and lifecycle states without substituting vector entries', () => {
    expect(sageKinds).toEqual(SAGE_KINDS);
    expect(sageStatuses).toEqual(SAGE_STATUSES);
  });
  it('preserves structured evidence and source checks while editing human-readable fields', () => {
    const memory = {
      status: 'active',
      confidence: 0.7,
      persistence: 'permanent',
      anchors: [
        { type: 'symbol', path: 'src/a.ts', symbol: 'run' },
        { type: 'file', path: 'src/a.ts', lineStart: 12, contentHash: 'old' },
      ],
      validity: {
        statement: 'Applies to the HTTP boundary.',
        checks: [{ type: 'source_contains', path: 'src/a.ts', text: 'validateToken' }],
      },
      audience: { roles: ['reviewer'] },
    };
    const editor = sageEditor(memory);
    const patch = sageEditorPatch(
      {
        ...editor,
        anchors: 'src/a.ts\nsrc/b.ts',
        roles: 'reviewer, security-scanner',
        status: 'stale',
      },
      memory,
    );
    expect(patch.anchors).toEqual([
      memory.anchors[0],
      memory.anchors[1],
      { type: 'file', path: 'src/b.ts' },
    ]);
    expect(patch.validity).toEqual(memory.validity);
    expect(patch.audience.roles).toEqual(['reviewer', 'security-scanner']);
    expect(patch.status).toBe('stale');
    expect(patch.persistence).toBe('permanent');
  });
  it('reads canonical file matches with their provenance instead of treating path search as anchoring', () => {
    expect(
      fileMemories({
        response: {
          primaryMatches: [
            {
              memory: { id: 'a', text: 'Guard the vault' },
              matchedVia: 'anchor_file',
              matchStrength: 0.85,
            },
          ],
          relatedMatches: [{ memory: { id: 'b' }, matchedVia: 'mention', matchStrength: 0.3 }],
        },
      }),
    ).toMatchObject([
      { id: 'a', matchedVia: 'anchor_file', matchStrength: 0.85 },
      { id: 'b', matchedVia: 'mention' },
    ]);
  });
});
