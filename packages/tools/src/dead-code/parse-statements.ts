/** Top-level statement facts for the dead-code parser: imports, exports, locals. */

import type * as TS from '@typescript/typescript6';
import { calleeText } from './parse-call-sites.js';
import type {
  ExportFact,
  ImportedName,
  ImportFact,
  LocalFact,
  ModuleFacts,
} from './parse-facts.js';
import { hasKeepMarker, hasModifier, lineOf, type RefIndex } from './parse-refs.js';
import {
  collectSignatureTypeNames,
  compileTimeGates,
  declKind,
  isTypeOnlyDecl,
} from './parse-type-surface.js';

type Ts = typeof import('@typescript/typescript6');

/** State the whole-file walk continues from. */
export interface StatementFactsState {
  namespaceBindings: Array<{ local: string; fact: ImportFact }>;
  consumedLiterals: Set<TS.Node>;
}

export function collectStatementFacts(
  ts: Ts,
  sf: TS.SourceFile,
  refs: RefIndex,
  facts: ModuleFacts,
): StatementFactsState {
  const K = ts.SyntaxKind;
  const namespaceBindings: Array<{ local: string; fact: ImportFact }> = [];
  const consumedLiterals = new Set<TS.Node>();
  // Local names re-exported through `export { x }` / `export default x`.
  const exportedLocals = new Set<string>();
  // Import bindings: local name -> where it comes from.
  const importedBindings = new Map<string, { spec: string; imported: string }>();

  // ── Top-level statements: imports, exports, locals ─────────────────────
  const exportByName = new Map<string, ExportFact>();
  const localByName = new Map<string, LocalFact>();

  const pushExport = (fact: ExportFact): void => {
    const prev = exportByName.get(fact.name);
    if (prev) {
      // Overloads and declaration merging: one export, widest span.
      prev.line = Math.min(prev.line, fact.line);
      prev.endLine = Math.max(prev.endLine, fact.endLine);
      prev.keep ||= fact.keep;
      prev.typeOnly &&= fact.typeOnly;
      prev.manual ??= fact.manual;
      return;
    }
    exportByName.set(fact.name, fact);
    facts.exports.push(fact);
  };
  const pushLocal = (fact: LocalFact): void => {
    const prev = localByName.get(fact.name);
    if (prev) {
      prev.line = Math.min(prev.line, fact.line);
      prev.endLine = Math.max(prev.endLine, fact.endLine);
      prev.keep ||= fact.keep;
      return;
    }
    localByName.set(fact.name, fact);
    facts.locals.push(fact);
  };

  for (const stmt of sf.statements) {
    const line = lineOf(sf, stmt.getStart(sf));
    const endLine = lineOf(sf, stmt.getEnd());
    const keep = hasKeepMarker(sf, stmt);

    if (ts.isImportDeclaration(stmt)) {
      if (!ts.isStringLiteralLike(stmt.moduleSpecifier)) continue;
      consumedLiterals.add(stmt.moduleSpecifier);
      const spec = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      if (!clause) {
        facts.imports.push({ spec, kind: 'side-effect', names: [], line });
        continue;
      }
      const clauseTypeOnly = clause.isTypeOnly;
      const fact: ImportFact = { spec, kind: 'import', names: [], line };
      const names: ImportedName[] = [];
      if (clause.name) {
        names.push({ imported: 'default', typeOnly: clauseTypeOnly });
        importedBindings.set(clause.name.text, { spec, imported: 'default' });
      }
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) {
        namespaceBindings.push({ local: nb.name.text, fact });
        importedBindings.set(nb.name.text, { spec, imported: '*' });
      } else if (nb) {
        for (const el of nb.elements) {
          importedBindings.set(el.name.text, { spec, imported: (el.propertyName ?? el.name).text });
          names.push({
            imported: (el.propertyName ?? el.name).text,
            typeOnly: clauseTypeOnly || el.isTypeOnly,
          });
        }
      }
      fact.names = names;
      facts.imports.push(fact);
      continue;
    }

    if (ts.isImportEqualsDeclaration(stmt)) {
      const ref = stmt.moduleReference;
      if (ts.isExternalModuleReference(ref) && ts.isStringLiteralLike(ref.expression)) {
        consumedLiterals.add(ref.expression);
        facts.imports.push({ spec: ref.expression.text, kind: 'require', names: 'all', line });
      }
      if (hasModifier(ts, stmt, K.ExportKeyword)) {
        pushExport({
          name: stmt.name.text,
          local: stmt.name.text,
          kind: 'const',
          typeOnly: stmt.isTypeOnly,
          line,
          endLine,
          usedLocally: (refs.counts.get(stmt.name.text) ?? 0) > 0,
          keep,
        });
      }
      continue;
    }

    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteralLike(stmt.moduleSpecifier)) {
        consumedLiterals.add(stmt.moduleSpecifier);
        const spec = stmt.moduleSpecifier.text;
        const clause = stmt.exportClause;
        if (!clause) {
          facts.reexports.push({ spec, star: true, names: [], line });
        } else if (ts.isNamespaceExport(clause)) {
          facts.reexports.push({
            spec,
            star: false,
            namespace: clause.name.text,
            names: [],
            line,
          });
        } else {
          facts.reexports.push({
            spec,
            star: false,
            names: clause.elements.map((el) => ({
              imported: (el.propertyName ?? el.name).text,
              exported: el.name.text,
              typeOnly: stmt.isTypeOnly || el.isTypeOnly,
            })),
            line,
          });
        }
        continue;
      }
      const clause = stmt.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          const local = (el.propertyName ?? el.name).text;
          exportedLocals.add(local);
          pushExport({
            name: el.name.text,
            local,
            kind: 'specifier',
            typeOnly: stmt.isTypeOnly || el.isTypeOnly,
            line: lineOf(sf, el.getStart(sf)),
            endLine: lineOf(sf, el.getEnd()),
            usedLocally: (refs.counts.get(local) ?? 0) > 0,
            keep: keep || hasKeepMarker(sf, el),
          });
        }
      }
      continue;
    }

    if (ts.isExportAssignment(stmt)) {
      if (stmt.isExportEquals) {
        facts.commonJs = true;
        continue;
      }
      const local = ts.isIdentifier(stmt.expression) ? stmt.expression.text : null;
      if (local) exportedLocals.add(local);
      pushExport({
        name: 'default',
        local,
        kind: 'default',
        typeOnly: false,
        line,
        endLine,
        usedLocally: local !== null && (refs.counts.get(local) ?? 0) > 0,
        keep,
      });
      continue;
    }

    const isExported = hasModifier(ts, stmt, K.ExportKeyword);
    const isDefault = hasModifier(ts, stmt, K.DefaultKeyword);

    if (ts.isVariableStatement(stmt)) {
      const decls = stmt.declarationList.declarations;
      const multi = decls.length > 1;
      for (const decl of decls) {
        const boundNames: string[] = [];
        const collect = (name: TS.BindingName): void => {
          if (ts.isIdentifier(name)) boundNames.push(name.text);
          else
            for (const el of name.elements) {
              if (!ts.isOmittedExpression(el)) collect(el.name);
            }
        };
        collect(decl.name);
        const destructured = !ts.isIdentifier(decl.name);
        const manual = destructured
          ? 'destructured declaration'
          : multi
            ? 'statement declares several variables'
            : undefined;
        for (const name of boundNames) {
          const kind = stmt.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let';
          const declLine = lineOf(sf, decl.getStart(sf));
          if (isExported) {
            pushExport({
              name,
              local: name,
              kind,
              typeOnly: false,
              line: declLine,
              endLine: lineOf(sf, decl.getEnd()),
              usedLocally: (refs.counts.get(name) ?? 0) > 0,
              keep,
              manual,
            });
          } else {
            pushLocal({
              name,
              kind,
              line: declLine,
              endLine: lineOf(sf, decl.getEnd()),
              refs: refs.counts.get(name) ?? 0,
              keep,
              manual,
            });
          }
        }
      }
      continue;
    }

    if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) {
      // `declare module 'x'` / `declare global` augment other modules.
      if (ts.isModuleDeclaration(stmt) && !ts.isIdentifier(stmt.name)) continue;
      const localName = stmt.name && ts.isIdentifier(stmt.name) ? stmt.name.text : null;
      const kind = declKind(ts, stmt);
      const typeOnly = isTypeOnlyDecl(ts, stmt);
      if (isExported) {
        pushExport({
          name: isDefault ? 'default' : (localName ?? 'default'),
          local: localName,
          kind,
          typeOnly,
          line,
          endLine,
          usedLocally: localName !== null && (refs.counts.get(localName) ?? 0) > 0,
          keep,
        });
      } else if (localName) {
        pushLocal({
          name: localName,
          kind,
          line,
          endLine,
          refs: refs.counts.get(localName) ?? 0,
          keep,
        });
      }
      continue;
    }

    // CommonJS export forms at top level.
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
      const left = stmt.expression.left;
      if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
        const root = calleeText(ts, left.expression as TS.Expression);
        if (root === 'module' || root === 'exports' || root?.startsWith('module.exports')) {
          facts.commonJs = true;
        }
      }
    }
  }

  // Locals behind `export { x }` / `export default x` are exports, not locals.
  facts.locals = facts.locals.filter((l) => !exportedLocals.has(l.name));
  // `export { x }` of an IMPORT binding is a re-export, not a declaration.
  facts.exports = facts.exports.filter((exp) => {
    if (exp.kind !== 'specifier' || exp.local === null || localByName.has(exp.local)) return true;
    const binding = importedBindings.get(exp.local);
    if (!binding) return true;
    facts.reexports.push(
      binding.imported === '*'
        ? {
            spec: binding.spec,
            star: false,
            namespace: exp.name,
            names: [],
            line: exp.line,
            viaImport: true,
          }
        : {
            spec: binding.spec,
            star: false,
            names: [{ imported: binding.imported, exported: exp.name, typeOnly: exp.typeOnly }],
            line: exp.line,
            viaImport: true,
          },
    );
    return false;
  });
  const gates = compileTimeGates(ts, sf);
  for (const exp of facts.exports) if (exp.local !== null && gates.has(exp.local)) exp.keep = true;
  for (const local of facts.locals) if (gates.has(local.name)) local.keep = true;

  // Type names reachable from exported signatures (not bodies or initializers).
  const surfacedNames = collectSignatureTypeNames(ts, sf, exportedLocals);
  for (const exp of facts.exports) {
    if (exp.local !== null && surfacedNames.has(exp.local)) exp.surfaced = true;
  }

  // A specifier export of a local declaration takes the declaration's kind/span.
  for (const exp of facts.exports) {
    if (exp.kind !== 'specifier' && exp.kind !== 'default') continue;
    if (exp.local === null) continue;
    const decl = localByName.get(exp.local);
    if (!decl) continue;
    if (exp.kind === 'specifier') exp.kind = decl.kind;
    exp.keep ||= decl.keep;
  }

  return { namespaceBindings, consumedLiterals };
}
