/**
 * Per-language tree-sitter node-mapping queries.
 *
 * The Day 2-3 skeleton defines the *declaration-kind* surface for each
 * language: which tree-sitter node types map to which `SymbolKind`, and how
 * to extract the symbol's name from that node. Ref/import/heritage emission
 * (calls, type references, extends/implements, include paths) landed with
 * P3.9, where real AST fixtures proved the mapping.
 *
 * Why no tree-sitter queries (the `.scm` query language)?
 *   The universal visitor (`visitor.ts`) walks the tree by node-type rather
 *   than running a `.scm` query. A query-based approach would be faster at
 *   very large scale but adds a second AST traversal pattern and a separate
 *   grammar file per language. Direct traversal keeps the code shape aligned
 *   with `ts-parser.ts` and `py-parser.ts` — one recursion, one witness list.
 *
 * Each language only needs to fill in the few fields that differ from the
 * default (see {@link DEFAULT_QUERIES}). The block form in `LANG_QUERIES`
 * documents the full set of fields exhaustively so the next reader can see
 * at a glance what a language can override.
 */

import type { CallType, SymbolKind, SymbolLang } from '../schema.js';

/**
 * Declarations worth indexing for a language.
 *
 *   `declKinds`    — map of `tree-sitter node.type` → `SymbolKind`.
 *   `nameField`    — node field name that carries the identifier; defaults
 *                    to `'name'`. Some grammars expose a `declarator` field
 *                    that wraps a `pointer_declarator` or `function_declarator`.
 *   `nameExtractor` — optional escape hatch for languages (e.g. Elixir)
 *                    whose declaration shape doesn't have a clean `name` field.
 *   `scopeNodes`   — node types that push a new scope onto the visitor's
 *                    stack. Class/struct/namespace/interface/impl/module.
 *   `skipNamedChildren` — when true, the visitor does not recurse into
 *                    named children of a declaration node. Set for languages
 *                    where the parent itself is the only indexable unit
 *                    (rare; default false).
 *   `refRules`     — P3.9: node types that emit cross-references (calls,
 *                    imports, heritage). Absent for languages whose grammar
 *                    would turn the rule into noise (Elixir's `call` covers
 *                    operators; shell has no symbol calls).
 */
export interface NodeQueries {
  declKinds: Record<string, SymbolKind>;
  nameField?: Partial<Record<string, string>>;
  nameExtractor?: (node: import('web-tree-sitter').Node) => string | null;
  scopeNodes?: ReadonlySet<string>;
  skipNamedChildren?: boolean;
  refRules?: Partial<Record<string, RefRule>>;
  /**
   * Final say on a matched node's kind; `null` skips it. For node types that
   * are only sometimes declarations: C's `declaration` (prototype, global or
   * local), a Ruby `constant` (assignment target or mere reference), an
   * Elixir `call` (`def` or any call at all).
   */
  resolveKind?: (node: import('web-tree-sitter').Node, kind: SymbolKind) => SymbolKind | null;
  /**
   * Names for nodes that declare several (`int a, b;`) or whose name is not an
   * identifier child. `undefined` falls back to single-name extraction.
   */
  declaredNames?: (node: import('web-tree-sitter').Node) => readonly string[] | undefined;
  /** Scope membership decided per node; replaces `scopeNodes` when set. */
  isScopeNode?: (node: import('web-tree-sitter').Node) => boolean;
}

type TsNode = import('web-tree-sitter').Node;

const NAME_LIKE_TYPES: ReadonlySet<string> = new Set([
  'identifier',
  'simple_identifier',
  'type_identifier',
  'field_identifier',
  'name',
  'constant',
]);

function namedChildrenOf(node: TsNode): TsNode[] {
  const out: TsNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) out.push(child);
  }
  return out;
}

/**
 * Names of the declarators under a field/property declaration. The first
 * identifier-shaped child used to be taken as THE name, which for
 * `private String name;` is the type `String` — and a primitive-typed
 * `int a, b;` had no identifier child at all, so it was never indexed.
 */
function declaratorNames(
  node: TsNode,
  declaratorTypes: ReadonlySet<string>,
  containerTypes: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  const walk = (current: TsNode, depth: number): void => {
    for (const child of namedChildrenOf(current)) {
      if (declaratorTypes.has(child.type)) {
        const id =
          child.childForFieldName('name') ??
          namedChildrenOf(child).find((c) => NAME_LIKE_TYPES.has(c.type));
        if (id) out.push(id.text);
      } else if (depth < 2 && containerTypes.has(child.type)) {
        walk(child, depth + 1);
      }
    }
  };
  walk(node, 0);
  return out;
}

/** Innermost identifier of each `declarator:` of a C declaration. */
function cDeclaratorNames(node: TsNode): string[] {
  const out: string[] = [];
  for (const declarator of node.childrenForFieldName('declarator')) {
    let current: TsNode | null = declarator;
    for (let depth = 0; current && depth < 16; depth++) {
      if (current.type === 'identifier') {
        out.push(current.text);
        break;
      }
      current = current.childForFieldName('declarator');
    }
  }
  return out;
}

