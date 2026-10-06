/**
 * Identifier reference indexing for the dead-code parser: which identifiers are
 * references (not declarations / keys / members), scope shadowing, and the
 * keep-marker check.
 */

import type * as TS from '@typescript/typescript6';

type Ts = typeof import('@typescript/typescript6');

const KEEP_MARKER = /@public\b|@keep\b|dead-code-ignore(?!-file)/;

export function scriptKindFor(ts: Ts, file: string): TS.ScriptKind {
  const lower = file.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(lower)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function createSource(ts: Ts, file: string, text: string): TS.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(ts, file));
}

export function lineOf(sf: TS.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

export function hasModifier(ts: Ts, node: TS.Node, kind: TS.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** Leading comments + the same-line trailing comment carry the keep markers. */
export function hasKeepMarker(sf: TS.SourceFile, node: TS.Node): boolean {
  const text = sf.text;
  const leading = text.slice(node.getFullStart(), node.getStart(sf));
  if (KEEP_MARKER.test(leading)) return true;
  const lineEnd = text.indexOf('\n', node.getEnd());
  const trailing = text.slice(node.getEnd(), lineEnd === -1 ? text.length : lineEnd);
  return KEEP_MARKER.test(trailing);
}

/**
 * Whether `id` is a REFERENCE to a binding, as opposed to a declaration name,
 * a property key, or a member name. Unknown positions count as references.
 */
export function isReferencePosition(ts: Ts, id: TS.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  const K = ts.SyntaxKind;
  switch (p.kind) {
    case K.PropertyAccessExpression:
      return (p as TS.PropertyAccessExpression).expression === id;
    case K.QualifiedName:
      return (p as TS.QualifiedName).left === id;
    case K.PropertyAssignment:
      return (p as TS.PropertyAssignment).initializer === id;
    case K.ShorthandPropertyAssignment:
      return (p as TS.ShorthandPropertyAssignment).name === id;
    case K.PropertyDeclaration:
    case K.PropertySignature:
    case K.MethodDeclaration:
    case K.MethodSignature:
    case K.GetAccessor:
    case K.SetAccessor:
    case K.EnumMember:
    case K.FunctionDeclaration:
    case K.FunctionExpression:
    case K.ClassDeclaration:
    case K.ClassExpression:
    case K.InterfaceDeclaration:
    case K.TypeAliasDeclaration:
    case K.EnumDeclaration:
    case K.ModuleDeclaration:
    case K.TypeParameter:
    case K.Parameter:
    case K.VariableDeclaration:
    case K.JsxAttribute:
    case K.NamespaceExport:
      return (p as TS.NamedDeclaration).name !== id;
    case K.BindingElement: {
      const b = p as TS.BindingElement;
      return b.name !== id && b.propertyName !== id;
    }
    case K.ImportSpecifier:
    case K.ImportClause:
    case K.NamespaceImport:
    case K.ImportEqualsDeclaration:
    case K.ExportSpecifier:
    case K.ExportAssignment:
    case K.LabeledStatement:
    case K.BreakStatement:
    case K.ContinueStatement:
    case K.MetaProperty:
      return false;
    default:
      return true;
  }
}

export interface RefIndex {
  /** Reference count per identifier text. */
  counts: Map<string, number>;
  /** Member names read off an identifier (`ns.foo`, `ns.Foo` in types). */
  members: Map<string, Set<string>>;
  /** References of an identifier that are NOT a plain member read. */
  opaque: Map<string, number>;
  /** References that only WRITE the binding (`x = …`, `x++`) — included in `counts`. */
  writes: Map<string, number>;
}

/** `x = …`, `x += …`, `x++`, `--x`: the binding is written, not read for its value. */
export function isWriteOnlyPosition(ts: Ts, id: TS.Identifier): boolean {
  const p = id.parent;
  if (ts.isBinaryExpression(p) && p.left === id) {
    const op = p.operatorToken.kind;
    return op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
  }
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && p.operand === id) {
    return (
      p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken
    );
  }
  return false;
}

function bindingNames(ts: Ts, name: TS.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
    return;
  }
  for (const el of name.elements) {
    if (!ts.isOmittedExpression(el)) bindingNames(ts, el.name, out);
  }
}

