import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as TS from '@typescript/typescript6';
import { atomicWrite } from '@wrongstack/core/utils';
import { type InvariantViolation, polyglotInvariantEngine } from './ast-invariant-engine.js';
import { enqueueReindex } from './background-indexer.js';
import { detectLang } from './languages.js';
import type { SymbolLang } from './schema.js';
import { parseTreeSitterAst, treeSitterDeclarationName } from './tree-sitter-parser.js';

type TsModule = typeof import('@typescript/typescript6');
let tsModule: TsModule | null = null;
async function loadTs(): Promise<TsModule> {
  if (!tsModule) {
    const mod = await import('@typescript/typescript6');
    tsModule = ((mod as unknown as { default?: TsModule }).default ?? mod) as TsModule;
  }
  return tsModule;
}

export interface MutateSymbolOptions {
  file: string;
  symbol: string;
  newBody: string;
  target?: 'body' | 'full' | undefined;
  checkInvariants?: boolean | undefined;
  allowBreakingChanges?: boolean | undefined;
}

export interface MutateSymbolResult {
  file: string;
  symbol: string;
  originalRange: { startLine: number; endLine: number };
  newRange: { startLine: number; endLine: number };
  updatedContent: string;
  violations?: InvariantViolation[] | undefined;
}

interface TsMatch {
  node: TS.Node;
  body: TS.Node | null;
  /** Dotted path through enclosing named declarations, e.g. `Cart.total`. */
  qualified: string;
  line: number;
}

/** Leading whitespace of the line containing `pos`. */
function indentAt(content: string, pos: number): string {
  const lineStart = content.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(content.slice(lineStart, pos))?.[0] ?? '';
}

/** Strip the common indent of `text`, then prefix every non-blank line with `indent`. */
function reindent(text: string, indent: string): string {
  const lines = text
    .replace(/^\s*\n/, '')
    .trimEnd()
    .split('\n');
  const widths = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0);
  const common = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map((l) => (l.trim() ? `${indent}${l.slice(common)}` : '')).join('\n');
}

/**
 * Replace a symbol's body or full declaration using TypeScript Compiler AST.
 */