function cDeclaresFunction(node: TsNode): boolean {
  for (const declarator of node.childrenForFieldName('declarator')) {
    let current: TsNode | null = declarator;
    for (let depth = 0; current && depth < 16; depth++) {
      if (current.type === 'function_declarator') return true;
      current = current.childForFieldName('declarator');
    }
  }
  return false;
}

/**
 * A C `declaration` is a prototype, a file-scope variable, or a local. Every
 * one of them used to be indexed as a `function` — each local variable of
 * every function body included.
 */
function cDeclarationKind(node: TsNode): SymbolKind | null {
  if (cDeclaresFunction(node)) return 'function';
  let parent = node.parent;
  while (parent?.type.startsWith('preproc_')) parent = parent.parent;
  return parent?.type === 'translation_unit' ? 'var' : null;
}

const C_SPECIFIER_TYPES: ReadonlySet<string> = new Set([
  'struct_specifier',
  'union_specifier',
  'enum_specifier',
  'class_specifier',
]);

/**
 * `struct node *next` and `class Foo;` are references to a type, not its
 * definition: only a specifier with a body declares one. Without this every
 * parameter of type `struct x *` added another "struct x" symbol.
 */
function cSpecifierKind(node: TsNode, kind: SymbolKind): SymbolKind | null {
  if (!C_SPECIFIER_TYPES.has(node.type)) return kind;
  return node.childForFieldName('body') ? kind : null;
}

function sameNode(a: TsNode | null, b: TsNode): boolean {
  return a !== null && a.startIndex === b.startIndex && a.endIndex === b.endIndex;
}

/** Ruby: methods defined inside a class/module are methods. */
function rubyInsideClass(node: TsNode): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'class' || parent.type === 'module' || parent.type === 'singleton_class') {
      return true;
    }
    if (parent.type === 'method' || parent.type === 'singleton_method') return false;
  }
  return false;
}

/**
 * Elixir definitions are calls: `def total(items)`, `defp tax(x) when x > 0`,
 * `defmodule Billing.Invoice`. Anything else — which is almost every `call`
 * node in a file — is not a declaration.
 */
const ELIXIR_FUNCTION_DEFS: ReadonlySet<string> = new Set([
  'def',
  'defp',
  'defmacro',
  'defmacrop',
  'defguard',
  'defguardp',
  'defdelegate',
]);
const ELIXIR_MODULE_DEFS: ReadonlySet<string> = new Set(['defmodule', 'defprotocol']);

function elixirDefinition(node: TsNode): { kind: SymbolKind; name: string } | null {
  if (node.type !== 'call') return null;
  const target = node.childForFieldName('target') ?? node.namedChild(0);
  if (target?.type !== 'identifier') return null;
  const args = namedChildrenOf(node).find((child) => child.type === 'arguments');
  const head = args?.namedChild(0);
  if (!head) return null;
  if (ELIXIR_MODULE_DEFS.has(target.text)) {
    return head.type === 'alias' ? { kind: 'namespace', name: head.text } : null;
  }
  if (!ELIXIR_FUNCTION_DEFS.has(target.text)) return null;
  const name = elixirFunctionName(head, 0);
  return name ? { kind: 'function', name } : null;
}

function elixirFunctionName(head: TsNode, depth: number): string | null {
  if (depth > 3) return null;
  // `def ready?, do: true`
  if (head.type === 'identifier') return head.text;
  // `def total(items)`
  if (head.type === 'call') {
    const target = head.childForFieldName('target') ?? head.namedChild(0);
    return target?.type === 'identifier' ? target.text : null;
  }
  // `defp tax(x) when x > 0`
  if (head.type === 'binary_operator') {
    const left = head.childForFieldName('left') ?? head.namedChild(0);
    return left ? elixirFunctionName(left, depth + 1) : null;
  }
  return null;
}

/** One ref a refRule wants emitted. `callType` defaults to the rule's. */
export interface RefEmission {
  toName: string;
  callType?: CallType;
  module?: string;
}

/**
 * How to turn one tree-sitter node into refs.
 *
 *   `callType`      — the ref kind this rule emits.
 *   `field`         — field carrying the callee/target (e.g. `'function'`).
 *                     Default when no extractor: leaf-name of that field.
 *   `nameExtractor` — full control (multi-ref nodes like heritage lists,
 *                     imports whose module must be derived from the node
 *                     text, Ruby `require` calls). Return `null`/`[]` to
 *                     emit nothing for this node.
 */
export interface RefRule {
  callType: CallType;
  field?: string;
  nameExtractor?: (node: import('web-tree-sitter').Node) => ReadonlyArray<RefEmission> | null;
}

