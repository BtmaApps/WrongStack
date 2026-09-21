import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-protocol';
import { formatDiagnostics } from '../../src/formatters/diagnostics.js';
import { formatLocations } from '../../src/formatters/location.js';

import { editsByPath, summarizeWorkspaceEdit } from '../../src/formatters/workspace-edit.js';
import { pathToUri } from '../../src/utils/uri.js';

const cwd = process.cwd();

describe('formatters', () => {
  it('formats diagnostics with sorting, filtering, truncation, and fallback severity', () => {
    const file = `${cwd}/src.ts`;
    const out = formatDiagnostics(
      new Map<string, Diagnostic[]>([
        [
          file,
          [
            diagnostic(2, 5, 2, 'warn\nmessage', 'ts', 100),
            diagnostic(1, 2, 1, 'error message'),
            diagnostic(4, 1, 99, 'unknown severity'),
          ],
        ],
      ]),
      {
        cwd,
        severityFilter: ['error', 'warning'],
        maxPerFile: 2,
        maxTotal: 10,
      },
    );

    expect(out).toContain('src.ts (2):');
    expect(out).toContain('L2:3 ERROR: error message');
    expect(out).toContain('L3:6 WARN ts(100): warn | message');
    expect(
      formatDiagnostics(new Map(), { cwd, severityFilter: ['error'], maxPerFile: 1, maxTotal: 1 }),
    ).toBe('No LSP diagnostics.');
  });

  // Regression (round r1-1d2c18d4-diag-cap): the file that crosses `maxTotal`
  // used to be emitted whole — the cap only gated whole files after it — so
  // `lsp_diagnostics { limit: 5 }` could report 6+ diagnostics from one file
  // and silently hide every later file.
  it('truncates the file that crosses maxTotal instead of overshooting the cap', () => {
    const out = formatDiagnostics(
      new Map<string, Diagnostic[]>([
        [
          `${cwd}/overflow.ts`,
          ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((m) => diagnostic(0, 0, 1, m)),
        ],
        [`${cwd}/control.ts`, ['c1', 'c2'].map((m) => diagnostic(0, 0, 1, m))],
      ]),
      { cwd, severityFilter: ['error', 'warning'], maxPerFile: 10, maxTotal: 5 },
    );
    expect(out).toContain('overflow.ts (5):');
    expect(out).toContain('Total: 5 diagnostics in 1 files.');
    expect(out).not.toContain('control.ts');
  });

  it('spends the remaining maxTotal budget on the next file', () => {
    const out = formatDiagnostics(
      new Map<string, Diagnostic[]>([
        [`${cwd}/a.ts`, ['a1', 'a2'].map((m) => diagnostic(0, 0, 1, m))],
        [`${cwd}/b.ts`, ['b1', 'b2'].map((m) => diagnostic(0, 0, 1, m))],
      ]),
      { cwd, severityFilter: ['error'], maxPerFile: 10, maxTotal: 3 },
    );
    expect(out).toContain('a.ts (2):');
    expect(out).toContain('b.ts (1):');
    expect(out).toContain('Total: 3 diagnostics in 2 files.');
  });

  it('reports nothing when maxTotal leaves no budget for the first file', () => {
    const out = formatDiagnostics(
      new Map<string, Diagnostic[]>([[`${cwd}/x.ts`, [diagnostic(0, 0, 1, 'boom')]]]),
      { cwd, severityFilter: ['error'], maxPerFile: 10, maxTotal: 0 },
    );
    expect(out).toBe('No LSP diagnostics.');
  });

  it('formats missing severity, markup messages, sources without codes, and empty files', () => {
    const file = `${cwd}/fallback.ts`;
    const out = formatDiagnostics(
      new Map<string, Diagnostic[]>([
        [`${cwd}/empty.ts`, [diagnostic(0, 0, 2, 'filtered')]],
        [
          file,
          [
            {
              range: range(1, 2),
              message: { kind: 'markdown', value: 'markup\nmessage' },
              source: 'server',
            } as never,
            diagnostic(1, 1, 1, 'same line earlier'),
            diagnostic(1, 3, 1, 'same line later'),
          ],
        ],
      ]),
      {
        cwd,
        severityFilter: ['error'],
        maxPerFile: 10,
        maxTotal: 10,
      },
    );
    expect(out).toContain('ERROR server: markup | message');
    expect(out.indexOf('same line earlier')).toBeLessThan(out.indexOf('same line later'));
  });

  it('formats locations and symbols', () => {
    const uri = pathToUri(`${cwd}/a.ts`);
    expect(formatLocations(null, cwd)).toBe('No locations found.');
    expect(formatLocations([], cwd)).toBe('No locations found.');
    expect(
      formatLocations(
        [
          { uri, range: range(0, 0) },
          { targetUri: uri, targetSelectionRange: range(1, 2), targetRange: range(1, 2) },
          { uri, range: range(2, 3) },
        ],
        cwd,
        2,
      ),
    ).toContain('... truncated 1 more');
    expect(formatLocations({ uri, range: range(0, 0) }, cwd)).toContain('a.ts:1:1');
    expect(
      formatLocations(
        { targetUri: uri, targetSelectionRange: range(1, 2), targetRange: range(1, 2) },
        cwd,
      ),
    ).toContain('a.ts:2:3');
  });

  it('summarizes workspace edits from both change shapes', () => {
    const uri = pathToUri(`${cwd}/a.ts`);
    const edit = {
      changes: { [uri]: [{ range: range(0, 0), newText: 'x' }] },
      documentChanges: [
        { textDocument: { uri, version: 1 }, edits: [{ range: range(1, 0), newText: 'y' }] },
      ],
    };

    expect(
      editsByPath(edit).get(`${cwd}\\a.ts`) ?? editsByPath(edit).get(`${cwd}/a.ts`),
    ).toHaveLength(1);
    expect(summarizeWorkspaceEdit(edit, cwd)).toContain('Total: 1 edits across 1 files.');
    expect(summarizeWorkspaceEdit({}, cwd)).toBe('WorkspaceEdit contains no text edits.');
    const mixed = editsByPath({
      documentChanges: [
        { kind: 'create', uri },
        {
          textDocument: { uri, version: 1 },
          edits: [{ range: range(0, 0), newText: 'text' }, { annotationId: 'meta' }],
        },
      ],
    } as never);
    expect([...mixed.values()][0]).toHaveLength(1);

    const multiEditsSameDoc = editsByPath({
      documentChanges: [
        { textDocument: { uri, version: 1 }, edits: [{ range: range(0, 0), newText: 'first' }] },
        { textDocument: { uri, version: 2 }, edits: [{ range: range(1, 0), newText: 'second' }] },
      ],
    });
    const accumulated =
      multiEditsSameDoc.get(`${cwd}\\a.ts`) ?? multiEditsSameDoc.get(`${cwd}/a.ts`);
    expect(accumulated).toHaveLength(2);
  });
});

function diagnostic(
  line: number,
  character: number,
  severity: number,
  message: string,
  source?: string,
  code?: number,
): Diagnostic {
  return {
    range: range(line, character),
    severity: severity as DiagnosticSeverity,
    message,
    ...(source === undefined ? {} : { source }),
    ...(code === undefined ? {} : { code }),
  };
}

function range(line: number, character: number) {
  return { start: { line, character }, end: { line, character: character + 1 } };
}
