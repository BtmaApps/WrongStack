import type * as TS from '@typescript/typescript6';
import type { SymbolLang } from './schema.js';
import { parseTreeSitterAst } from './tree-sitter-parser.js';

type TsModule = typeof import('@typescript/typescript6');
let tsModule: TsModule | null = null;
async function loadTs(): Promise<TsModule> {
  if (!tsModule) {
    const mod = await import('@typescript/typescript6');
    tsModule = ((mod as unknown as { default?: TsModule }).default ?? mod) as TsModule;
  }
  return tsModule;
}

interface ParameterContract {
  name: string;
  isOptional: boolean;
  hasDefault: boolean;
  isRest: boolean;
  type?: string | undefined;
}

interface FunctionContract {
  name: string;
  isExported: boolean;
  params: ParameterContract[];
  returnType?: string | undefined;
}

interface InterfacePropertyContract {
  name: string;
  isOptional: boolean;
  hasDefault?: boolean | undefined;
  type?: string | undefined;
}

interface InterfaceContract {
  name: string;
  isExported: boolean;
  properties: InterfacePropertyContract[];
  methods: Array<{
    name: string;
    isOptional: boolean;
    params: ParameterContract[];
    returnType?: string | undefined;
  }>;
}

export interface ModuleContract {
  lang: SymbolLang;
  exports: Set<string>;
  /**
   * Keyed by SCOPED name (`Class.method`, `Receiver.Method`, `Type.fn`): a
   * bare-name key let `impl A { fn new }` overwrite `impl B { fn new }`, so the
   * rules compared unrelated functions and missed the real change.
   */
  functions: Map<string, FunctionContract>;
  interfaces: Map<string, InterfaceContract>;
  /** False when this language has no extractor or its grammar did not load. */
  supported: boolean;
}

/** Languages the tree-sitter extractor has rules for. */
const TREE_SITTER_RULE_LANGS: ReadonlySet<SymbolLang> = new Set<SymbolLang>(['py', 'go', 'rs']);

/**
 * TypeScript & JavaScript extraction via TS Compiler API.
 */