/**
 * PHP grouped use — `use App\{Foo, Bar as B};` binds EACH member, not one
 * fused emission. Each member keeps its own alias handling (the alias is
 * local-only; the ref targets the original member).
 */
function parseGroupedUse(text: string): ReadonlyArray<RefEmission> | null {
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close <= open) return null;
  const prefix = text.slice(0, open).replace(/[\\/]+$/, '');
  const out: RefEmission[] = [];
  for (const rawMember of text.slice(open + 1, close).split(',')) {
    let member = rawMember.trim();
    if (!member) continue;
    // Mixed groups can qualify per member: `use App\{Foo, function bar}`.
    member = member
      .replace(
        /^(static|final|type|class|struct|enum|protocol|var|func|let|typealias|function|const)\s+/i,
        '',
      )
      .trim();
    if (!member) continue;
    const aliasMatch = /\s+as\s+([A-Za-z_]\w*)\s*$/i.exec(member);
    if (aliasMatch) member = member.slice(0, aliasMatch.index).trim();
    if (!member) continue;
    const module = prefix ? `${prefix}\\${member}` : member;
    const toName = member.split(/[\\/]/).filter(Boolean).pop();
    if (toName) out.push({ toName, callType: 'import', module });
  }
  return out.length ? out : null;
}

/** Strip `import`-shaped node text into `{toName, module}` emissions. */
function importFromText(prefixes: readonly string[]): NonNullable<RefRule['nameExtractor']> {
  return (node) => {
    let text = node.text.replace(/\s+/g, ' ').trim();
    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) text = text.slice(prefix.length).trim();
    }
    // Import modifiers, stripped BEFORE module derivation so they never
    // pollute `module`: java `import static x.y.Z` and c# `using static`
    // bind the member; swift kind-qualified imports (`import class
    // Foundation.URLSession`) bind URLSession; php `use function App\foo`
    // binds foo.
    text = text
      .replace(
        /^(static|final|type|class|struct|enum|protocol|var|func|let|typealias|function|const)\s+/i,
        '',
      )
      .trim();
    // PHP grouped use — detected after modifier strip (`use function
    // App\{foo}`) but before the trailing-`;}` strip (the group's closing
    // brace is load-bearing there).
    if (text.includes('{')) return parseGroupedUse(text);
    // PHP multi-clause use — `use A\B, C\D;` and `use function App\foo,
    // const App\BAR;` bind EACH clause (verified AST:
    // namespace_use_declaration carries multiple namespace_use_clause
    // children; the refRule fires on the declaration node whose text
    // spans them all). Without this split the clauses fuse into one
    // bogus module (`App\foo, const App\BAR`) and every clause but the
    // last loses its binding.
    //   Comma guard: C# using-aliases may contain commas inside generic
    // argument lists (`using L = List<int, string>;`) AND in non-generic
    // alias targets (`using Pair = (int, string);`, `using M = int[,]`)
    // and must NOT split. PHP use clauses can never contain `<` — and
    // PHP aliases are written `as`, never `=` — so either marker exempts
    // the text from the split.
    if (text.includes(',') && !text.includes('<') && !text.includes('=')) {
      const out: RefEmission[] = [];
      for (const clause of text.split(',')) {
        const one = oneImportClause(clause.trim());
        if (one) out.push(one);
      }
      return out.length ? out : null;
    }
    // oneImportClause yields ONE emission; the visitor iterates an ARRAY —
    // a bare object here throws at the first import node and aborts every
    // ref for the file (caught by the P3.9 suite: files with imports lost
    // their call refs too).
    const single = oneImportClause(text);
    return single ? [single] : null;
  };
}

/** Resolve one comma-free import clause to its `{toName, module}` emission. */
function oneImportClause(rawClause: string): RefEmission | null {
  let text = rawClause;
  // Per-clause modifier strip — mixed clauses carry their own kind:
  // `use function App\foo, const App\BAR;`.
  text = text
    .replace(
      /^(static|final|type|class|struct|enum|protocol|var|func|let|typealias|function|const)\s+/i,
      '',
    )
    .trim();
  // Trailing `;`/`}` BEFORE alias handling — the alias regex is
  // `$`-anchored and PHP writes `use App\Models\User as U;`.
  text = text.replace(/[;}]+$/g, '').trim();
  // Alias imports — `use App\Models\User as U`, `import com.example.Foo
  // as Bar`, `using Txt = System.Text`. The alias is the LOCAL name; the
  // ref must target the ORIGINAL (pre-alias) symbol so resolution binds
  // to its declaration, not to the aliasing file. PHP's `AS` is
  // case-insensitive, like every PHP keyword.
  const aliasMatch = /\s+as\s+([A-Za-z_]\w*)\s*$/i.exec(text);
  if (aliasMatch) text = text.slice(0, aliasMatch.index).trim();
  const eqMatch = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(text);
  if (eqMatch) text = eqMatch[2]!.trim();
  if (!text) return null;
  // Java/C# wildcard imports (`a.b.*`) bind the package, not a symbol.
  if (text.endsWith('*')) text = text.slice(0, -1).replace(/[.]$/, '');
  if (!text) return null;
  const module = text;
  // Strip a generic-argument tail from the LEAF before name resolution:
  // `using L = System.Collections.Generic.List<int, string>` resolves by
  // NAME to the `List` declaration — `List<int, string>` would never match.
  // (heritageLeaf's text fallback strips the same tail for the same reason.)
  const toName = module
    .split(/[.\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/<.*>$/s, '');
  if (!toName) return null;

  return { toName, callType: 'import', module };
}