function isFunctionLike(ts: Ts, node: TS.Node): node is TS.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/** `var` declarations hoisted to the function, skipping nested functions. */
function hoistedVars(ts: Ts, body: TS.Node, out: string[]): void {
  const visit = (node: TS.Node): void => {
    if (isFunctionLike(ts, node) || ts.isClassLike(node)) return;
    if (
      ts.isVariableDeclarationList(node) &&
      !(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))
    ) {
      for (const d of node.declarations) bindingNames(ts, d.name, out);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

function blockDeclarations(ts: Ts, statements: readonly TS.Statement[], out: string[]): void {
  for (const stmt of statements) {
    if (ts.isVariableStatement(stmt)) {
      if (stmt.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) {
        for (const d of stmt.declarationList.declarations) bindingNames(ts, d.name, out);
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt)) &&
      stmt.name
    ) {
      out.push(stmt.name.text);
    }
  }
}

/**
 * Names a node declares for its own inner scope — parameters, hoisted vars,
 * block-scoped declarations, loop and catch variables, type parameters. A
 * reference inside the node to one of these names is NOT a use of a
 * top-level binding of the same name.
 */
function innerScopeNames(ts: Ts, node: TS.Node): string[] {
  if (ts.isSourceFile(node)) return [];
  const out: string[] = [];
  if (isFunctionLike(ts, node)) {
    for (const p of node.parameters) bindingNames(ts, p.name, out);
    for (const tp of node.typeParameters ?? []) out.push(tp.name.text);
    if (ts.isFunctionExpression(node) && node.name) out.push(node.name.text);
    const body = (node as { body?: TS.Node }).body;
    if (body) hoistedVars(ts, body, out);
    return out;
  }
  if (ts.isBlock(node) || ts.isModuleBlock(node)) {
    blockDeclarations(ts, node.statements, out);
    return out;
  }
  if (ts.isCaseBlock(node)) {
    for (const clause of node.clauses) blockDeclarations(ts, clause.statements, out);
    return out;
  }
  if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
    const init = node.initializer;
    if (init && ts.isVariableDeclarationList(init)) {
      for (const d of init.declarations) bindingNames(ts, d.name, out);
    }
    return out;
  }
  if (ts.isCatchClause(node)) {
    if (node.variableDeclaration) bindingNames(ts, node.variableDeclaration.name, out);
    return out;
  }
  if (ts.isClassLike(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    for (const tp of node.typeParameters ?? []) out.push(tp.name.text);
    if (ts.isClassExpression(node) && node.name) out.push(node.name.text);
    return out;
  }
  if (ts.isMappedTypeNode(node)) {
    out.push(node.typeParameter.name.text);
    return out;
  }
  if (ts.isInferTypeNode(node)) {
    out.push(node.typeParameter.name.text);
    return out;
  }
  return out;
}

/** The local side of `export { x }` / `export default x` (no module specifier). */
function isLocalExportUse(ts: Ts, id: TS.Identifier): boolean {
  const p = id.parent;
  if (ts.isExportAssignment(p)) return p.expression === id;
  if (!ts.isExportSpecifier(p)) return false;
  const decl = p.parent.parent;
  if (decl.moduleSpecifier !== undefined) return false;
  return (p.propertyName ?? p.name) === id;
}

/**
 * Identifier references per name. `exportUses` also counts the local side of
 * `export { x }` — the fixer's orphan detection needs it (an import whose only
 * use was a removed `export { x }` is orphaned), the analyzer must not (that
 * export is not a use inside the file).
 */
export function buildRefIndex(ts: Ts, sf: TS.SourceFile, exportUses = false): RefIndex {
  const counts = new Map<string, number>();
  const members = new Map<string, Set<string>>();
  const opaque = new Map<string, number>();
  const writes = new Map<string, number>();
  const K = ts.SyntaxKind;
  // Inner declarations currently in scope: a reference to one of these names
  // resolves to the inner binding, not to a top-level one.
  const shadow = new Map<string, number>();
  const visit = (node: TS.Node): void => {
    if (node.kind === K.Identifier) {
      const id = node as TS.Identifier;
      if ((shadow.get(id.text) ?? 0) > 0) return;
      if (isWriteOnlyPosition(ts, id)) writes.set(id.text, (writes.get(id.text) ?? 0) + 1);
      if (exportUses && isLocalExportUse(ts, id)) {
        counts.set(id.text, (counts.get(id.text) ?? 0) + 1);
        return;
      }
      if (isReferencePosition(ts, id)) {
        const name = id.text;
        counts.set(name, (counts.get(name) ?? 0) + 1);
        const p = id.parent;
        let member: string | null = null;
        if (
          p.kind === K.PropertyAccessExpression &&
          (p as TS.PropertyAccessExpression).expression === id
        ) {
          const nameNode = (p as TS.PropertyAccessExpression).name;
          if (nameNode.kind === K.Identifier) member = nameNode.text;
        } else if (p.kind === K.QualifiedName && (p as TS.QualifiedName).left === id) {
          member = (p as TS.QualifiedName).right.text;
        } else if (
          p.kind === K.ElementAccessExpression &&
          (p as TS.ElementAccessExpression).expression === id
        ) {
          const arg = (p as TS.ElementAccessExpression).argumentExpression;
          if (ts.isStringLiteralLike(arg)) member = arg.text;
        }
        if (member !== null) {
          let set = members.get(name);
          if (!set) {
            set = new Set();
            members.set(name, set);
          }
          set.add(member);
        } else {
          opaque.set(name, (opaque.get(name) ?? 0) + 1);
        }
      }
      return;
    }
    const declared = innerScopeNames(ts, node);
    for (const n of declared) shadow.set(n, (shadow.get(n) ?? 0) + 1);
    ts.forEachChild(node, visit);
    for (const n of declared) shadow.set(n, (shadow.get(n) ?? 0) - 1);
  };
  visit(sf);
  return { counts, members, opaque, writes };
}

export function buildRefIndexForNode(ts: Ts, root: TS.Node): RefIndex {
  const counts = new Map<string, number>();
  const members = new Map<string, Set<string>>();
  const opaque = new Map<string, number>();
  const visit = (node: TS.Node): void => {
    if (ts.isIdentifier(node)) {
      if (!isReferencePosition(ts, node)) return;
      const name = node.text;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      const p = node.parent;
      if (ts.isPropertyAccessExpression(p) && p.expression === node) {
        let set = members.get(name);
        if (!set) {
          set = new Set();
          members.set(name, set);
        }
        set.add(p.name.text);
      } else {
        opaque.set(name, (opaque.get(name) ?? 0) + 1);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return { counts, members, opaque, writes: new Map() };
}
