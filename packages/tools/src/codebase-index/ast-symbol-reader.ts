import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as TS from '@typescript/typescript6';
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

export interface ReadSymbolOptions {
  file: string;
  symbol: string;
  includeDocs?: boolean | undefined;
  target?: 'full' | 'body' | undefined;
}

export interface ReadSymbolResult {
  file: string;
  symbol: string;
  kind: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  text: string;
  rawText: string;
}

interface TsMatch {
  node: TS.Node;
  body: TS.Node | null;
  qualified: string;
  kind: string;
  line: number;
}

const TEST_CALLEES = '(?:it|test|describe|suite|bench|context|specify)';

function notFoundMessage(symbol: string, relPath: string, content: string): string {
  const base = `Symbol '${symbol}' could not be located in AST of '${relPath}'`;
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const testCall = new RegExp(
    String.raw`\b${TEST_CALLEES}(?:\.\w+)*\s*\(\s*(['"\x60])${escaped}\1`,
  );
  if (testCall.test(content)) {
    return (
      `${base}: that is a test-case title, not a declaration. codebase-read-symbol only ` +
      'resolves named declarations (function, method, class, interface, type, enum, variable); ' +
      'use the read or edit tool to inspect a test case.'
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

function formatNumberedLines(
  lines: string[],
  startLine: number,
  endLine: number,
): { text: string; rawText: string } {
  const targetLines = lines.slice(startLine - 1, endLine);
  const sliceCount = targetLines.length;
  const width = String(endLine).length;
  const parts: string[] = new Array(sliceCount);
  for (let i = 0; i < sliceCount; i++) {
    const numStr = String(startLine + i);
    const pad = ' '.repeat(width - numStr.length);
    parts[i] = `${pad}${numStr}→${targetLines[i]}`;
  }
  return {
    text: parts.join('\n'),
    rawText: targetLines.join('\n'),
  };
}

async function readTsSymbol(
  content: string,
  lang: SymbolLang,
  symbolName: string,
  relPath: string,
  opts: { includeDocs?: boolean | undefined; target?: 'full' | 'body' | undefined },
): Promise<ReadSymbolResult | null> {
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

  const matches: TsMatch[] = [];
  const scope: string[] = [];

  function visit(node: TS.Node) {
    let declared: string | undefined;
    let kind = 'declaration';
    let body: TS.Node | null = null;

    if (ts.isFunctionDeclaration(node)) {
      declared = nameOf(node);
      kind = 'function';
      body = node.body ?? null;
    } else if (ts.isMethodDeclaration(node)) {
      declared = nameOf(node);
      kind = 'method';
      body = node.body ?? null;
    } else if (ts.isGetAccessor(node)) {
      declared = nameOf(node);
      kind = 'getter';
      body = node.body ?? null;
    } else if (ts.isSetAccessor(node)) {
      declared = nameOf(node);
      kind = 'setter';
      body = node.body ?? null;
    } else if (ts.isConstructorDeclaration(node)) {
      declared = 'constructor';
      kind = 'constructor';
      body = node.body ?? null;
    } else if (ts.isClassDeclaration(node)) {
      declared = nameOf(node);
      kind = 'class';
    } else if (ts.isInterfaceDeclaration(node)) {
      declared = nameOf(node);
      kind = 'interface';
    } else if (ts.isEnumDeclaration(node)) {
      declared = nameOf(node);
      kind = 'enum';
    } else if (ts.isModuleDeclaration(node)) {
      declared = nameOf(node);
      kind = 'module';
    } else if (ts.isTypeAliasDeclaration(node)) {
      declared = nameOf(node);
      kind = 'type';
      body = node.type;
    } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
      declared = nameOf(node);
      kind = ts.isVariableDeclaration(node) ? 'variable' : 'property';
      const init = node.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        body = init.body;
        kind = ts.isVariableDeclaration(node) ? 'function' : 'method';
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
      kind,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    });
    scope.push(declared);
    ts.forEachChild(node, visit);
    scope.pop();
  }

  ts.forEachChild(sourceFile, visit);

  let candidates = matches.filter(
    (m) => m.qualified === symbolName || m.qualified.endsWith(`.${symbolName}`),
  );
  if (candidates.length === 0) return null;

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
          : 'Rename-free disambiguation is impossible here; use the read tool.'),
    );
  }

  const match = candidates[0] as TsMatch;
  const target = opts.target ?? 'full';

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

  const rangeNode: TS.Node = target === 'body' && match.body ? match.body : fullNode;
  const includeDocs = opts.includeDocs !== false && target !== 'body';
  const startPos = includeDocs
    ? rangeNode.getStart(sourceFile, true)
    : rangeNode.getStart(sourceFile, false);
  const endPos = rangeNode.getEnd();

  const startLine = sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;

  const lines = content.split('\n');
  const { text, rawText } = formatNumberedLines(lines, startLine, endLine);

  return {
    file: relPath,
    symbol: match.qualified,
    kind: match.kind,
    startLine,
    endLine,
    totalLines: endLine - startLine + 1,
    text,
    rawText,
  };
}

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

