/**
 * Per-file facts for the dead-code engine, read from the TypeScript parser.
 *
 * Syntax only — no Program, no type checker — so a 9k-file monorepo parses in
 * seconds and the result is cacheable by content hash. Everything here is a
 * fact about ONE file; cross-file meaning (what is used, what is dead) is the
 * analyzer's job.
 *
 * Every ambiguity resolves toward "used": an import whose names cannot be
 * determined becomes `'all'`, a shadowed identifier still counts as a
 * reference. A missed dead symbol costs nothing; a false one costs trust.
 */

import type * as TS from '@typescript/typescript6';

type Ts = typeof import('@typescript/typescript6');

let tsLoad: Promise<Ts> | null = null;

/**
 * Lazy runtime import of an EXTERNAL package (see codebase-index/ts-parser.ts:
 * esbuild inlines in-repo dynamic imports, so only this boundary keeps the
 * ~9MB compiler out of bundles that never scan for dead code).
 */
export function loadTypescript(): Promise<Ts> {
  tsLoad ??= import('@typescript/typescript6').then(
    (m) => ((m as unknown as { default?: Ts }).default ?? m) as Ts,
  );
  return tsLoad;
}

export interface ImportedName {
  /** Name in the target module's export table (`default` for default imports). */
  imported: string;
  typeOnly: boolean;
}

export type ImportKind =
  | 'import'
  | 'dynamic'
  | 'require'
  | 'side-effect'
  | 'type-import'
  | 'mock'
  | 'glob';

export interface ImportFact {
  spec: string;
  kind: ImportKind;
  /** `'all'` = every export may be used (namespace passed around, opaque dynamic import). */
  names: ImportedName[] | 'all';
  line: number;
}

export interface ReExportFact {
  spec: string;
  /** `export * from` */
  star: boolean;
  /** `export * as ns from` */
  namespace?: string | undefined;
  names: Array<{ imported: string; exported: string; typeOnly: boolean }>;
  line: number;
  /** `import { x } from './m'; export { x };` — removed through the export list. */
  viaImport?: boolean | undefined;
}

export interface ExportFact {
  /** Exported name (`default` for default exports). */
  name: string;
  /** Local binding behind the export, when there is one. */
  local: string | null;
  kind: string;
  typeOnly: boolean;
  line: number;
  endLine: number;
  /** The local binding is referenced elsewhere in the file. */
  usedLocally: boolean;
  /** `@public` / `@keep` / `dead-code-ignore` — never report. */
  keep: boolean;
  /** Set when only a human can remove it (destructured or multi-declarator statement…). */
  manual?: string | undefined;
  /**
   * Named in the signature of another exported declaration (`stats(): Stats`).
   * Code elsewhere can infer that type, and declaration emit then needs the name.
   */
  surfaced?: boolean | undefined;
}

export interface LocalFact {
  name: string;
  kind: string;
  line: number;
  endLine: number;
  refs: number;
  keep: boolean;
  manual?: string | undefined;
}

export interface ModuleFacts {
  imports: ImportFact[];
  reexports: ReExportFact[];
  exports: ExportFact[];
  locals: LocalFact[];
  /** String literals shaped like code-file paths (`new URL('./w.ts', …)`, `fork('child.js')`). */
  pathLiterals: string[];
  /** Strings shaped like npm package names (`'jsdom'`, `'@scope/pkg'`) — config-style dependency use. */
  packageLiterals: string[];
  /** Static prefixes of template-literal dynamic imports (`import(\`./locales/${x}\`)`). */
  dynamicPrefixes: string[];
  /** Dynamic imports / requires whose specifier is fully computed. */
  opaqueDynamicImports: number;
  /** `module.exports` / `exports.x =` — the export table is not statically knowable. */
  commonJs: boolean;
  /** `dead-code-ignore-file` marker at the top of the file. */
  ignoreFile: boolean;
  /** JSX/TSX syntax present (used only for diagnostics). */
  parseErrors: number;
}

const PACKAGE_LITERAL = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w.@-]+)*$/;
const ENV_PRAGMA = /@(?:vitest|jest)-environment\s+([\w@./-]+)/g;
const CODE_PATH_LITERAL = /^[\w@.~/\\-][\w@.~/\\ -]*\.(?:[cm]?[jt]sx?)$/i;
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