/**
 * Heritage lists (`base_list`, `super_interface_list`, …) carry several
 * target names in one node — collect every identifier-shaped descendant
 * within a small depth budget.
 *
 * Qualified names resolve to their LEAF segment only. Verified AST shapes:
 *  - java `scoped_type_identifier` (nested: `com.example.Base` → 3 levels)
 *  - c# `qualified_name` in base_list (`App.Base`)
 *  - php `qualified_name` in base_clause (`App\Base`)
 *  - kotlin `user_type` with segment `type_identifier` children
 *  - ruby `scope_resolution` (`Bar::Baz`) — the `name:` constant is the
 *    actual superclass
 * Generic type arguments are NOT the declared name: `extends Base<Foo>`
 * nests (type_arguments (type_identifier)) — recursing it would emit Foo
 * as a phantom inherit ref, so argument subtrees are skipped everywhere.
 */
const heritageExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  const out: RefEmission[] = [];
  // Subtrees that are NEVER the declared name: type arguments/parameters and
  // call arguments. C# also allows predefined types there (`IFoo<string>` →
  // (predefined_type)), which the identifier checks below ignore anyway.
  const SKIP_SUBTREES = new Set([
    'type_arguments',
    'type_argument_list',
    // tree-sitter-cpp names its argument subtree template_argument_list —
    // verified AST: (base_class_clause (template_type name:
    // (type_identifier) arguments: (template_argument_list
    // (type_descriptor type: (type_identifier))))). Without this entry
    // `class D : Base<Foo>` recurses into the descriptor and emits Foo as a
    // phantom inherit ref.
    'template_argument_list',
    'type_parameter_list',
    'type_projection',
    'value_arguments',
  ]);
  const collect = (current: import('web-tree-sitter').Node, depth: number): void => {
    if (depth > 4) return;
    for (let i = 0; i < current.namedChildCount; i++) {
      const child = current.namedChild(i);
      if (!child) continue;
      if (SKIP_SUBTREES.has(child.type)) continue;
      if (
        child.type === 'type_identifier' ||
        child.type === 'identifier' ||
        child.type === 'named_type' ||
        child.type === 'type' ||
        // PHP heritage carries `name`; Ruby a `constant`.
        child.type === 'constant' ||
        child.type === 'name'
      ) {
        const name = child.type === 'named_type' ? leafSegment(child.text) : child.text;
        if (name) out.push({ toName: name });
        continue;
      }
      // Generic wrappers (java `generic_type`, c# `generic_name`): the
      // declared name is the first identifier-shaped child — its trailing
      // type_arguments child is noise (guarded above too, belt and braces).
      if (child.type === 'generic_type' || child.type === 'generic_name') {
        for (let j = 0; j < child.namedChildCount; j++) {
          const inner = child.namedChild(j);
          if (
            inner &&
            !SKIP_SUBTREES.has(inner.type) &&
            (inner.type === 'type_identifier' ||
              inner.type === 'identifier' ||
              inner.type === 'name')
          ) {
            out.push({ toName: inner.text });
            break;
          }
        }
        continue;
      }
      // Qualified forms: take the declared leaf, never every segment.
      if (
        child.type === 'qualified_name' ||
        child.type === 'scoped_type_identifier' ||
        child.type === 'user_type' ||
        child.type === 'scope_resolution'
      ) {
        const leaf = heritageLeaf(child, 0);
        if (leaf) out.push({ toName: leaf });
        continue;
      }
      collect(child, depth + 1);
    }
  };
  collect(node, 0);
  return out;
};

