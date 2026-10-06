/**
 * Type-level facts for the dead-code parser: declaration kinds, type names
 * surfaced through exported signatures, and compile-time gate aliases.
 */

import type * as TS from '@typescript/typescript6';
import { hasModifier } from './parse-refs.js';

type Ts = typeof import('@typescript/typescript6');

export function declKind(ts: Ts, node: TS.Node): string {
  const K = ts.SyntaxKind;
  switch (node.kind) {
    case K.FunctionDeclaration:
      return 'function';
    case K.ClassDeclaration:
      return 'class';
    case K.InterfaceDeclaration:
      return 'interface';
    case K.TypeAliasDeclaration:
      return 'type';
    case K.EnumDeclaration:
      return 'enum';
    case K.ModuleDeclaration:
      return 'namespace';
    default:
      return 'const';
  }
}

export function isTypeOnlyDecl(ts: Ts, node: TS.Node): boolean {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

/**
 * Identifiers used as TYPES in the signatures of exported top-level
 * declarations: parameter / return / property types, heritage clauses, type
 * alias and interface bodies. Function bodies and initializers are skipped —
 * what matters is what a consumer's inferred types can mention.
 */
export function collectSignatureTypeNames(
  ts: Ts,
  sf: TS.SourceFile,
  exportedLocals: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  const leftmost = (n: TS.EntityName | TS.Expression): string | null => {
    let cur: TS.Node = n;
    for (;;) {
      if (ts.isIdentifier(cur)) return cur.text;
      if (ts.isQualifiedName(cur)) cur = cur.left;
      else if (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
      else return null;
    }
  };
  const visit = (node: TS.Node): void => {
    if (ts.isBlock(node)) return;
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isPropertyAssignment(node)) &&
      'initializer' in node
    ) {
      // Visit the declared type, not the initializer.
      const typed = node as { type?: TS.TypeNode | undefined };
      if (typed.type) visit(typed.type);
      if (ts.isParameter(node) || ts.isVariableDeclaration(node)) visit(node.name);
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      for (const p of node.parameters) visit(p);
      if (node.type) visit(node.type);
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      const n = leftmost(node.typeName);
      if (n) names.add(n);
    } else if (ts.isExpressionWithTypeArguments(node)) {
      const n = leftmost(node.expression);
      if (n) names.add(n);
    } else if (ts.isTypeQueryNode(node)) {
      const n = leftmost(node.exprName);
      if (n) names.add(n);
    }
    ts.forEachChild(node, visit);
  };
  // Types named by private type declarations, for the transitive closure:
  // `export function f(): Result` + `interface Result { e: Entry }` surfaces Entry.
  const privateTypeRefs = new Map<string, TS.Statement>();
  for (const stmt of sf.statements) {
    const exported =
      hasModifier(ts, stmt, ts.SyntaxKind.ExportKeyword) ||
      ((ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt)) &&
        stmt.name !== undefined &&
        exportedLocals.has(stmt.name.text));
    if (exported) {
      ts.forEachChild(stmt, visit);
    } else if (
      (ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isClassDeclaration(stmt)) &&
      stmt.name
    ) {
      privateTypeRefs.set(stmt.name.text, stmt);
    }
  }
  const expanded = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, stmt] of privateTypeRefs) {
      if (!names.has(name) || expanded.has(name)) continue;
      expanded.add(name);
      const before = names.size;
      ts.forEachChild(stmt, visit);
      if (names.size !== before) grew = true;
    }
  }
  return names;
}

const ASSERTION_NAME = /^(?:Assert|Expect)[A-Z_]/;

/**
 * Compile-time gates: `type Coverage = AssertNever<Unlisted>` exists only to
 * fail `tsc` when something drifts. Nothing references it by design, and
 * deleting it silently removes the guard. A gate is a type alias that
 * instantiates a helper whose type parameter is constrained to `never`/`true`
 * (or is named Assert…/Expect…).
 */
export function compileTimeGates(ts: Ts, sf: TS.SourceFile): Set<string> {
  const helpers = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt)) continue;
    const pinned = (stmt.typeParameters ?? []).some((tp) => {
      const c = tp.constraint;
      if (!c) return false;
      if (c.kind === ts.SyntaxKind.NeverKeyword) return true;
      return ts.isLiteralTypeNode(c) && c.literal.kind === ts.SyntaxKind.TrueKeyword;
    });
    if (pinned) helpers.add(stmt.name.text);
  }
  const gates = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) || helpers.has(stmt.name.text)) continue;
    let isGate = false;
    const visit = (node: TS.Node): void => {
      if (isGate) return;
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        const n = node.typeName.text;
        if (helpers.has(n) || ASSERTION_NAME.test(n)) {
          isGate = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(stmt.type);
    if (isGate) gates.add(stmt.name.text);
  }
  return gates;
}