function kindOfTreeSitter(type: string): string {
  if (type.includes('function')) return 'function';
  if (type.includes('method')) return 'method';
  if (type.includes('class')) return 'class';
  if (type.includes('interface')) return 'interface';
  if (type.includes('struct')) return 'struct';
  if (type.includes('enum')) return 'enum';
  if (type.includes('module') || type.includes('package')) return 'module';
  if (type.includes('type')) return 'type';
  return 'declaration';
}

async function readTreeSitterSymbol(
  content: string,
  lang: SymbolLang,
  symbolName: string,
  relPath: string,
  opts: { includeDocs?: boolean | undefined; target?: 'full' | 'body' | undefined },
): Promise<ReadSymbolResult | null> {
  const parsed = await parseTreeSitterAst({ content, lang });
  if (!parsed) return null;

  const { tree, parser } = parsed;
  type TsNode = import('web-tree-sitter').Node;

  try {
    const root = tree.rootNode;
    const matches: Array<{
      node: TsNode;
      body: TsNode | null;
      qualified: string;
      kind: string;
      line: number;
    }> = [];
    const scope: string[] = [];

    function walk(node: TsNode) {
      let pushed: string | undefined;
      if (node.type === 'impl_item') {
        pushed =
          node
            .childForFieldName('type')
            ?.text.replace(/<[\s\S]*$/, '')
            .trim() || undefined;
      } else if (!NON_DECLARATION_TYPES.test(node.type)) {
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
            kind: kindOfTreeSitter(node.type),
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
            : 'Rename-free disambiguation is impossible here; use the read tool.'),
      );
    }

    const match = candidates[0] as (typeof matches)[number];
    const target = opts.target ?? 'full';

    const rangeNode: TsNode = target === 'body' && match.body ? (match.body as TsNode) : match.node;
    let startLine = rangeNode.startPosition.row + 1;
    const endLine = rangeNode.endPosition.row + 1;

    const includeDocs = opts.includeDocs !== false && target !== 'body';
    if (includeDocs) {
      let prev = match.node.previousSibling;
      while (prev && /comment/.test(prev.type) && prev.endPosition.row >= startLine - 2) {
        startLine = prev.startPosition.row + 1;
        prev = prev.previousSibling;
      }
    }

    const lines = content.split('\n');
    const { text, rawText } = formatNumberedLines(lines, startLine, endLine);

    return {
      file: relPath,
      symbol: match.qualified,
      kind: match.kind,
      startLine,
      endLine,
      totalLines: endLine - startLine + 1,
      text,
      rawText,
    };
  } finally {
    tree.delete();
    parser.delete();
  }
}

/**
 * Read a symbol's exact declaration or body inside a source file using AST parsing.
 */
export async function readSymbolInFile(
  opts: ReadSymbolOptions,
  projectRoot: string,
): Promise<ReadSymbolResult> {
  const resolved = path.isAbsolute(opts.file) ? opts.file : path.resolve(projectRoot, opts.file);
  const relPath = path.relative(projectRoot, resolved).replace(/\\/g, '/');

  const content = await fs.readFile(resolved, 'utf8');
  const lang = detectLang(resolved) ?? 'other';

  let result: ReadSymbolResult | null = null;

  if (['ts', 'tsx', 'js', 'jsx'].includes(lang)) {
    result = await readTsSymbol(content, lang, opts.symbol, relPath, {
      includeDocs: opts.includeDocs,
      target: opts.target,
    });
  } else {
    result = await readTreeSitterSymbol(content, lang, opts.symbol, relPath, {
      includeDocs: opts.includeDocs,
      target: opts.target,
    });
  }

  if (!result) {
    throw new Error(notFoundMessage(opts.symbol, relPath, content));
  }

  return result;
}
