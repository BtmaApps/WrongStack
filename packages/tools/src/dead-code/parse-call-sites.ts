/**
 * Call-site facts for the dead-code parser: dynamic `import()` / `require()`
 * names, test-runner mocks, `import.meta.glob`, import types, and string
 * literals shaped like code paths or package names.
 */

import type * as TS from '@typescript/typescript6';
import type { ImportedName, ImportFact, ImportKind, ModuleFacts } from './parse-facts.js';
import { buildRefIndexForNode, lineOf } from './parse-refs.js';

type Ts = typeof import('@typescript/typescript6');

const PACKAGE_LITERAL = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w.@-]+)*$/;
const CODE_PATH_LITERAL = /^[\w@.~/\\-][\w@.~/\\ -]*\.(?:[cm]?[jt]sx?)$/i;

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

export function calleeText(ts: Ts, expr: TS.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeText(ts, expr.expression);
    return left === null ? null : `${left}.${expr.name.text}`;
  }
  if (expr.kind === ts.SyntaxKind.MetaProperty) {
    // `import.meta.glob(...)` / `import.meta.resolve(...)`: `import.meta` is a
    // MetaProperty whose only Identifier child is `meta` (the `import` / `new`
    // base is a keyword token, not an Identifier node). Render the dotted name
    // so the `import.meta.*` detection branches in the whole-file walk match.
    let name: string | null = null;
    ts.forEachChild(expr, (child) => {
      if (ts.isIdentifier(child)) name = child.text;
    });
    return name === 'meta' ? 'import.meta' : null;
  }
  return null;
}

/** Whole-file walk: dynamic imports, requires, mocks, path literals. */
export function collectCallSiteFacts(
  ts: Ts,
  sf: TS.SourceFile,
  facts: ModuleFacts,
  consumedLiterals: Set<TS.Node>,
  namespaceBindings: Array<{ local: string; fact: ImportFact }>,
): void {
  const K = ts.SyntaxKind;
  let usesJsx = false;
  const visit = (node: TS.Node): void => {
    if (
      !usesJsx &&
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    ) {
      usesJsx = true;
    }
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
  // The automatic JSX runtime imports `react/jsx-runtime` with no import in the
  // source. (A configured `jsxImportSource` is quoted in tsconfig and counted there.)
  if (usesJsx) facts.packageLiterals.push('react/jsx-runtime');
}