export async function extractTsContract(code: string, lang: SymbolLang): Promise<ModuleContract> {
  const ts = await loadTs();
  const scriptKind =
    lang === 'tsx'
      ? ts.ScriptKind.TSX
      : lang === 'jsx'
        ? ts.ScriptKind.JSX
        : lang === 'js'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    lang === 'tsx' ? 'contract.tsx' : 'contract.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const exports = new Set<string>();
  const functions = new Map<string, FunctionContract>();
  const interfaces = new Map<string, InterfaceContract>();

  function hasModifier(node: TS.Node, kind: TS.SyntaxKind): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    return ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false;
  }

  function isExportedNode(node: TS.Node): boolean {
    return hasModifier(node, ts.SyntaxKind.ExportKeyword);
  }

  /**
   * Record an exported declaration. `export default function f` is imported
   * as `default`, so that is the name whose removal breaks consumers.
   */
  function recordExport(node: TS.Node, name: string | undefined): boolean {
    if (!isExportedNode(node)) return false;
    if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) exports.add('default');
    else if (name) exports.add(name);
    return true;
  }

  function paramsOf(params: readonly TS.ParameterDeclaration[]): ParameterContract[] {
    return params.map((p) => ({
      name: p.name.getText(sourceFile),
      isOptional: Boolean(p.questionToken),
      hasDefault: Boolean(p.initializer),
      isRest: Boolean(p.dotDotDotToken),
      type: p.type ? p.type.getText(sourceFile) : undefined,
    }));
  }

  function bindingNames(name: TS.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    const names: string[] = [];
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) names.push(...bindingNames(element.name));
    }
    return names;
  }

  function isFunctionLike(node: TS.Node): boolean {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node)
    );
  }

  // Declarations inside a function body are locals, not the module's
  // contract; registering them made two unrelated `const handler = () => …`
  // locals collide on one key.
  let functionDepth = 0;

  function visit(node: TS.Node) {
    // export { a, b } / export * as ns from '…' / export * from '…'
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exports.add(element.name.text);
        }
      } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
        exports.add(node.exportClause.name.text);
      } else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        exports.add(`* from '${node.moduleSpecifier.text}'`);
      }
    }

    // export default <expr> / export = <expr>
    if (ts.isExportAssignment(node)) {
      exports.add(node.isExportEquals ? 'export =' : 'default');
    }

    if (functionDepth === 0) {
      // Functions
      if (ts.isFunctionDeclaration(node)) {
        const name = node.name?.text;
        const isExp = recordExport(node, name);
        const key = name ?? (isExp ? 'default' : undefined);
        if (key) {
          functions.set(key, {
            name: key,
            isExported: isExp,
            params: paramsOf(node.parameters),
            returnType: node.type ? node.type.getText(sourceFile) : undefined,
          });
        }
      }

      // `export const fn = (a) => …` is a function contract too.
      if (ts.isVariableStatement(node)) {
        const isExp = isExportedNode(node);
        for (const decl of node.declarationList.declarations) {
          const names = bindingNames(decl.name);
          if (isExp) for (const n of names) exports.add(n);
          const init = decl.initializer;
          if (
            ts.isIdentifier(decl.name) &&
            init &&
            (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
          ) {
            const name = decl.name.text;
            functions.set(name, {
              name,
              isExported: isExp,
              params: paramsOf(init.parameters),
              returnType: init.type ? init.type.getText(sourceFile) : undefined,
            });
          }
        }
      }

      // Classes, their methods and constructors
      if (ts.isClassDeclaration(node)) {
        const className = node.name?.text ?? 'default';
        const isExp = recordExport(node, node.name?.text);

        for (const member of node.members) {
          let memberName: string | undefined;
          let params: readonly TS.ParameterDeclaration[] | undefined;
          let returnType: string | undefined;
          if (ts.isConstructorDeclaration(member)) {
            memberName = 'constructor';
            params = member.parameters;
          } else if (
            ts.isMethodDeclaration(member) &&
            (ts.isIdentifier(member.name) || ts.isPrivateIdentifier(member.name))
          ) {
            memberName = member.name.text;
            params = member.parameters;
            returnType = member.type ? member.type.getText(sourceFile) : undefined;
          }
          if (memberName === undefined || params === undefined) continue;
          const fullMethodName = `${className}.${memberName}`;
          const existing = functions.get(fullMethodName);
          // Constructor/method overloads: keep the implementation (the one with a body).
          if (existing && !('body' in member && member.body)) continue;
          functions.set(fullMethodName, {
            name: fullMethodName,
            isExported: isExp,
            params: paramsOf(params),
            returnType,
          });
        }
      }

      if (ts.isEnumDeclaration(node)) {
        recordExport(node, node.name.text);
      }

      if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        recordExport(node, node.name.text);
      }

      // Interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const isExp = recordExport(node, name);

        const properties: InterfacePropertyContract[] = [];
        const methods: InterfaceContract['methods'] = [];

        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const isOptional = Boolean(member.questionToken);
            const type = member.type ? member.type.getText(sourceFile) : undefined;
            properties.push({ name: propName, isOptional, type });
          } else if (ts.isMethodSignature(member) && member.name) {
            const methodName = member.name.getText(sourceFile);
            const isOptional = Boolean(member.questionToken);
            const params: ParameterContract[] = member.parameters.map((p) => ({
              name: p.name.getText(sourceFile),
              isOptional: Boolean(p.questionToken),
              hasDefault: Boolean(p.initializer),
              isRest: Boolean(p.dotDotDotToken),
            }));
            const returnType = member.type ? member.type.getText(sourceFile) : undefined;
            methods.push({ name: methodName, isOptional, params, returnType });
          }
        }

        interfaces.set(name, { name, isExported: isExp, properties, methods });
      }

      // Type aliases (every form is an export; object literals also carry properties)
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const isExp = recordExport(node, name);

        if (ts.isTypeLiteralNode(node.type)) {
          const properties: InterfacePropertyContract[] = [];
          for (const member of node.type.members) {
            if (ts.isPropertySignature(member) && member.name) {
              const propName = member.name.getText(sourceFile);
              const isOptional = Boolean(member.questionToken);
              const type = member.type ? member.type.getText(sourceFile) : undefined;
              properties.push({ name: propName, isOptional, type });
            }
          }
          interfaces.set(name, { name, isExported: isExp, properties, methods: [] });
        }
      }
    }

    const fn = isFunctionLike(node);
    if (fn) functionDepth++;
    ts.forEachChild(node, visit);
    if (fn) functionDepth--;
  }

  ts.forEachChild(sourceFile, visit);

  return { lang, exports, functions, interfaces, supported: true };
}

