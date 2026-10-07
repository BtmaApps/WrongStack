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

import { collectCallSiteFacts } from './parse-call-sites.js';
import type { ModuleFacts } from './parse-facts.js';
import { buildRefIndex, createSource, lineOf } from './parse-refs.js';
import { collectStatementFacts } from './parse-statements.js';

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

export type {
  ExportFact,
  ImportedName,
  ImportFact,
  ImportKind,
  LocalFact,
  ModuleFacts,
  ReExportFact,
} from './parse-facts.js';
export { buildRefIndex, createSource, isWriteOnlyPosition } from './parse-refs.js';

const ENV_PRAGMA = /@(?:vitest|jest)-environment\s+([\w@./-]+)/g;

export function extractModuleFacts(ts: Ts, file: string, text: string): ModuleFacts {
  const sf = createSource(ts, file, text);
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

  // `/// <reference path>` puts a file into the program without importing it;
  // unread, an ambient `globals.ts` named only there read as unreachable.
  // Declaration files are never code nodes, so they are not followed.
  for (const ref of sf.referencedFiles) {
    const target = ref.fileName.replace(/\\/g, '/');
    if (!target || target.startsWith('/') || /\.d\.[cm]?tsx?$/i.test(target)) continue;
    facts.imports.push({
      spec: /^\.\.?\//.test(target) ? target : `./${target}`,
      kind: 'side-effect',
      names: [],
      line: lineOf(sf, ref.pos),
    });
  }

  const { namespaceBindings, consumedLiterals } = collectStatementFacts(ts, sf, refs, facts);
  collectCallSiteFacts(ts, sf, facts, consumedLiterals, namespaceBindings);

  // A .ts/.tsx file without import/export is a global script: its top-level
  // declarations are visible to every file of the program, so "nothing in
  // its file references it" does not make one unused.
  if (/\.tsx?$/i.test(file) && !ts.isExternalModule(sf)) {
    for (const local of facts.locals) local.keep = true;
  }

  // Namespace-shaped bindings: only the members actually read are used — unless
  // the module exports the binding itself, so importers may read any member.
  const exportedBindings = new Set(facts.exports.map((e) => e.local));
  for (const { local, fact } of namespaceBindings) {
    if ((refs.opaque.get(local) ?? 0) > 0 || fact.names === 'all' || exportedBindings.has(local)) {
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