/** Leaf segment of a qualified heritage name. */
function heritageLeaf(node: import('web-tree-sitter').Node, depth: number): string | null {
  if (depth > 6) return null;
  // Field access first: java scoped_type_identifier / ruby scope_resolution
  // expose the declared name via `name:`.
  const named = node.childForFieldName('name');
  if (named) {
    // A `name:` field may itself be qualified (java nests
    // scoped_type_identifier under `name:`) — recurse.
    if (
      named.type === 'scoped_type_identifier' ||
      named.type === 'qualified_name' ||
      named.type === 'scope_resolution' ||
      named.type === 'user_type'
    ) {
      return heritageLeaf(named, depth + 1);
    }
    return named.text;
  }
  // Kotlin `user_type` has no name field; its LAST type_identifier child is
  // the leaf (`com.example.Base` → children [com, example, Base]). PHP's
  // `qualified_name` leaf child is typed `name` (verified AST).
  const children: import('web-tree-sitter').Node[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c) children.push(c);
  }
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]!;
    // Skip argument subtrees — `Handler<Event>`'s last child is
    // type_arguments, never the declared name (matches SKIP_SUBTREES above).
    if (
      c.type === 'type_arguments' ||
      c.type === 'type_argument_list' ||
      // cpp: (template_type arguments: (template_argument_list …)) — the
      // descriptor's type_identifier inside it is never the declared base.
      c.type === 'template_argument_list' ||
      c.type === 'type_parameter_list' ||
      c.type === 'type_projection' ||
      c.type === 'value_arguments'
    ) {
      continue;
    }
    if (
      c.type === 'type_identifier' ||
      c.type === 'identifier' ||
      c.type === 'constant' ||
      c.type === 'name'
    ) {
      return c.text;
    }
    if (
      c.type === 'scoped_type_identifier' ||
      c.type === 'qualified_name' ||
      c.type === 'scope_resolution' ||
      c.type === 'user_type'
    ) {
      return heritageLeaf(c, depth + 1);
    }
  }
  // Fallback: leaf segment of the node's own text (`.`-qualified, PHP
  // `\`-namespaced, C++ `::`-scoped), with any `<...>` argument tail removed.
  return leafSegment(
    node.text
      .replace(/\\/g, '.')
      .replace(/::/g, '.')
      .replace(/<[^<>]*>$/, ''),
  );
}

/** Last `.`-separated segment of a dotted name. */
function leafSegment(text: string): string {
  return text.split('.').filter(Boolean).pop() ?? text;
}

/**
 * C/C++ call extractor. The `function` field of a `call_expression` is not
 * always a bare identifier — verified AST forms:
 *  - `obj->run()`  → `field_expression (argument: (identifier) field: (field_identifier))`
 *  - `Cls::stat()` → `qualified_identifier (scope: (namespace_identifier) name: (identifier))`
 *  - `helper()`    → `identifier`
 * The declared method name is the FIELD/NAME child (`run`, `stat`) — the
 * receiver (`obj`, `Cls`) is not a symbol reference by itself.
 */
const cCallExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  const fn = node.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'field_expression') {
    // `obj->method()` / `obj.method()` — method is the declared symbol.
    const field = fn.childForFieldName('field');
    if (field) return [{ toName: field.text, callType: 'call' }];
    const seg = fn.text.split('->').filter(Boolean).pop();
    if (seg) return [{ toName: leafSegment(seg.split('.')[0] ?? seg), callType: 'call' }];
    return null;
  }
  if (fn.type === 'qualified_identifier') {
    // `Cls::method()` — method is the `name:` child; `Cls` is the scope.
    const name = fn.childForFieldName('name');
    if (name) return [{ toName: name.text, callType: 'call' }];
    const seg = fn.text.split('::').filter(Boolean).pop();
    if (seg) return [{ toName: seg.split(/[<(]/)[0]!.trim(), callType: 'call' }];
    return null;
  }
  // Bare identifier — leaf of the raw text.
  return [{ toName: fn.text.split(/[<(]/)[0]!.trim(), callType: 'call' }];
};

/** Ruby `call`: the method ref, plus `require`/`require_relative` imports. */
const rubyCallExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  const emissions: RefEmission[] = [];
  const method = node.childForFieldName('method');
  if (method) {
    const name = method.text;
    if (name && !name.includes(' ')) emissions.push({ toName: name, callType: 'call' });
    if (name === 'require' || name === 'require_relative') {
      const args = node.childForFieldName('arguments');
      const first = args?.namedChild(0);
      if (first) {
        const raw = first.text.replace(/^['"]|['"]$/g, '');
        const toName = raw.split('/').filter(Boolean).pop();
        if (toName) emissions.push({ toName, callType: 'import', module: raw });
      }
    }
  }
  return emissions;
};

/** First-identifier call extractor for `call_expression` nodes whose
 *  grammar carries no callee field (Kotlin `simple_identifier` + suffix,
 *  Swift `simple_identifier` + `call_suffix`). */
const firstIdentifierCallExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && (child.type === 'simple_identifier' || child.type === 'identifier')) {
      return [{ toName: child.text, callType: 'call' }];
    }
  }
  const first = node.namedChild(0);
  if (!first) return null;
  const leaf = leafSegment(first.text.split(/[<(]/)[0] ?? first.text);
  if (!leaf) return null;
  return [{ toName: leaf, callType: 'call' }];
};

