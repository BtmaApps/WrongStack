import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { editsByPath } from '../../src/formatters/workspace-edit.js';
import { applyTextEdits } from '../../src/tools/workspace-edit.js';
import { uriToPathOrUri } from '../../src/utils/uri.js';

describe('applyTextEdits', () => {
  it('applies edits from bottom to top', () => {
    const out = applyTextEdits('one\ntwo\nthree\n', [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        newText: 'ONE',
      },
      {
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
        newText: 'THREE',
      },
    ]);
    expect(out).toBe('ONE\ntwo\nTHREE\n');
  });

  it('gives documentChanges precedence over changes when both are present (F843)', () => {
    const uriA = pathToFileURL('/tmp/a.ts').href;
    const uriB = pathToFileURL('/tmp/b.ts').href;
    const edit = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      newText: 'x',
    };
    const byPath = editsByPath({
      changes: {
        [uriA]: [edit],
        [uriB]: [edit],
      },
      documentChanges: [
        {
          textDocument: { uri: uriA, version: 1 },
          edits: [edit],
        },
      ],
    });
    expect([...byPath.keys()]).toEqual([uriToPathOrUri(uriA)]);
    expect(byPath.get(uriToPathOrUri(uriA))).toHaveLength(1);
  });
});
