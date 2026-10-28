import { describe, expect, it } from 'vitest';
import { normalizeValidity } from '../../../packages/sage/src/shared/memory-validity';
import { assertSageValiditySaved, sageEditor, sageEditorPatch } from '../src/sage-model';
import { readSageSourceReview } from '../src/sage-validity-review-model';

describe('SAGE applicability authoring', () => {
  it('verifies stored conditions after acknowledgement, including explicit removals and dropped checks', () => {
    const validity = {
      statement: 'Scoped',
      checks: [{ type: 'source_contains', path: 'a.ts', text: 'literal' }],
    };
    expect(() =>
      assertSageValiditySaved(validity, {
        checks: [{ text: 'literal', path: 'a.ts', type: 'source_contains' }],
        statement: 'Scoped',
      }),
    ).not.toThrow();
    expect(() => assertSageValiditySaved(validity, undefined)).toThrow('stored applicability');
    expect(() => assertSageValiditySaved(validity, { statement: 'Scoped' })).toThrow(
      'stored applicability',
    );
    expect(() => assertSageValiditySaved(null, validity)).toThrow('stored applicability');
    expect(() => assertSageValiditySaved(null, undefined)).not.toThrow();
  });
  it('authors canonical checks with exact literals, normalized relative paths and explicit removal', () => {
    const editor = sageEditor(null);
    editor.validity = '  Applies while this boundary exists.  ';
    editor.validityChecks = [
      { type: 'source_contains', path: 'src\\boundary.ts', text: '  exact literal\n' },
    ];
    const patch = sageEditorPatch(editor, null);
    expect(normalizeValidity(patch.validity)).toEqual(patch.validity);
    expect(patch.validity).toEqual({
      statement: 'Applies while this boundary exists.',
      checks: [{ type: 'source_contains', path: 'src/boundary.ts', text: '  exact literal\n' }],
    });
    const loaded = sageEditor({ validity: patch.validity });
    loaded.validityChecks = [];
    expect(sageEditorPatch(loaded, {}).validity).toEqual({
      statement: 'Applies while this boundary exists.',
    });
    loaded.validity = '';
    expect(sageEditorPatch(loaded, {}).validity).toBeNull();
  });
  it.each(['../outside', '/absolute', 'C:\\outside', 'src/../outside', 'src\u0000/file', ''])(
    'rejects unsupported path %s on the client and canonical engine validator',
    (path) => {
      const editor = sageEditor(null);
      editor.validity = 'Scoped';
      editor.validityChecks = [{ type: 'source_contains', path, text: 'literal' }];
      expect(() => sageEditorPatch(editor, null)).toThrow('project-relative');
      expect(() =>
        normalizeValidity({ statement: editor.validity, checks: editor.validityChecks }),
      ).toThrow();
    },
  );
  it('refuses missing statements, blank literals, excessive text and more than four checks', () => {
    const editor = sageEditor(null);
    editor.validityChecks = [{ type: 'source_contains', path: 'src/a.ts', text: 'literal' }];
    expect(() => sageEditorPatch(editor, null)).toThrow('statement');
    editor.validity = 'Scoped';
    editor.validityChecks[0]!.text = ' ';
    expect(() => sageEditorPatch(editor, null)).toThrow('literal');
    editor.validityChecks[0]!.text = 'x'.repeat(401);
    expect(() => sageEditorPatch(editor, null)).toThrow('1–400');
    editor.validityChecks = Array.from({ length: 5 }, () => ({
      type: 'source_contains',
      path: 'a.ts',
      text: 'a',
    }));
    expect(() => sageEditorPatch(editor, null)).toThrow('four');
  });
});
describe('SAGE source evidence response', () => {
  const memory = {
    id: 'memory-a',
    revision: 3,
    validity: {
      statement: 'Scoped',
      checks: [{ type: 'source_contains', path: 'src/a.ts', text: 'literal' }],
    },
  };
  const reply = {
    memory,
    validityReview: {
      checkedAt: '2026-10-28T12:00:00Z',
      observedRevision: 3,
      applicability: 'unknown',
      checks: [
        {
          path: 'src/a.ts',
          text: 'literal',
          status: 'satisfied',
          sourceHash: 'sha256:' + 'a'.repeat(64),
        },
      ],
    },
  };
  it.each(['satisfied', 'not_satisfied', 'unknown'])(
    'accepts %s as source evidence without asserting overall applicability',
    (status) => {
      const input = structuredClone(reply);
      input.validityReview.checks[0]!.status = status;
      expect(readSageSourceReview(input, memory).checks[0]?.status).toBe(status);
    },
  );
  it('refuses old runtimes, foreign/stale records, substituted checks and invented truth labels', () => {
    expect(() => readSageSourceReview({ memory }, memory)).toThrow('Update');
    expect(() =>
      readSageSourceReview({ ...reply, memory: { ...memory, id: 'other' } }, memory),
    ).toThrow('revision');
    expect(() =>
      readSageSourceReview(
        { ...reply, validityReview: { ...reply.validityReview, observedRevision: 4 } },
        memory,
      ),
    ).toThrow('revision');
    expect(() =>
      readSageSourceReview(
        { ...reply, validityReview: { ...reply.validityReview, applicability: 'valid' } },
        memory,
      ),
    ).toThrow('revision');
    expect(() =>
      readSageSourceReview(
        {
          ...reply,
          validityReview: {
            ...reply.validityReview,
            checks: [{ path: 'other.ts', text: 'literal', status: 'satisfied' }],
          },
        },
        memory,
      ),
    ).toThrow('checks');
  });
});