/** C `#include`: module from the quoted/bracketed path. */
const cIncludeExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  const raw = node.text.replace(/^#\s*include\s*/i, '').trim();
  const module = raw.replace(/^["'<]|["'>]$/g, '');
  if (!module) return null;
  const toName = module.split('/').pop()?.replace(/\.h$/, '');
  if (!toName) return null;
  return [{ toName, callType: 'import', module }];
};

/**
 * PHP constructor calls. Verified AST: `new App\Model\User()` →
 * (object_creation_expression (qualified_name prefix: … (name)) (arguments))
 * — a BARE qualified_name child, no `name:` field (and unqualified `new
 * User()` likewise), so the field-based default never fires. Take the first
 * qualified_name/name child and leaf-split on the namespace separator.
 */
const phpConstructorExtractor: NonNullable<RefRule['nameExtractor']> = (node) => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && (child.type === 'qualified_name' || child.type === 'name')) {
      const leaf = child.text.split(/[\\]/).filter(Boolean).pop();
      if (leaf) return [{ toName: leaf, callType: 'call' }];
    }
  }
  return null;
};

/** Sensible default: every language uses `name` as the field name. */
const DEFAULT_QUERIES: NodeQueries = {
  declKinds: {},
};

/**
 * Block-shaped per-language overrides. Each entry is the *complete* set of
 * fields the language cares about — `DEFAULT_QUERIES` is the fallback for
 * anything not specified, but in practice we keep `declKinds` and
 * `scopeNodes` explicit so the table is self-documenting.
 */