async function mutateTsSymbol(
  content: string,
  lang: SymbolLang,
  symbolName: string,
  newBody: string,
  target: 'body' | 'full' = 'body',
): Promise<MutateSymbolResult | null> {
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
    lang === 'tsx' ? 'temp.tsx' : 'temp.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const nameOf = (node: TS.Node): string | undefined => {
    const n = (node as { name?: TS.Node }).name;
    if (!n) return undefined;
    return ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n)
      ? n.text
      : undefined;
  };

  // Collect EVERY named declaration. The old walker stopped at the first
  // same-named node in pre-order, so `Cart.total` vs `Invoice.total` silently
  // rewrote whichever came first.
  const matches: TsMatch[] = [];
  const scope: string[] = [];

  function visit(node: TS.Node) {
    let declared: string | undefined;
    let body: TS.Node | null = null;

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node)
    ) {
      declared = nameOf(node);
      body = node.body ?? null;
    } else if (ts.isConstructorDeclaration(node)) {
      declared = 'constructor';
      body = node.body ?? null;
    } else if (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      declared = nameOf(node);
    } else if (ts.isTypeAliasDeclaration(node)) {
      declared = nameOf(node);
      body = node.type;
    } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
      declared = nameOf(node);
      const init = node.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        body = init.body;
      }
    }

    if (declared === undefined) {
      ts.forEachChild(node, visit);
      return;
    }

    matches.push({
      node,
      body,
      qualified: [...scope, declared].join('.'),
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    });
    scope.push(declared);
    ts.forEachChild(node, visit);
    scope.pop();
  }

  ts.forEachChild(sourceFile, visit);

  // `total` matches `Cart.total`; `Cart.total` matches `ns.Cart.total`.
  let candidates = matches.filter(
    (m) => m.qualified === symbolName || m.qualified.endsWith(`.${symbolName}`),
  );
  if (candidates.length === 0) return null;

  // Overloads: N signatures + one implementation share a qualified name —
  // that is one symbol, and the implementation is the only editable body.
  if (candidates.length > 1) {
    const first = candidates[0]?.qualified;
    const overloadable = candidates.every(
      (m) =>
        m.qualified === first &&
        (ts.isFunctionDeclaration(m.node) ||
          ts.isMethodDeclaration(m.node) ||
          ts.isConstructorDeclaration(m.node)),
    );
    const implemented = candidates.filter((m) => m.body !== null);
    if (overloadable && implemented.length === 1) candidates = implemented;
  }

  if (candidates.length > 1) {
    const listed = candidates.map((m) => `${m.qualified} (L${m.line})`).join(', ');
    const example = candidates.find((m) => m.qualified.includes('.'))?.qualified;
    throw new Error(
      `Symbol '${symbolName}' is ambiguous: ${candidates.length} declarations match — ${listed}. ` +
        (example
          ? `Pass a qualified name, e.g. symbol: "${example}".`
          : 'Rename-free disambiguation is impossible here; use the edit tool.'),
    );
  }

  const match = candidates[0] as TsMatch;

  // A body-less declaration (class, interface, enum, namespace, abstract
  // method, `const x = 5`) used to fall through to a FULL replacement in body
  // mode: `newBody: "foo() {}"` overwrote `export class Cart {…}` wholesale.
  if (target === 'body' && !match.body) {
    throw new Error(
      `'${match.qualified}' (L${match.line}) is a ${ts.SyntaxKind[match.node.kind]} with no replaceable body. ` +
        'Pass target: "full" with the complete new declaration, or name a function/method inside it.',
    );
  }

  // A `full` replacement of a single-declarator variable must cover the whole
  // statement — the declarator alone starts after `export const`, so a new
  // `export const x = …` doubled the keywords.
  let fullNode: TS.Node = match.node;
  if (ts.isVariableDeclaration(match.node)) {
    const list = match.node.parent;
    const stmt = list?.parent;
    if (
      list &&
      ts.isVariableDeclarationList(list) &&
      list.declarations.length === 1 &&
      stmt &&
      ts.isVariableStatement(stmt)
    ) {
      fullNode = stmt;
    }
  }

  const replaceTarget: TS.Node = target === 'full' || !match.body ? fullNode : match.body;
  const startPos = replaceTarget.getStart(sourceFile);
  const endPos = replaceTarget.getEnd();

  const startLine = sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;

  let formattedReplacement = newBody.trim();
  if (
    target === 'body' &&
    match.body &&
    ts.isBlock(match.body) &&
    !formattedReplacement.startsWith('{')
  ) {
    // Indent relative to the declaration, not a hard-coded two spaces: a
    // class method at depth 1 needs its statements at depth 2.
    const baseIndent = indentAt(content, fullNode.getStart(sourceFile));
    formattedReplacement = `{\n${reindent(newBody, `${baseIndent}  `)}\n${baseIndent}}`;
  } else if (
    target === 'body' &&
    match.body &&
    !ts.isBlock(match.body) &&
    !ts.isTypeNode(match.body) &&
    /^return\b/.test(formattedReplacement)
  ) {
    // Expression-bodied arrow (`=> n`) given statements: `=> return x;` is a
    // syntax error, so promote the body to a block.
    const baseIndent = indentAt(content, fullNode.getStart(sourceFile));
    formattedReplacement = `{\n${reindent(newBody, `${baseIndent}  `)}\n${baseIndent}}`;
  }

  const updatedContent = content.slice(0, startPos) + formattedReplacement + content.slice(endPos);
  const newEndLine = startLine + formattedReplacement.split('\n').length - 1;

  return {
    file: '',
    symbol: symbolName,
    originalRange: { startLine, endLine },
    newRange: { startLine, endLine: newEndLine },
    updatedContent,
  };
}

/**
 * Node types that carry a `name`/`declarator` field without being a
 * replaceable declaration: parameters, call arguments (`f(name=1)`), struct
 * fields, and the inner `*_declarator` of a C definition (which would
 * otherwise duplicate its own `function_definition`).
 */
const NON_DECLARATION_TYPES = /parameter|argument|declarator$|^field_declaration$|^field$/;

const TREE_SITTER_BODY_TYPES = [
  'compound_statement',
  'statement_block',
  'block',
  'function_body',
  'body_statement',
  'code_block',
  'do_block',
];

function bodyOf(node: import('web-tree-sitter').Node): import('web-tree-sitter').Node | null {
  return (
    node.childForFieldName('body') ??
    node.children.find((c) => c !== null && TREE_SITTER_BODY_TYPES.includes(c.type)) ??
    null
  );
}

/** Indent unit used inside an existing brace body (tab for Go when undetectable). */
function indentUnit(bodyText: string, declIndent: string, lang: SymbolLang): string {
  for (const line of bodyText.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)?.[0] ?? '';
    if (lead.startsWith(declIndent) && lead.length > declIndent.length) {
      return lead.slice(declIndent.length);
    }
    break;
  }
  return lang === 'go' ? '\t' : '    ';
}