function lineOf(sf: TS.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function hasModifier(ts: Ts, node: TS.Node, kind: TS.SyntaxKind): boolean {
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

interface RefIndex {
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

function namesFromBindingPattern(ts: Ts, pattern: TS.BindingName): ImportedName[] | 'all' {
  if (!ts.isObjectBindingPattern(pattern)) return 'all';
  const names: ImportedName[] = [];
  for (const el of pattern.elements) {
    if (el.dotDotDotToken) return 'all';
    const key = el.propertyName ?? el.name;
    if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) {
      names.push({ imported: key.text, typeOnly: false });
    } else {
      return 'all';
    }
  }
  return names;
}

/**
 * The names a dynamic `import()` / `require()` call actually reads.
 * `pendingNamespaces` collects `const m = await import(...)` bindings whose
 * member reads are resolved once the whole file's references are known.
 */
function namesForModuleCall(
  ts: Ts,
  call: TS.CallExpression,
  fact: ImportFact,
  pendingNamespaces: Array<{ local: string; fact: ImportFact }>,
): ImportedName[] | 'all' {
  let node: TS.Node = call;
  // Unwrap `await`, parentheses and `as` casts.
  for (;;) {
    const p = node.parent;
    if (!p) break;
    if (
      ts.isAwaitExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isSatisfiesExpression(p)
    ) {
      node = p;
      continue;
    }
    break;
  }
  const p = node.parent;
  if (!p) return 'all';
  if (ts.isVariableDeclaration(p) && p.initializer === node) {
    if (ts.isIdentifier(p.name)) {
      const local = p.name.text;
      const scope = p.parent.parent.parent;
      if (!scope || ts.isSourceFile(scope)) {
        // Top-level binding: resolved against the whole file's references.
        pendingNamespaces.push({ local, fact });
        return [];
      }
      // `const m = await import('./x')` inside a function: its member reads
      // live in that block (the file-wide index treats it as shadowed).
      const inner = buildRefIndexForNode(ts, scope);
      if ((inner.opaque.get(local) ?? 0) > 0) return 'all';
      return [...(inner.members.get(local) ?? [])].map((imported) => ({
        imported,
        typeOnly: false,
      }));
    }
    return namesFromBindingPattern(ts, p.name);
  }
  if (ts.isPropertyAccessExpression(p) && p.expression === node) {
    const member = p.name.text;
    // `import('./m').then(({ a }) => …)` / `.then((m) => m.a)`
    if (member === 'then' && call.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const thenCall = p.parent;
      if (thenCall && ts.isCallExpression(thenCall) && thenCall.expression === p) {
        const cb = thenCall.arguments[0];
        if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
          const param = cb.parameters[0];
          if (!param) return [];
          if (ts.isObjectBindingPattern(param.name)) return namesFromBindingPattern(ts, param.name);
          if (ts.isIdentifier(param.name)) {
            const local = param.name.text;
            const inner = buildRefIndexForNode(ts, cb.body);
            if ((inner.opaque.get(local) ?? 0) > 0) return 'all';
            return [...(inner.members.get(local) ?? [])].map((imported) => ({
              imported,
              typeOnly: false,
            }));
          }
        }
      }
      return 'all';
    }
    return [{ imported: member, typeOnly: false }];
  }
  if (ts.isExpressionStatement(p)) return [];
  return 'all';
}

function buildRefIndexForNode(ts: Ts, root: TS.Node): RefIndex {
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

function declKind(ts: Ts, node: TS.Node): string {
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

function isTypeOnlyDecl(ts: Ts, node: TS.Node): boolean {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

const MOCK_CALLEES = new Set([
  'vi.mock',
  'vi.doMock',
  'vi.unmock',
  'vi.importActual',
  'vi.importMock',
  'jest.mock',
  'jest.doMock',
  'jest.requireActual',
  'jest.requireMock',
]);

function calleeText(ts: Ts, expr: TS.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeText(ts, expr.expression);
    return left === null ? null : `${left}.${expr.name.text}`;
  }
  return null;
}

/**
 * Identifiers used as TYPES in the signatures of exported top-level
 * declarations: parameter / return / property types, heritage clauses, type
 * alias and interface bodies. Function bodies and initializers are skipped —
 * what matters is what a consumer's inferred types can mention.
 */
function collectSignatureTypeNames(
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

export function extractModuleFacts(ts: Ts, file: string, text: string): ModuleFacts {
  const sf = createSource(ts, file, text);
  const K = ts.SyntaxKind;
  const refs = buildRefIndex(ts, sf);
  const facts: ModuleFacts = {
    imports: [],
    reexports: [],
    exports: [],
    locals: [],
    pathLiterals: [],
    packageLiterals: [],
    dynamicPrefixes: [],
    opaqueDynamicImports: 0,
    commonJs: false,
    ignoreFile: text.slice(0, 2048).includes('dead-code-ignore-file'),
    parseErrors: (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length ?? 0,
  };

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

  // ── Whole-file walk: dynamic imports, requires, mocks, path literals ───
  const visit = (node: TS.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg0 = node.arguments[0];
      const line = lineOf(sf, node.getStart(sf));
      if (
        callee.kind === K.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === 'require')
      ) {
        const kind: ImportKind = callee.kind === K.ImportKeyword ? 'dynamic' : 'require';
        if (arg0 && ts.isStringLiteralLike(arg0)) {
          consumedLiterals.add(arg0);
          const fact: ImportFact = { spec: arg0.text, kind, names: 'all', line };
          fact.names = namesForModuleCall(ts, node, fact, namespaceBindings);
          facts.imports.push(fact);
        } else if (arg0 && ts.isTemplateExpression(arg0)) {
          const head = arg0.head.text;
          if (head.startsWith('.') || head.startsWith('/')) facts.dynamicPrefixes.push(head);
          else facts.opaqueDynamicImports++;
        } else if (arg0) {
          facts.opaqueDynamicImports++;
        }
      } else {
        const name = calleeText(ts, callee);
        if (name && arg0 && ts.isStringLiteralLike(arg0)) {
          if (MOCK_CALLEES.has(name)) {
            consumedLiterals.add(arg0);
            facts.imports.push({ spec: arg0.text, kind: 'mock', names: [], line });
          } else if (name === 'require.resolve' || name.endsWith('.resolve')) {
            if (name === 'require.resolve' || name === 'import.meta.resolve') {
              consumedLiterals.add(arg0);
              facts.imports.push({ spec: arg0.text, kind: 'side-effect', names: [], line });
            }
          } else if (name === 'import.meta.glob' || name === 'import.meta.globEager') {
            consumedLiterals.add(arg0);
            facts.imports.push({ spec: arg0.text, kind: 'glob', names: 'all', line });
          }
        }
        if (name === 'import.meta.glob' && arg0 && ts.isArrayLiteralExpression(arg0)) {
          for (const el of arg0.elements) {
            if (ts.isStringLiteralLike(el)) {
              consumedLiterals.add(el);
              facts.imports.push({ spec: el.text, kind: 'glob', names: 'all', line });
            }
          }
        }
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteralLike(arg.literal)) {
        consumedLiterals.add(arg.literal);
        let first: string | null = null;
        if (node.qualifier) {
          let q: TS.EntityName = node.qualifier;
          while (ts.isQualifiedName(q)) q = q.left;
          first = q.text;
        }
        facts.imports.push({
          spec: arg.literal.text,
          kind: 'type-import',
          names: first ? [{ imported: first, typeOnly: true }] : 'all',
          line: lineOf(sf, node.getStart(sf)),
        });
      }
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !consumedLiterals.has(node)
    ) {
      const value = node.text;
      if (value.length < 300 && CODE_PATH_LITERAL.test(value) && !value.includes('*')) {
        facts.pathLiterals.push(value);
      } else if (value.length <= 100 && PACKAGE_LITERAL.test(value)) {
        facts.packageLiterals.push(value);
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'module' &&
      node.name.text === 'exports'
    ) {
      facts.commonJs = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Namespace-shaped bindings: only the members actually read are used.
  for (const { local, fact } of namespaceBindings) {
    if ((refs.opaque.get(local) ?? 0) > 0 || fact.names === 'all') {
      fact.names = 'all';
      continue;
    }
    const read = refs.members.get(local);
    if (read) {
      for (const imported of read) fact.names.push({ imported, typeOnly: false });
    }
  }

  ENV_PRAGMA.lastIndex = 0;
  for (const head = text.slice(0, 4096); ; ) {
    const m = ENV_PRAGMA.exec(head);
    if (m === null) break;
    facts.packageLiterals.push(m[1]!);
  }
  facts.pathLiterals = [...new Set(facts.pathLiterals)];
  facts.packageLiterals = [...new Set(facts.packageLiterals)];
  return facts;
}
