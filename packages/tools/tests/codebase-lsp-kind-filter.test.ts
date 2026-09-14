import { describe, expect, it } from 'vitest';
import {
  internalKindToLspKind,
  LSPSymbolKind,
  lspKindToInternalKinds,
} from '../src/codebase-index/lsp-kind.js';
import { buildWriterSearchWhere } from '../src/codebase-index/writer-search-helpers.js';

describe('LSP kind → internal kind filter', () => {
  it('maps one LSP kind to every internal kind it covers', () => {
    expect(lspKindToInternalKinds(LSPSymbolKind.Variable)).toEqual(['var', 'let']);
    expect(lspKindToInternalKinds(LSPSymbolKind.Interface)).toEqual(['interface', 'trait']);
    expect(lspKindToInternalKinds(LSPSymbolKind.Constant)).toEqual(['const', 'static']);
    expect(lspKindToInternalKinds(LSPSymbolKind.Constructor)).toEqual([]);
    expect(lspKindToInternalKinds(0)).toEqual([]);
  });

  it('round-trips the Rust and JSON kinds', () => {
    for (const kind of ['struct', 'trait', 'mod', 'object', 'static'] as const) {
      const lsp = internalKindToLspKind(kind);
      expect(lsp, kind).not.toBeNull();
      expect(lspKindToInternalKinds(lsp as number), kind).toContain(kind);
    }
  });

  it('filters on every covered kind, so lspKind 13 keeps `let`', () => {
    const built = buildWriterSearchWhere('', { lspKind: LSPSymbolKind.Variable });
    expect(built?.where).toContain('kind IN (?, ?)');
    expect(built?.values).toEqual(['var', 'let']);
  });

  it('intersects `kind` with `lspKind` instead of letting lspKind override it', () => {
    expect(
      buildWriterSearchWhere('', { kind: 'class', lspKind: LSPSymbolKind.Function }),
    ).toBeNull();
    expect(
      buildWriterSearchWhere('', { kind: 'let', lspKind: LSPSymbolKind.Variable })?.values,
    ).toEqual(['let']);
  });

  it('treats a MessagePack null lspKind as absent', () => {
    const built = buildWriterSearchWhere('', {
      kind: 'function',
      lspKind: null as unknown as undefined,
    });
    expect(built?.values).toEqual(['function']);
  });
});