/**
 * Replace a symbol's body or full declaration using Tree-Sitter AST.
 */
async function mutateTreeSitterSymbol(
  content: string,
  lang: SymbolLang,
  symbolName: string,
  newBody: string,
  target: 'body' | 'full' = 'body',
): Promise<MutateSymbolResult | null> {
  const parsed = await parseTreeSitterAst({ content, lang });
  if (!parsed) return null;

  const { tree, parser } = parsed;
  type TsNode = import('web-tree-sitter').Node;

  try {
    const root = tree.rootNode;
    const matches: Array<{ node: TsNode; body: TsNode | null; qualified: string; line: number }> =
      [];
    const scope: string[] = [];

    // Collect EVERY named declaration (the old walker took the first same-named
    // node in pre-order, so `Cart.total` vs `Invoice.total` silently rewrote
    // whichever came first — the bug already fixed on the TS path).
    function walk(node: TsNode) {
      let pushed: string | undefined;
      if (node.type === 'impl_item') {
        // Rust `impl Foo<T> { fn new }` qualifies as `Foo.new`; not itself a target.
        pushed =
          node
            .childForFieldName('type')
            ?.text.replace(/<[\s\S]*$/, '')
            .trim() || undefined;
      } else if (!NON_DECLARATION_TYPES.test(node.type)) {
        // The old code compared the OUTER C declarator's text, so no C
        // function could ever be found.
        const name = treeSitterDeclarationName(node);
        if (name !== undefined) {
          let prefix = scope;
          if (node.type === 'method_declaration' && lang === 'go') {
            const receiver = node.childForFieldName('receiver')?.text ?? '';
            const receiverType = /([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\)\s*$/.exec(receiver)?.[1];
            if (receiverType) prefix = [...scope, receiverType];
          }
          matches.push({
            node,
            body: bodyOf(node),
            qualified: [...prefix, name].join('.'),
            line: node.startPosition.row + 1,
          });
          pushed = name;
        }
      }

      if (pushed !== undefined) scope.push(pushed);
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) walk(child);
      }
      if (pushed !== undefined) scope.pop();
    }

    walk(root);

    let candidates = matches.filter(
      (m) => m.qualified === symbolName || m.qualified.endsWith(`.${symbolName}`),
    );
    if (candidates.length === 0) return null;
    // A C/C++ prototype plus its definition is one symbol; the definition is
    // the only editable body.
    if (
      candidates.length > 1 &&
      candidates.every((m) => m.qualified === candidates[0]?.qualified)
    ) {
      const withBody = candidates.filter((m) => m.body !== null);
      if (withBody.length === 1) candidates = withBody;
    }
    if (candidates.length > 1) {
      const listed = candidates.map((m) => `${m.qualified} (L${m.line})`).join(', ');
      const example = candidates.find((m) => m.qualified.includes('.'))?.qualified;
      throw new Error(
        `Symbol '${symbolName}' is ambiguous: ${candidates.length} declarations match — ${listed}. ` +
          (example
            ? `Pass a qualified name, e.g. symbol: "${example}".`
            : 'Rename-free disambiguation is impossible here; use the edit tool.'),
      );
    }
    const match = candidates[0] as (typeof matches)[number];

    if (target === 'body' && !match.body) {
      throw new Error(
        `'${match.qualified}' (L${match.line}) is a ${match.node.type} with no replaceable body. ` +
          'Pass target: "full" with the complete new declaration.',
      );
    }

    const replaceTarget: TsNode = target === 'full' ? match.node : (match.body as TsNode);
    const startPos = replaceTarget.startIndex;
    const endPos = replaceTarget.endIndex;

    const startLine = replaceTarget.startPosition.row + 1;
    const endLine = replaceTarget.endPosition.row + 1;

    let formattedReplacement = newBody.trim();
    if (target === 'body') {
      const declIndent = indentAt(content, match.node.startIndex);
      const lineStart = content.lastIndexOf('\n', startPos - 1) + 1;
      const lead = content.slice(lineStart, startPos);
      if (replaceTarget.text.startsWith('{')) {
        // Brace-delimited body: the replacement must stay a block, indented one
        // level below the declaration in the file's own indent unit.
        if (!formattedReplacement.startsWith('{')) {
          const unit = indentUnit(replaceTarget.text, declIndent, lang);
          formattedReplacement = `{\n${reindent(newBody, `${declIndent}${unit}`)}\n${declIndent}}`;
        }
      } else if (/^[ \t]*$/.test(lead)) {
        // Indentation-scoped body (Python, Ruby): every line takes the existing
        // body's indent; the first line's indent is already in `content`. The
        // old hard-coded 4 spaces broke every method body (8 spaces) and
        // double-indented the first line.
        formattedReplacement = reindent(newBody, lead).slice(lead.length);
      } else {
        // Body shares the header line (`def f(): pass`): move it onto its own lines.
        formattedReplacement = `\n${reindent(newBody, `${declIndent}    `)}`;
      }
    }

    const updatedContent =
      content.slice(0, startPos) + formattedReplacement + content.slice(endPos);
    const newEndLine = startLine + formattedReplacement.split('\n').length - 1;

    return {
      file: '',
      symbol: symbolName,
      originalRange: { startLine, endLine },
      newRange: { startLine, endLine: newEndLine },
      updatedContent,
    };
  } finally {
    tree.delete();
    parser.delete();
  }
}