/**
 * Polyglot extraction (Python, Go, Rust) via Tree-sitter WASM.
 */
export async function extractTreeSitterContract(
  code: string,
  lang: SymbolLang,
): Promise<ModuleContract> {
  const exports = new Set<string>();
  const functions = new Map<string, FunctionContract>();
  const interfaces = new Map<string, InterfaceContract>();

  if (!TREE_SITTER_RULE_LANGS.has(lang)) {
    return { lang, exports, functions, interfaces, supported: false };
  }

  const parsed = await parseTreeSitterAst({ content: code, lang });
  if (!parsed) {
    return { lang, exports, functions, interfaces, supported: false };
  }

  const { tree, parser } = parsed;

  try {
    const root = tree.rootNode;
    /** Enclosing named scopes; `isType` = class/impl/trait (vs. a function). */
    const scope: Array<{ name: string; isType: boolean }> = [];
    const qualify = (name: string): string =>
      scope.length > 0 ? `${scope.map((s) => s.name).join('.')}.${name}` : name;
    const insideFunction = (): boolean => scope.some((s) => !s.isType);

    function walk(node: import('web-tree-sitter').Node) {
      const type = node.type;
      let pushed: { name: string; isType: boolean } | undefined;

      // ─── PYTHON ─────────────────────────────────────────────────────────────
      if (lang === 'py') {
        if (type === 'function_definition') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = nameNode.text;
            const qualified = qualify(name);
            // Public unless any segment is private (`_x`); dunders (`__init__`)
            // are part of the public protocol. Nested functions are never API.
            const isExported =
              !insideFunction() &&
              !qualified
                .split('.')
                .some((s) => s.startsWith('_') && !(s.startsWith('__') && s.endsWith('__')));
            if (isExported) exports.add(qualified);

            const paramsNode = node.childForFieldName('parameters');
            const params: ParameterContract[] = [];

            if (paramsNode) {
              for (let i = 0; i < paramsNode.namedChildCount; i++) {
                const param = paramsNode.namedChild(i);
                if (!param) continue;
                // `/` and bare `*` are markers, not parameters.
                if (
                  param.type === 'positional_separator' ||
                  param.type === 'keyword_separator' ||
                  param.type === 'comment'
                ) {
                  continue;
                }
                const pText = param.text;
                const isRest = pText.startsWith('*');
                const hasDefault =
                  param.type === 'default_parameter' ||
                  param.type === 'typed_default_parameter' ||
                  pText.includes('=');
                const idNode = param.childForFieldName('name') ?? param;
                params.push({
                  name: idNode.text.split(':')[0]?.trim() ?? idNode.text,
                  isOptional: hasDefault || isRest,
                  hasDefault,
                  isRest,
                });
              }
            }

            functions.set(qualified, { name: qualified, isExported, params });
            pushed = { name, isType: false };
          }
        } else if (type === 'class_definition') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = nameNode.text;
            const qualified = qualify(name);
            if (!insideFunction() && !qualified.split('.').some((s) => s.startsWith('_'))) {
              exports.add(qualified);
            }
            pushed = { name, isType: true };
          }
        }
      }

      // ─── GO ─────────────────────────────────────────────────────────────────
      else if (lang === 'go') {
        if (type === 'function_declaration' || type === 'method_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = nameNode.text;
            let key = name;
            if (type === 'method_declaration') {
              // `(s *Server)` / `(List[T])` → `Server` / `List`
              const receiver = node.childForFieldName('receiver')?.text ?? '';
              const receiverType = /([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\)\s*$/.exec(receiver)?.[1];
              if (receiverType) key = `${receiverType}.${name}`;
            }
            const isExported = /^[A-Z]/.test(name);
            if (isExported) exports.add(key);

            const paramsNode = node.childForFieldName('parameters');
            const params: ParameterContract[] = [];

            if (paramsNode) {
              for (let i = 0; i < paramsNode.namedChildCount; i++) {
                const param = paramsNode.namedChild(i);
                if (!param || param.type === 'comment') continue;
                const isRest = param.type === 'variadic_parameter_declaration';
                // `a, b int` is ONE declaration carrying two parameters.
                const names = param.childrenForFieldName('name').filter((n) => n !== null);
                if (names.length === 0) {
                  params.push({ name: param.text, isOptional: false, hasDefault: false, isRest });
                } else {
                  for (const n of names) {
                    params.push({ name: n.text, isOptional: false, hasDefault: false, isRest });
                  }
                }
              }
            }

            functions.set(key, { name: key, isExported, params });
          }
        } else if (type === 'type_spec') {
          const nameNode = node.childForFieldName('name');
          const typeNode = node.childForFieldName('type');
          if (nameNode) {
            const name = nameNode.text;
            const isExported = /^[A-Z]/.test(name);
            if (isExported) exports.add(name);

            if (typeNode && typeNode.type === 'interface_type') {
              const methods: InterfaceContract['methods'] = [];
              for (let i = 0; i < typeNode.namedChildCount; i++) {
                const elem = typeNode.namedChild(i);
                if (elem && (elem.type === 'method_spec' || elem.type === 'method_elem')) {
                  const mName =
                    elem.childForFieldName('name')?.text ?? elem.text.split('(')[0]?.trim() ?? '';
                  if (mName) {
                    methods.push({ name: mName, isOptional: false, params: [] });
                  }
                }
              }
              interfaces.set(name, { name, isExported, properties: [], methods });
            }
          }
        }
      }

      // ─── RUST ────────────────────────────────────────────────────────────────
      else if (lang === 'rs') {
        if (type === 'impl_item') {
          const implType = node.childForFieldName('type')?.text.replace(/<[\s\S]*$/, '');
          if (implType) pushed = { name: implType.trim(), isType: true };
        } else if (type === 'function_item') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = nameNode.text;
            const qualified = qualify(name);
            const isExported =
              !insideFunction() && node.children.some((c) => c.type === 'visibility_modifier');
            if (isExported) exports.add(qualified);

            const paramsNode = node.childForFieldName('parameters');
            const params: ParameterContract[] = [];

            if (paramsNode) {
              for (let i = 0; i < paramsNode.namedChildCount; i++) {
                const param = paramsNode.namedChild(i);
                if (
                  !param ||
                  param.type === 'attribute_item' ||
                  param.type === 'line_comment' ||
                  param.type === 'block_comment'
                ) {
                  continue;
                }
                params.push({
                  name: param.text,
                  isOptional: false,
                  hasDefault: false,
                  isRest: false,
                });
              }
            }

            functions.set(qualified, { name: qualified, isExported, params });
            pushed = { name, isType: false };
          }
        } else if (type === 'trait_item') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const name = nameNode.text;
            const isExported = node.children.some((c) => c.type === 'visibility_modifier');
            if (isExported) exports.add(qualify(name));

            const methods: InterfaceContract['methods'] = [];
            const bodyNode = node.childForFieldName('body');
            if (bodyNode) {
              for (let i = 0; i < bodyNode.namedChildCount; i++) {
                const child = bodyNode.namedChild(i);
                if (
                  child &&
                  (child.type === 'function_item' || child.type === 'function_signature_item')
                ) {
                  const mName = child.childForFieldName('name')?.text;
                  const hasDefaultBody = Boolean(child.childForFieldName('body'));
                  if (mName) {
                    methods.push({
                      name: mName,
                      isOptional: hasDefaultBody,
                      params: [],
                    });
                  }
                }
              }
            }

            interfaces.set(qualify(name), {
              name: qualify(name),
              isExported,
              properties: [],
              methods,
            });
            pushed = { name, isType: true };
          }
        }
      }

      if (pushed) scope.push(pushed);
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) walk(child);
      }
      if (pushed) scope.pop();
    }

    walk(root);
    return { lang, exports, functions, interfaces, supported: true };
  } finally {
    tree.delete();
    parser.delete();
  }
}
