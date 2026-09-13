import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as TS from '@typescript/typescript6';
import { atomicWrite } from '@wrongstack/core/utils';
import { type InvariantViolation, polyglotInvariantEngine } from './ast-invariant-engine.js';
import { enqueueReindex } from './background-indexer.js';
import { detectLang } from './languages.js';
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

  try {
    const root = tree.rootNode;
    let targetNode: import('web-tree-sitter').Node | null = null;
    let bodyNode: import('web-tree-sitter').Node | null = null;

    function walk(node: import('web-tree-sitter').Node) {
      if (targetNode) return;

      const nameNode = node.childForFieldName('name') ?? node.childForFieldName('declarator');
      if (nameNode && nameNode.text === symbolName) {
        targetNode = node;
        bodyNode =
          node.childForFieldName('body') ??
          node.children.find((c) =>
            [
              'compound_statement',
              'statement_block',
              'block',
              'function_body',
              'body_statement',
              'code_block',
              'do_block',
            ].includes(c.type),
          ) ??
          null;
        return;
      }

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) walk(child);
      }
    }

    walk(root);

    if (!targetNode) return null;

    const replaceTarget: import('web-tree-sitter').Node =
      target === 'full' || !bodyNode ? targetNode : bodyNode;
    const startPos = replaceTarget.startIndex;
    const endPos = replaceTarget.endIndex;

    const startLine = replaceTarget.startPosition.row + 1;
    const endLine = replaceTarget.endPosition.row + 1;

    let formattedReplacement = newBody.trim();
    if (target === 'body' && lang === 'py') {
      const indent = '    ';
      formattedReplacement = formattedReplacement
        .split('\n')
        .map((l) => (l.trim() ? `${indent}${l}` : ''))
        .join('\n');
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

const TEST_CALLEES = String.raw`(?:it|test|describe|suite|bench|context|specify)`;

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