const TEST_CALLEES = '(?:it|test|describe|suite|bench|context|specify)';

/**
 * Explain WHY a lookup failed. The bare "could not be located" gave a model
 * that passed an `it('…')` title no way to learn the tool only resolves
 * declarations — it retried the same shape.
 */
function notFoundMessage(symbol: string, relPath: string, content: string): string {
  const base = `Symbol '${symbol}' could not be located in AST of '${relPath}'`;
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const testCall = new RegExp(
    String.raw`\b${TEST_CALLEES}(?:\.\w+)*\s*\(\s*(['"\x60])${escaped}\1`,
  );
  if (testCall.test(content)) {
    return (
      `${base}: that is a test-case title, not a declaration. codebase-ast-replace only ` +
      'resolves named declarations (function, method, class, interface, type, enum, variable); ' +
      'use the edit tool to change a test case.'
    );
  }
  if (!/^[\p{L}_$#][\p{L}\p{N}_$]*(?:\.[\p{L}_$#][\p{L}\p{N}_$]*)*$/u.test(symbol)) {
    return (
      `${base}: '${symbol}' is not a declaration name. Pass an identifier such as ` +
      '"calculateTotal", or a qualified "ClassName.method" for a nested member.'
    );
  }
  return `${base}. Check the name with codebase-search, or qualify a nested member as "Outer.inner".`;
}

/**
 * Surgically replace a symbol's body or definition inside a source file.
 */
export async function replaceSymbolInFile(
  opts: MutateSymbolOptions,
  projectRoot: string,
): Promise<MutateSymbolResult> {
  // Path containment (safeResolveReal) is applied by the tool layer
  // (codebase-ast-replace-tool.ts) BEFORE this call, so `opts.file` arrives
  // canonical and absolute here; the fallback below only serves direct
  // callers (tests) that pass relative paths.
  const resolved = path.isAbsolute(opts.file) ? opts.file : path.resolve(projectRoot, opts.file);

  const content = await fs.readFile(resolved, 'utf8');
  const lang = detectLang(resolved) ?? 'other';

  let result: MutateSymbolResult | null = null;

  if (['ts', 'tsx', 'js', 'jsx'].includes(lang)) {
    result = await mutateTsSymbol(content, lang, opts.symbol, opts.newBody, opts.target);
  } else {
    result = await mutateTreeSitterSymbol(content, lang, opts.symbol, opts.newBody, opts.target);
  }

  if (!result) {
    throw new Error(notFoundMessage(opts.symbol, path.relative(projectRoot, resolved), content));
  }

  result.file = resolved;

  if (opts.checkInvariants !== false) {
    const inv = await polyglotInvariantEngine.evaluate({
      originalCode: content,
      modifiedCode: result.updatedContent,
      lang,
      filePath: resolved,
    });

    if (!inv.valid && !opts.allowBreakingChanges) {
      const summary = inv.violations.map((v) => `[${v.ruleId}] ${v.message}`).join('\n');
      throw new Error(
        `AST Invariant Violation: Mutating '${opts.symbol}' introduces breaking changes:\n${summary}\nPass allowBreakingChanges: true if this breaking change is intended.`,
      );
    }
    result.violations = inv.violations;
  }

  await atomicWrite(resolved, result.updatedContent);

  try {
    enqueueReindex({ projectRoot, files: [resolved] });
  } catch {
    // Non-fatal background reindex
  }

  return result;
}