const LANG_QUERIES: Partial<Record<SymbolLang, NodeQueries>> = {
  // ─── C family ──────────────────────────────────────────────────────────────
  c: {
    declKinds: {
      function_definition: 'function',
      declaration: 'function', // K&R-style `int foo(...)` ambiguous w/ local var; the visitor prefers the function branch when the declarator field is present
      struct_specifier: 'struct',
      union_specifier: 'struct',
      enum_specifier: 'enum',
      type_definition: 'type', // `typedef … X;`
      preproc_def: 'const', // `#define NAME …`
    },
    nameField: {
      function_definition: 'declarator',
      declaration: 'declarator',
      struct_specifier: 'name',
      enum_specifier: 'name',
      type_definition: 'declarator',
      preproc_def: 'name',
    },
    resolveKind: (node, kind) =>
      node.type === 'declaration' ? cDeclarationKind(node) : cSpecifierKind(node, kind),
    declaredNames: (node) =>
      node.type === 'declaration' && !cDeclaresFunction(node) ? cDeclaratorNames(node) : undefined,
    scopeNodes: new Set([
      'translation_unit',
      'function_definition',
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
    ]),
    refRules: {
      // `obj->run()` and `Cls::stat()` carry structured function fields —
      // cCallExtractor handles all three AST shapes.
      call_expression: { callType: 'call', nameExtractor: cCallExtractor },
      preproc_include: { callType: 'import', nameExtractor: cIncludeExtractor },
    },
  },
  cpp: {
    declKinds: {
      function_definition: 'function',
      template_declaration: 'function', // `template<typename T> …`
      class_specifier: 'class',
      struct_specifier: 'struct',
      union_specifier: 'struct',
      enum_specifier: 'enum',
      namespace_definition: 'namespace',
      type_definition: 'type',
    },
    nameField: {
      function_definition: 'declarator',
      template_declaration: 'name',
      class_specifier: 'name',
      struct_specifier: 'name',
      enum_specifier: 'name',
      namespace_definition: 'name',
      type_definition: 'declarator',
    },
    resolveKind: cSpecifierKind,
    scopeNodes: new Set([
      'translation_unit',
      'function_definition',
      'class_specifier',
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
      'namespace_definition',
    ]),
    refRules: {
      call_expression: { callType: 'call', nameExtractor: cCallExtractor },
      preproc_include: { callType: 'import', nameExtractor: cIncludeExtractor },
      // `class Foo : public Bar, private Baz` — the base-class clause.
      base_class_clause: { callType: 'inherit', nameExtractor: heritageExtractor },
    },
  },
  java: {
    declKinds: {
      class_declaration: 'class',
      interface_declaration: 'interface',
      enum_declaration: 'enum',
      record_declaration: 'class',
      annotation_type_declaration: 'interface',
      method_declaration: 'method',
      constructor_declaration: 'method',
      field_declaration: 'property',
      constant_declaration: 'const',
    },
    declaredNames: (node) =>
      node.type === 'field_declaration' || node.type === 'constant_declaration'
        ? declaratorNames(node, new Set(['variable_declarator']))
        : undefined,
    nameField: {
      class_declaration: 'name',
      interface_declaration: 'name',
      enum_declaration: 'name',
      record_declaration: 'name',
      annotation_type_declaration: 'name',
      method_declaration: 'name',
      constructor_declaration: 'name',
    },
    // `field_declaration` has no single `name` field — it carries a list of
    // variable declarators, each emitted as its own symbol (declaredNames).
    scopeNodes: new Set([
      'program',
      'class_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration',
    ]),
    refRules: {
      method_invocation: { callType: 'call', field: 'name' },
      object_creation_expression: { callType: 'call', field: 'type' },
      // Verified AST: `superclass: (superclass (type_identifier))` and
      // `interfaces: (super_interfaces (type_list ...))` — no underscores.
      superclass: { callType: 'inherit', nameExtractor: heritageExtractor },
      super_interfaces: {
        callType: 'implement',
        nameExtractor: heritageExtractor,
      },
      import_declaration: {
        callType: 'import',
        nameExtractor: importFromText(['import ']),
      },
    },
  },
  csharp: {
    // C# 10+ `namespace Foo.Bar;` produces this node type. The legacy block
    // form `namespace Foo.Bar { ... }` produces `namespace_declaration`. Both
    // carry a `qualified_name` child whose text already includes the dots.
    // `using_directive` is intentionally not a declaration. Imports are
    // extracted separately; indexing a using directive as a namespace makes
    // the resolver bind it to its own source file before the real declaration.
    declKinds: {
      file_scoped_namespace_declaration: 'namespace',
      class_declaration: 'class',
      interface_declaration: 'interface',
      struct_declaration: 'struct',
      enum_declaration: 'enum',
      record_declaration: 'class',
      method_declaration: 'method',
      constructor_declaration: 'method',
      property_declaration: 'property',
      field_declaration: 'property',
      namespace_declaration: 'namespace',
    },
    // Namespaces keep their full dotted name verbatim. Scoped to namespace
    // nodes: applied to every declaration it named an interface member
    // `System.Threading.Tasks.Task RunAsync();` after its RETURN TYPE.
    nameExtractor: (node) => {
      if (
        node.type !== 'namespace_declaration' &&
        node.type !== 'file_scoped_namespace_declaration'
      ) {
        return null;
      }
      const named = node.childForFieldName('name');
      if (named) return named.text;
      const inner = node.namedChild(0);
      if (inner && (inner.type === 'qualified_name' || inner.type === 'identifier')) {
        return inner.text;
      }
      return null;
    },
    declaredNames: (node) =>
      node.type === 'field_declaration'
        ? declaratorNames(node, new Set(['variable_declarator']), new Set(['variable_declaration']))
        : undefined,
    scopeNodes: new Set([
      'compilation_unit',
      'namespace_declaration',
      'class_declaration',
      'interface_declaration',
      'struct_declaration',
      'enum_declaration',
      'record_declaration',
    ]),
    refRules: {
      // Verified AST: `invocation_expression function: (identifier)` — the
      // callee field is `function` (C-style), not `name`.
      invocation_expression: { callType: 'call', field: 'function' },
      object_creation_expression: { callType: 'call', field: 'type' },
      base_list: { callType: 'inherit', nameExtractor: heritageExtractor },
      using_directive: {
        callType: 'import',
        nameExtractor: importFromText(['using ']),
      },
    },
  },
  php: {
    declKinds: {
      function_definition: 'function',
      method_declaration: 'method',
      class_declaration: 'class',
      interface_declaration: 'interface',
      trait_declaration: 'class',
      enum_declaration: 'enum',
      namespace_definition: 'namespace',
    },
    nameField: {
      function_definition: 'name',
      method_declaration: 'name',
      class_declaration: 'name',
      interface_declaration: 'name',
      trait_declaration: 'name',
      enum_declaration: 'name',
      namespace_definition: 'name',
    },
    // `namespace App\Models;` — the whole qualified name, not its first
    // segment. The resolver binds `use App\Models\User` against it.
    declaredNames: (node) => {
      if (node.type !== 'namespace_definition') return undefined;
      const name = node.childForFieldName('name')?.text;
      return name ? [name] : [];
    },
    scopeNodes: new Set([
      'program',
      'namespace_definition',
      'class_declaration',
      'interface_declaration',
      'trait_declaration',
      'enum_declaration',
    ]),
    refRules: {
      function_call_expression: { callType: 'call', field: 'function' },
      // Verified AST: `new App\Model\User()` carries a BARE qualified_name
      // child (no `name:` field), so the field default never fires.
      object_creation_expression: { callType: 'call', nameExtractor: phpConstructorExtractor },
      base_clause: { callType: 'inherit', nameExtractor: heritageExtractor },
      class_interface_clause: {
        callType: 'implement',
        nameExtractor: heritageExtractor,
      },
      // Verified AST: `namespace_use_declaration (namespace_use_clause
      // (qualified_name ...))` — not `use_declaration`.
      namespace_use_declaration: {
        callType: 'import',
        nameExtractor: importFromText(['use ']),
      },
    },
  },

  // ─── Scripting / mobile ────────────────────────────────────────────────────
  ruby: {
    declKinds: {
      method: 'function',
      singleton_method: 'method',
      class: 'class',
      module: 'namespace',
      constant: 'const',
    },
    nameField: {
      method: 'name',
      singleton_method: 'name',
      class: 'name',
      module: 'name',
      constant: 'name',
    },
    resolveKind: (node, kind) => {
      // A `constant` node is declared only as an assignment target
      // (`VERSION = "1"`); everywhere else it is a reference.
      if (node.type === 'constant') {
        const parent = node.parent;
        return parent?.type === 'assignment' && sameNode(parent.childForFieldName('left'), node)
          ? 'const'
          : null;
      }
      if (node.type === 'method') return rubyInsideClass(node) ? 'method' : 'function';
      return kind;
    },
    declaredNames: (node) => (node.type === 'constant' ? [node.text] : undefined),
    scopeNodes: new Set(['program', 'class', 'module', 'singleton_method', 'method']),
    refRules: {
      // `call` covers both `foo(...)` and `obj.foo(...)` — the extractor
      // records the method leaf, plus `require`/`require_relative` imports.
      call: { callType: 'call', nameExtractor: rubyCallExtractor },
      superclass: { callType: 'inherit', nameExtractor: heritageExtractor },
    },
  },
  swift: {
    declKinds: {
      function_declaration: 'function',
      class_declaration: 'class',
      struct_declaration: 'struct',
      enum_declaration: 'enum',
      protocol_declaration: 'interface',
      actor_declaration: 'class',
      extension_declaration: 'class',
      initializer: 'method',
      property_declaration: 'property',
      protocol_function_declaration: 'method',
    },
    nameField: {
      function_declaration: 'name',
      class_declaration: 'name',
      struct_declaration: 'name',
      enum_declaration: 'name',
      protocol_declaration: 'name',
      actor_declaration: 'name',
      extension_declaration: 'name',
      initializer: 'name',
      property_declaration: 'name',
    },
    scopeNodes: new Set([
      'source_file',
      'class_declaration',
      'struct_declaration',
      'enum_declaration',
      'protocol_declaration',
      'actor_declaration',
      'extension_declaration',
    ]),
    refRules: {
      // Verified AST: `call_expression (simple_identifier) (call_suffix …)` —
      // the callee is a bare first child, no field name.
      call_expression: { callType: 'call', nameExtractor: firstIdentifierCallExtractor },
      // Verified AST: `inheritance_specifier inherits_from: (user_type …)`.
      inheritance_specifier: { callType: 'inherit', nameExtractor: heritageExtractor },
      import_declaration: {
        callType: 'import',
        nameExtractor: importFromText(['import ', 'import type ', '@testable import ']),
      },
    },
  },
  kotlin: {
    declKinds: {
      class_declaration: 'class',
      object_declaration: 'class',
      interface_declaration: 'interface',
      function_declaration: 'function',
      property_declaration: 'property',
      type_alias: 'type',
    },
    nameField: {
      class_declaration: 'name',
      object_declaration: 'name',
      interface_declaration: 'name',
      function_declaration: 'name',
      property_declaration: 'name',
      type_alias: 'name',
    },
    declaredNames: (node) =>
      node.type === 'property_declaration'
        ? declaratorNames(
            node,
            new Set(['variable_declaration']),
            new Set(['multi_variable_declaration']),
          )
        : undefined,
    scopeNodes: new Set([
      'source_file',
      'class_declaration',
      'object_declaration',
      'interface_declaration',
      'function_declaration',
    ]),
    refRules: {
      call_expression: { callType: 'call', nameExtractor: firstIdentifierCallExtractor },
      // Verified AST: `delegation_specifier (user_type (type_identifier))` —
      // the `: Handler` / `: Base()` clause.
      delegation_specifier: { callType: 'inherit', nameExtractor: heritageExtractor },
      import_header: {
        callType: 'import',
        nameExtractor: importFromText(['import ']),
      },
    },
  },
  elixir: {
    // Every Elixir definition is a `call` node (`def`, `defmodule`, …), and so
    // is every ordinary call. The previous table indexed `defmodule` itself as
    // a function named "defmodule", named each def after its whole argument
    // text ("total(items), do: …"), and emitted a function symbol for every
    // plain call in every body. elixirDefinition decides all three.
    declKinds: {
      call: 'function',
    },
    resolveKind: (node) => elixirDefinition(node)?.kind ?? null,
    nameExtractor: (node) => elixirDefinition(node)?.name ?? null,
    isScopeNode: (node) => elixirDefinition(node)?.kind === 'namespace',
  },
  shell: {
    declKinds: {
      function_definition: 'function',
    },
    nameField: { function_definition: 'name' },
    scopeNodes: new Set(['program', 'function_definition']),
  },
};

/** Resolve the queries for a language, falling back to the default. */
export function getQueries(lang: SymbolLang): NodeQueries {
  return LANG_QUERIES[lang] ?? DEFAULT_QUERIES;
}
