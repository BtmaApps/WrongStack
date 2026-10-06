/**
 * Dead-code cleanup under user control: plan → preview → apply → verify →
 * roll back on failure, with a backup that `undo` restores later.
 *
 * The fixer never trusts a stale report. Every plan re-runs the analysis and
 * acts only on findings that still exist under the same id, computing edits
 * from the CURRENT syntax tree — a file edited since the scan is re-read, not
 * patched at old offsets.
 *
 * Removing code orphans what only it used: an import, a private helper. The
 * cascade pass removes exactly those (bindings referenced before the edit and
 * not after it), so `noUnusedLocals` and linters stay green, and nothing that
 * was already unused before the fix is touched.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type * as TS from '@typescript/typescript6';
import {
  buildChildEnv,
  resolveWstackPaths,
  toErrorMessage,
  unifiedDiff,
} from '@wrongstack/core/utils';
import { treeKill } from '@wrongstack/core/utils/tree-kill';
import {
  buildWin32CmdShimInvocation,
  isWinCmdShim,
  resolveWin32Command,
} from '../_win32-resolve.js';
import { analyzeDeadCode, type DeadCodeAnalysis } from './analyze.js';
import { discoverPackages, owningPackage, type PackageInfo } from './files.js';
import {
  buildRefIndex,
  createSource,
  extractModuleFacts,
  isWriteOnlyPosition,
  loadTypescript,
} from './parse.js';
import type { DeadCodeFinding, DeadCodeScanOptions } from './types.js';

type Ts = typeof import('@typescript/typescript6');

export interface DeadCodeFileChange {
  file: string;
  action: 'edit' | 'delete';
  /** Unified diff (truncated for deletions and very large edits). */
  diff: string;
  findingIds: string[];
}

export interface DeadCodePlan {
  changes: DeadCodeFileChange[];
  /** Finding ids the plan covers (selected + automatically linked). */
  planned: string[];
  skipped: Array<{ id: string; reason: string }>;
  notes: string[];
}

interface InternalChange extends DeadCodeFileChange {
  before: string;
  after: string | null;
}

interface InternalPlan extends DeadCodePlan {
  internal: InternalChange[];
  analysis: DeadCodeAnalysis;
  /** Automatically added finding id → the selected finding that pulled it in. */
  linkedBy: Map<string, string>;
}

const MAX_DIFF_LINES = 400;

function truncateDiff(diff: string): string {
  const lines = diff.split('\n');
  if (lines.length <= MAX_DIFF_LINES) return diff;
  return `${lines.slice(0, MAX_DIFF_LINES).join('\n')}\n… ${lines.length - MAX_DIFF_LINES} more diff lines`;
}

// ─── Text edits ──────────────────────────────────────────────────────────

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(text: string, edits: Edit[]): string {
  // Drop edits contained in another (removing a statement already removes its modifier).
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Edit[] = [];
  for (const e of sorted) {
    const last = kept[kept.length - 1];
    if (last && e.start < last.end) {
      if (e.end > last.end) last.end = e.end;
      continue;
    }
    kept.push({ ...e });
  }
  let out = text;
  for (let i = kept.length - 1; i >= 0; i--) {
    const e = kept[i]!;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

/** Statement span including attached leading comments, the trailing comment and its line break. */
function statementRange(ts: Ts, sf: TS.SourceFile, node: TS.Node): [number, number] {
  const text = sf.text;
  let start = node.getStart(sf);
  const comments = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i]!;
    const gap = text.slice(c.end, start);
    if ((gap.match(/\n/g)?.length ?? 0) > 1) break;
    start = c.pos;
  }
  let lineStart = start;
  while (lineStart > 0 && (text[lineStart - 1] === ' ' || text[lineStart - 1] === '\t'))
    lineStart--;
  if (lineStart === 0 || text[lineStart - 1] === '\n') start = lineStart;
  let end = node.getEnd();
  for (const c of ts.getTrailingCommentRanges(text, end) ?? []) {
    if (!text.slice(end, c.pos).includes('\n')) end = c.end;
  }
  while (end < text.length && (text[end] === ' ' || text[end] === '\t')) end++;
  if (text[end] === '\r') end++;
  if (text[end] === '\n') end++;
  // Don't leave a double blank line behind.
  const before = text.slice(Math.max(0, start - 4), start);
  const blankBefore = start === 0 || /\n[ \t]*\r?\n$/.test(before) || before.endsWith('\n\n');
  if (blankBefore) {
    const m = /^[ \t]*\r?\n/.exec(text.slice(end));
    if (m) end += m[0].length;
  }
  return [start, end];
}

function nextTokenStart(text: string, pos: number): number {
  let i = pos;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

function modifierOf(ts: Ts, node: TS.Node, kind: TS.SyntaxKind): TS.Modifier | undefined {
  if (!ts.canHaveModifiers(node)) return undefined;
  return (ts.getModifiers(node) ?? []).find((m) => m.kind === kind);
}

function declaredName(ts: Ts, stmt: TS.Statement): string | null {
  if (
    (ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)) &&
    stmt.name &&
    ts.isIdentifier(stmt.name)
  ) {
    return stmt.name.text;
  }
  if (ts.isVariableStatement(stmt)) {
    const decls = stmt.declarationList.declarations;
    if (decls.length === 1 && ts.isIdentifier(decls[0]!.name)) return decls[0]!.name.text;
  }
  return null;
}

type ListNode = TS.NamedExports | TS.NamedImports;

/** Edits that remove `drop` elements from export/import lists, rebuilding each list once. */
function listEdits(
  ts: Ts,
  sf: TS.SourceFile,
  drops: Map<ListNode, Set<number>>,
  eol: string,
): Edit[] {
  const edits: Edit[] = [];
  for (const [list, indices] of drops) {
    const stmt = list.parent.kind === ts.SyntaxKind.ImportClause ? list.parent.parent : list.parent;
    const kept = list.elements.filter((_, i) => !indices.has(i));
    const isImport = ts.isNamedImports(list);
    if (kept.length === 0) {
      if (isImport) {
        const clause = list.parent as TS.ImportClause;
        if (clause.name) {
          // `import D, { a } from` → `import D from`
          edits.push({ start: clause.name.getEnd(), end: list.getEnd(), text: '' });
          continue;
        }
      }
      const [s, e] = statementRange(ts, sf, stmt);
      edits.push({ start: s, end: e, text: '' });
      continue;
    }
    const original = list.getText(sf);
    const texts = kept.map((el) => el.getText(sf));
    let rebuilt: string;
    if (original.includes('\n')) {
      const firstLineStart = sf.text.lastIndexOf('\n', list.elements[0]!.getStart(sf)) + 1;
      const indent = /^[ \t]*/.exec(sf.text.slice(firstLineStart))![0];
      const closeLineStart = sf.text.lastIndexOf('\n', list.getEnd() - 1) + 1;
      const closeIndent = /^[ \t]*/.exec(sf.text.slice(closeLineStart))![0];
      rebuilt = `{${eol}${texts.map((t) => `${indent}${t},`).join(eol)}${eol}${closeIndent}}`;
    } else {
      rebuilt = `{ ${texts.join(', ')} }`;
    }
    edits.push({ start: list.getStart(sf), end: list.getEnd(), text: rebuilt });
  }
  return edits;
}

function addDrop(drops: Map<ListNode, Set<number>>, list: ListNode, index: number): void {
  let set = drops.get(list);
  if (!set) {
    set = new Set();
    drops.set(list, set);
  }
  set.add(index);
}

// ─── Per-file edit computation ───────────────────────────────────────────

interface FileOps {
  removeDeclarations: Set<string>; // exported names (or local names for unused-local)
  removeLocals: Set<string>;
  unexport: Set<string>;
  removeReexports: Set<string>;
}

function computeFileEdit(ts: Ts, file: string, text: string, ops: FileOps): string {
  const sf = createSource(ts, file, text);
  const facts = extractModuleFacts(ts, file, text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const edits: Edit[] = [];
  const drops = new Map<ListNode, Set<number>>();

  // Exported name → local binding; local → every exported name it has.
  const localOf = new Map<string, string | null>();
  const namesOfLocal = new Map<string, string[]>();
  for (const exp of facts.exports) {
    localOf.set(exp.name, exp.local);
    if (exp.local) namesOfLocal.set(exp.local, [...(namesOfLocal.get(exp.local) ?? []), exp.name]);
  }

  const deleteLocals = new Set<string>(ops.removeLocals);
  const dropExportNames = new Set<string>(ops.unexport);
  let removeAnonymousDefault = false;
  for (const name of ops.removeDeclarations) {
    const local = localOf.get(name);
    if (local === undefined) continue;
    if (local === null) {
      if (name === 'default') removeAnonymousDefault = true;
      continue;
    }
    // Another exported alias of the same binding survives: drop only this name.
    const aliases = namesOfLocal.get(local) ?? [];
    if (aliases.some((a) => a !== name && !ops.removeDeclarations.has(a))) {
      dropExportNames.add(name);
      continue;
    }
    deleteLocals.add(local);
    for (const a of aliases) dropExportNames.add(a);
  }

  for (const stmt of sf.statements) {
    const name = declaredName(ts, stmt);
    const exportMod = modifierOf(ts, stmt, ts.SyntaxKind.ExportKeyword);
    const defaultMod = modifierOf(ts, stmt, ts.SyntaxKind.DefaultKeyword);
    const exportedAs = exportMod ? (defaultMod ? 'default' : name) : null;

    if (name && deleteLocals.has(name)) {
      const [s, e] = statementRange(ts, sf, stmt);
      edits.push({ start: s, end: e, text: '' });
      continue;
    }
    if (exportedAs === 'default' && name === null && removeAnonymousDefault) {
      const [s, e] = statementRange(ts, sf, stmt);
      edits.push({ start: s, end: e, text: '' });
      continue;
    }
    if (exportMod && exportedAs && dropExportNames.has(exportedAs)) {
      if (defaultMod && name === null) continue; // anonymous default cannot lose `export`
      const until = defaultMod ? defaultMod.getEnd() : exportMod.getEnd();
      edits.push({ start: exportMod.getStart(sf), end: nextTokenStart(text, until), text: '' });
      continue;
    }
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const local = ts.isIdentifier(stmt.expression) ? stmt.expression.text : null;
      if (
        dropExportNames.has('default') ||
        (local === null && removeAnonymousDefault) ||
        (local !== null && deleteLocals.has(local))
      ) {
        const [s, e] = statementRange(ts, sf, stmt);
        edits.push({ start: s, end: e, text: '' });
      }
      continue;
    }
    if (ts.isExportDeclaration(stmt)) {
      const clause = stmt.exportClause;
      const viaModule = stmt.moduleSpecifier !== undefined;
      if (clause && ts.isNamespaceExport(clause)) {
        if (viaModule && ops.removeReexports.has(clause.name.text)) {
          const [s, e] = statementRange(ts, sf, stmt);
          edits.push({ start: s, end: e, text: '' });
        }
        continue;
      }
      if (!clause) continue;
      clause.elements.forEach((el, i) => {
        const exported = el.name.text;
        const remove = viaModule
          ? ops.removeReexports.has(exported)
          : dropExportNames.has(exported) || ops.removeReexports.has(exported);
        if (remove) addDrop(drops, clause, i);
      });
    }
  }

  edits.push(...listEdits(ts, sf, drops, eol));
  return applyEdits(text, edits);
}

/** Side-effect-free right-hand sides: dropping `x = <rhs>;` changes nothing else. */
function isPureExpression(ts: Ts, e: TS.Expression): boolean {
  if (ts.isIdentifier(e) || ts.isLiteralExpression(e) || ts.isNoSubstitutionTemplateLiteral(e))
    return true;
  const k = e.kind;
  if (
    k === ts.SyntaxKind.NullKeyword ||
    k === ts.SyntaxKind.TrueKeyword ||
    k === ts.SyntaxKind.FalseKeyword ||
    k === ts.SyntaxKind.ThisKeyword
  ) {
    return true;
  }
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return true;
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
    return isPureExpression(ts, e.expression);
  }
  if (ts.isPropertyAccessExpression(e)) return isPureExpression(ts, e.expression);
  return false;
}

/**
 * Every statement that writes `name`, if all are plain `name = <pure>;`
 * statements; null when any write is something else (its side effects must stay).
 */
function pureAssignmentStatements(ts: Ts, sf: TS.SourceFile, name: string): TS.Statement[] | null {
  const out: TS.Statement[] = [];
  let impure = false;
  const visit = (node: TS.Node): void => {
    if (impure) return;
    if (ts.isIdentifier(node) && node.text === name && isWriteOnlyPosition(ts, node)) {
      const write = node.parent;
      const stmt = write.parent;
      if (
        ts.isBinaryExpression(write) &&
        write.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isPureExpression(ts, write.right) &&
        ts.isExpressionStatement(stmt)
      ) {
        out.push(stmt);
      } else {
        impure = true;
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return impure ? null : out;
}

/**
 * Remove imports and private top-level declarations that the edit orphaned:
 * referenced in `original`, unreferenced in `current`. Repeats to a fixpoint
 * (a removed helper may orphan another).
 */
function cascadeCleanup(ts: Ts, file: string, original: string, current: string): string {
  const orig = buildRefIndex(ts, createSource(ts, file, original), true);
  const reads = (idx: { counts: Map<string, number>; writes: Map<string, number> }, n: string) =>
    (idx.counts.get(n) ?? 0) - (idx.writes.get(n) ?? 0);
  let text = current;
  for (let round = 0; round < 6; round++) {
    const sf = createSource(ts, file, text);
    const now = buildRefIndex(ts, sf, true);
    const refs = now.counts;
    const orphaned = (name: string): boolean =>
      (orig.counts.get(name) ?? 0) > 0 && (refs.get(name) ?? 0) === 0;
    // A variable whose last READ went away but that is still assigned.
    const writeOnly = (name: string): boolean =>
      reads(orig, name) > 0 && reads(now, name) === 0 && (now.writes.get(name) ?? 0) > 0;
    const edits: Edit[] = [];
    const drops = new Map<ListNode, Set<number>>();
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && stmt.importClause) {
        const clause = stmt.importClause;
        const nb = clause.namedBindings;
        // No default binding counts as "gone" for the whole-statement test.
        const defaultGone = clause.name ? orphaned(clause.name.text) : true;
        if (nb && ts.isNamespaceImport(nb)) {
          if (orphaned(nb.name.text) && defaultGone) {
            const [s, e] = statementRange(ts, sf, stmt);
            edits.push({ start: s, end: e, text: '' });
          }
          continue;
        }
        const named = nb && ts.isNamedImports(nb) ? nb : undefined;
        const goneIdx = named
          ? named.elements.flatMap((el, i) => (orphaned(el.name.text) ? [i] : []))
          : [];
        const allNamedGone = !named || goneIdx.length === named.elements.length;
        if (clause.name && defaultGone && allNamedGone) {
          const [s, e] = statementRange(ts, sf, stmt);
          edits.push({ start: s, end: e, text: '' });
          continue;
        }
        if (clause.name && defaultGone && named) {
          // `import D, { a } from` → `import { a } from`
          edits.push({ start: clause.name.getStart(sf), end: named.getStart(sf), text: '' });
        }
        if (named) for (const i of goneIdx) addDrop(drops, named, i);
        continue;
      }
      if (modifierOf(ts, stmt, ts.SyntaxKind.ExportKeyword)) continue;
      const name = declaredName(ts, stmt);
      if (name && orphaned(name)) {
        const [s, e] = statementRange(ts, sf, stmt);
        edits.push({ start: s, end: e, text: '' });
      } else if (name && ts.isVariableStatement(stmt) && writeOnly(name)) {
        const assignments = pureAssignmentStatements(ts, sf, name);
        if (assignments !== null) {
          for (const node of [stmt, ...assignments]) {
            const [s, e] = statementRange(ts, sf, node);
            edits.push({ start: s, end: e, text: '' });
          }
        }
      }
    }
    edits.push(...listEdits(ts, sf, drops, eol));
    if (edits.length === 0) break;
    text = applyEdits(text, edits);
  }
  return text;
}

function editPackageJson(text: string, removals: Array<{ field: string; dep: string }>): string {
  const json = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
  for (const { field, dep } of removals) {
    const section = json[field];
    if (section && typeof section === 'object') delete section[dep];
  }
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = JSON.stringify(json, null, indent.includes('\t') ? '\t' : indent.length);
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  return text.endsWith('\n') ? out + eol : out;
}

// ─── Planning ────────────────────────────────────────────────────────────

export async function planDeadCodeFixesInternal(
  projectRoot: string,
  findingIds: readonly string[],
  scanOptions: DeadCodeScanOptions = {},
): Promise<InternalPlan> {
  const ts = await loadTypescript();
  const analysis = await analyzeDeadCode(projectRoot, { ...scanOptions, paths: undefined });
  const byId = new Map(analysis.findings.map((f) => [f.id, f]));
  const skipped: Array<{ id: string; reason: string }> = [];
  const notes: string[] = [];
  const selected: DeadCodeFinding[] = [];
  for (const id of new Set(findingIds)) {
    const f = byId.get(id);
    if (!f) {
      skipped.push({ id, reason: 'Not in a fresh scan — already fixed, or the code changed.' });
      continue;
    }
    if (!f.fix) {
      skipped.push({ id, reason: f.manualReason ?? 'No mechanical fix for this finding.' });
      continue;
    }
    selected.push(f);
  }

  const deletes = new Set(selected.filter((f) => f.fix === 'delete-file').map((f) => f.file));
  // A deleted file must not stay imported by a surviving file. A file kept for
  // that reason survives too, so what IT imports must stay: repeat to a fixpoint.
  for (let changed = true; changed; ) {
    changed = false;
    for (const file of [...deletes]) {
      const importers: string[] = [];
      for (const node of analysis.nodes.values()) {
        if (deletes.has(node.rel)) continue;
        const hits =
          node.imports.some((i) => i.targets.includes(file) && i.kind !== 'mock') ||
          node.reexports.some((r) => r.targets.includes(file)) ||
          // Glob loaders, dynamic-import prefixes and path literals reference
          // files through extraEdges — there is no import statement to inspect.
          node.extraEdges.includes(file);
        if (hits) importers.push(node.rel);
      }
      if (importers.length > 0) {
        deletes.delete(file);
        changed = true;
        const f = selected.find((s) => s.file === file && s.fix === 'delete-file')!;
        skipped.push({
          id: f.id,
          reason: `Still imported by ${importers.slice(0, 3).join(', ')}${importers.length > 3 ? '…' : ''} — select those too.`,
        });
      }
    }
  }

  const ops = new Map<string, FileOps>();
  const opsFor = (file: string): FileOps => {
    let o = ops.get(file);
    if (!o) {
      o = {
        removeDeclarations: new Set(),
        removeLocals: new Set(),
        unexport: new Set(),
        removeReexports: new Set(),
      };
      ops.set(file, o);
    }
    return o;
  };
  const owners = new Map<string, Set<string>>();
  const own = (file: string, id: string): void => {
    const set = owners.get(file) ?? new Set();
    set.add(id);
    owners.set(file, set);
  };
  const planned = new Set<string>();
  const linkedBy = new Map<string, string>();
  const depRemovals = new Map<string, Array<{ field: string; dep: string }>>();

  for (const f of selected) {
    if (f.fix === 'delete-file') {
      if (!deletes.has(f.file)) continue;
      planned.add(f.id);
      own(f.file, f.id);
      continue;
    }
    if (deletes.has(f.file)) {
      planned.add(f.id);
      continue;
    }
    planned.add(f.id);
    own(f.file, f.id);
    const name = f.name ?? '';
    switch (f.fix) {
      case 'remove-declaration':
        if (f.category === 'unused-local') opsFor(f.file).removeLocals.add(name);
        else opsFor(f.file).removeDeclarations.add(name);
        break;
      case 'remove-export-keyword':
        opsFor(f.file).unexport.add(name);
        break;
      case 'remove-reexport':
        opsFor(f.file).removeReexports.add(name);
        break;
      case 'remove-dependency': {
        const list = depRemovals.get(f.file) ?? [];
        list.push({ field: f.kind ?? 'dependencies', dep: name });
        depRemovals.set(f.file, list);
        break;
      }
    }
  }

  // Deleting a declaration breaks every barrel still re-exporting it. Those
  // re-exports are unused by construction (else the export would be live):
  // remove them in the same change.
  for (const f of selected) {
    if (f.fix !== 'remove-declaration' || f.category === 'unused-local' || !planned.has(f.id))
      continue;
    for (const node of analysis.nodes.values()) {
      if (deletes.has(node.rel)) continue;
      for (const re of node.reexports) {
        if (!re.targets.includes(f.file)) continue;
        for (const n of re.fact.names) {
          if (n.imported !== f.name) continue;
          opsFor(node.rel).removeReexports.add(n.exported);
          const linked = analysis.findings.find(
            (x) => x.category === 'unused-reexport' && x.file === node.rel && x.name === n.exported,
          );
          if (linked) {
            planned.add(linked.id);
            own(node.rel, linked.id);
            if (!linkedBy.has(linked.id)) linkedBy.set(linked.id, f.id);
          }
          notes.push(
            `${node.rel}: also removing re-export '${n.exported}' of deleted ${f.file}#${f.name}.`,
          );
        }
      }
    }
  }

  const internal: InternalChange[] = [];
  for (const file of deletes) {
    const abs = path.join(projectRoot, file);
    const before = fs.readFileSync(abs, 'utf8');
    const lines = before.split('\n').length;
    internal.push({
      file,
      action: 'delete',
      before,
      after: null,
      diff: `--- a/${file}\n+++ /dev/null\n(deleted: ${lines} lines)`,
      findingIds: [...(owners.get(file) ?? [])],
    });
  }
  for (const [file, removals] of depRemovals) {
    const abs = path.join(projectRoot, file);
    const before = fs.readFileSync(abs, 'utf8');
    const after = editPackageJson(before, removals);
    internal.push({
      file,
      action: 'edit',
      before,
      after,
      diff: unifiedDiff(before, after, { fromFile: `a/${file}`, toFile: `b/${file}` }),
      findingIds: [...(owners.get(file) ?? [])],
    });
    notes.push(`${file}: run your package manager's install afterwards to update the lockfile.`);
  }
  for (const [file, fileOps] of ops) {
    const abs = path.join(projectRoot, file);
    let before: string;
    try {
      before = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const edited = computeFileEdit(ts, file, before, fileOps);
    const after = edited === before ? before : cascadeCleanup(ts, file, before, edited);
    if (after === before) {
      for (const id of owners.get(file) ?? []) {
        planned.delete(id);
        skipped.push({ id, reason: 'The edit could not be located in the current source.' });
      }
      continue;
    }
    internal.push({
      file,
      action: 'edit',
      before,
      after,
      diff: truncateDiff(
        unifiedDiff(before, after, { fromFile: `a/${file}`, toFile: `b/${file}` }),
      ),
      findingIds: [...(owners.get(file) ?? [])],
    });
  }
  internal.sort((a, b) => a.file.localeCompare(b.file));

  return {
    changes: internal.map(({ before: _b, after: _a, ...rest }) => rest),
    internal,
    planned: [...planned],
    skipped,
    notes,
    analysis,
    linkedBy,
  };
}

export async function planDeadCodeFixes(
  projectRoot: string,
  findingIds: readonly string[],
  scanOptions: DeadCodeScanOptions = {},
): Promise<DeadCodePlan> {
  const {
    internal: _i,
    analysis: _a,
    linkedBy: _l,
    ...plan
  } = await planDeadCodeFixesInternal(projectRoot, findingIds, scanOptions);
  return plan;
}

// ─── Backups ─────────────────────────────────────────────────────────────

interface BackupManifest {
  id: string;
  createdAt: string;
  findingIds: string[];
  files: Array<{ file: string; action: 'edit' | 'delete'; blob: string; afterHash: string | null }>;
}

export interface DeadCodeBackupInfo {
  id: string;
  createdAt: string;
  files: number;
  findingIds: string[];
}

function backupRoot(projectRoot: string): string {
  return path.join(resolveWstackPaths({ projectRoot }).projectDir, 'dead-code', 'backups');
}

function sha(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function writeBackup(projectRoot: string, plan: InternalPlan): BackupManifest {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const dir = path.join(backupRoot(projectRoot), id);
  fs.mkdirSync(path.join(dir, 'blobs'), { recursive: true });
  const manifest: BackupManifest = {
    id,
    createdAt: new Date().toISOString(),
    findingIds: plan.planned,
    files: plan.internal.map((c, i) => {
      const blob = `${i}.txt`;
      fs.writeFileSync(path.join(dir, 'blobs', blob), c.before);
      return {
        file: c.file,
        action: c.action,
        blob,
        afterHash: c.after === null ? null : sha(c.after),
      };
    }),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function restoreFromManifest(
  projectRoot: string,
  manifest: BackupManifest,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  const dir = path.join(backupRoot(projectRoot), manifest.id);
  const restored: string[] = [];
  for (const entry of manifest.files) {
    if (skip.has(entry.file)) continue;
    const content = fs.readFileSync(path.join(dir, 'blobs', entry.blob), 'utf8');
    const abs = path.join(projectRoot, entry.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    restored.push(entry.file);
  }
  return restored;
}

export function listDeadCodeBackups(projectRoot: string): DeadCodeBackupInfo[] {
  const root = backupRoot(projectRoot);
  let ids: string[];
  try {
    ids = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: DeadCodeBackupInfo[] = [];
  for (const id of ids) {
    try {
      const m = JSON.parse(
        fs.readFileSync(path.join(root, id, 'manifest.json'), 'utf8'),
      ) as BackupManifest;
      out.push({
        id: m.id,
        createdAt: m.createdAt,
        files: m.files.length,
        findingIds: m.findingIds,
      });
    } catch {
      // Not a backup directory.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface DeadCodeUndoResult {
  restored: string[];
  /** Files changed after the fix; restored only with `force`. */
  conflicts: string[];
}

export function undoDeadCodeFix(
  projectRoot: string,
  backupId: string,
  opts: { force?: boolean } = {},
): DeadCodeUndoResult {
  if (!/^[\w.-]+$/.test(backupId))
    throw new Error(`dead-code undo: invalid backup id "${backupId}"`);
  const file = path.join(backupRoot(projectRoot), backupId, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error(`dead-code undo: no backup "${backupId}"`);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as BackupManifest;
  const conflicts = changedSinceFix(projectRoot, manifest);
  if (conflicts.length > 0 && !opts.force) return { restored: [], conflicts };
  return { restored: restoreFromManifest(projectRoot, manifest), conflicts };
}

/** Files no longer exactly as the fix left them (edited again, or a deleted file recreated). */
function changedSinceFix(projectRoot: string, manifest: BackupManifest): string[] {
  const conflicts: string[] = [];
  for (const entry of manifest.files) {
    const abs = path.join(projectRoot, entry.file);
    const exists = fs.existsSync(abs);
    if (entry.action === 'delete' && exists) conflicts.push(entry.file);
    if (entry.action === 'edit') {
      const current = exists ? fs.readFileSync(abs, 'utf8') : null;
      if (current === null || sha(current) !== entry.afterHash) conflicts.push(entry.file);
    }
  }
  return conflicts;
}

// ─── Verification ────────────────────────────────────────────────────────

export type DeadCodeVerifyMode = 'typecheck' | 'none';

export interface DeadCodeVerifyStep {
  package: string;
  command: string;
  ok: boolean;
  /** Tail of the combined output. */
  output: string;
  durationMs: number;
}

/** Runs argv without a shell; `.cmd`/`.bat` shims go through the hardened cmd builder. */
function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      const resolved = resolveWin32Command(command);
      if (isWinCmdShim(resolved)) {
        const inv = buildWin32CmdShimInvocation(resolved, [...args]);
        child = spawn(inv.command, inv.args, {
          cwd,
          windowsHide: true,
          windowsVerbatimArguments: inv.windowsVerbatimArguments,
          env: buildChildEnv(),
        });
      } else {
        child = spawn(resolved, [...args], { cwd, windowsHide: true, env: buildChildEnv() });
      }
    } catch (err) {
      resolve({ ok: false, output: toErrorMessage(err) });
      return;
    }
    let output = '';
    const onData = (d: Buffer): void => {
      output += d.toString('utf8');
      if (output.length > 64_000) output = output.slice(-32_000);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const timer = setTimeout(() => {
      output += `\n[timed out after ${Math.round(timeoutMs / 1000)}s]`;
      // A `.cmd` shim's real process is a grandchild: kill the whole tree.
      treeKill(child, { force: true });
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `${output}\n${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.slice(-8_000) });
    });
  });
}

interface TypecheckCommand {
  command: string;
  args: string[];
  cwd: string;
  label: string;
}

/** The package's own `tsc` binary (node_modules/.bin), else the workspace root's. */
function findTscBin(projectRoot: string, dir: string): string | null {
  const names = process.platform === 'win32' ? ['tsc.cmd', 'tsc.exe', 'tsc'] : ['tsc'];
  for (const base of [dir, projectRoot]) {
    for (const n of names) {
      const candidate = path.join(base, 'node_modules', '.bin', n);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  try {
    return createRequire(path.join(dir, 'package.json')).resolve('typescript/bin/tsc');
  } catch {
    return null;
  }
}

const BUILD_ONLY_FLAGS = new Set([
  '--build',
  '-b',
  '--verbose',
  '-v',
  '--dry',
  '-d',
  '--force',
  '-f',
  '--clean',
  '--stopBuildOnErrors',
]);

/**
 * `tsc -b [project…]` as plain `tsc` argv lists: positional arguments name
 * projects in build mode but source files otherwise (TS5112), and build-only
 * flags are errors outside it.
 */
function withoutBuildMode(args: string[]): string[][] {
  if (!args.includes('--build') && !args.includes('-b')) return [args];
  const flags = args.filter((a) => a.startsWith('-') && !BUILD_ONLY_FLAGS.has(a));
  const projects = args.filter((a) => !a.startsWith('-'));
  return projects.length === 0 ? [flags] : projects.map((p) => ['-p', p, ...flags]);
}

/**
 * Side-effect-free typecheck commands for one package.
 *
 * A `typecheck` script may build other packages first (`pnpm --filter x build
 * && tsc --noEmit`): running it would rewrite `dist/` from the edited sources,
 * and a rollback restores sources, not build output. So only the script's
 * `tsc` steps run — forced to `--noEmit` — and a package without such a script
 * gets `tsc --noEmit -p tsconfig.json`.
 */
function typecheckCommands(projectRoot: string, pkg: PackageInfo | undefined): TypecheckCommand[] {
  const dir = path.join(projectRoot, pkg?.dir ?? '');
  const tsc = findTscBin(projectRoot, dir);
  if (!tsc) return [];
  const asCommand = (args: string[]): TypecheckCommand => {
    const full = args.includes('--noEmit') ? args : ['--noEmit', ...args];
    const isScript = /\.(?:[cm]?js)$/i.test(tsc);
    return {
      command: isScript ? process.execPath : tsc,
      args: isScript ? [tsc, ...full] : full,
      cwd: dir,
      label: `tsc ${full.join(' ')}`,
    };
  };
  const script = (pkg?.manifest.scripts as Record<string, unknown> | undefined)?.typecheck;
  if (typeof script === 'string') {
    const steps = script
      .split(/&&|\|\||;/)
      .map((seg) => seg.trim().split(/\s+/))
      .filter((argv) => argv[0] === 'tsc' || argv[0] === 'tsgo')
      .flatMap((argv) => withoutBuildMode(argv.slice(1)));
    if (steps.length > 0) return steps.map(asCommand);
  }
  if (!fs.existsSync(path.join(dir, 'tsconfig.json'))) return [];
  return [asCommand(['-p', 'tsconfig.json'])];
}

// ─── Apply ───────────────────────────────────────────────────────────────

export interface DeadCodeApplyOptions extends DeadCodeScanOptions {
  verify?: DeadCodeVerifyMode | undefined;
  /** Extra check run at the project root after the typecheck, as argv (`['pnpm', 'test']`). */
  verifyCommand?: readonly string[] | undefined;
  verifyTimeoutMs?: number | undefined;
  /**
   * On a failed verification, drop the findings the errors point at and retry
   * the rest (default true). False = all-or-nothing.
   */
  quarantine?: boolean | undefined;
  onProgress?: ((message: string) => void) | undefined;
}

export interface DeadCodeApplyResult {
  ok: boolean;
  /** Present when files were written and kept. */
  backupId?: string | undefined;
  changed: string[];
  deleted: string[];
  rolledBack: boolean;
  verify: DeadCodeVerifyStep[];
  plan: DeadCodePlan;
  /** Findings dropped because removing them broke verification. */
  excluded: Array<{ id: string; reason: string }>;
  attempts: number;
}

const MAX_ATTEMPTS = 6;
/** `src/a.ts(12,3): error TS…` (tsc) and `src/a.ts:12:3 - error …` (pretty / tsgo). */
const ERROR_LOCATION = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)\s*[:-]\s*error\b/gm;

function writeChanges(projectRoot: string, plan: InternalPlan): BackupManifest {
  const manifest = writeBackup(projectRoot, plan);
  try {
    for (const c of plan.internal) {
      const abs = path.join(projectRoot, c.file);
      if (c.action === 'delete') fs.unlinkSync(abs);
      else if (c.after !== null) fs.writeFileSync(abs, c.after);
    }
  } catch (err) {
    restoreFromManifest(projectRoot, manifest);
    throw new Error(
      `dead-code fix: writing failed and every file was restored: ${toErrorMessage(err)}`,
    );
  }
  return manifest;
}

type VerifyStepWithCwd = DeadCodeVerifyStep & { cwd: string };

async function verifyChanges(
  projectRoot: string,
  plan: InternalPlan,
  opts: DeadCodeApplyOptions,
  progress: (m: string) => void,
): Promise<{ ok: boolean; steps: VerifyStepWithCwd[] }> {
  const steps: VerifyStepWithCwd[] = [];
  const timeoutMs = opts.verifyTimeoutMs ?? 10 * 60_000;
  if ((opts.verify ?? 'typecheck') === 'typecheck') {
    const manifests = new Set<string>();
    for (const c of plan.internal) {
      const parts = c.file.split('/');
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = [...parts.slice(0, i), 'package.json'].join('/');
        if (fs.existsSync(path.join(projectRoot, candidate))) manifests.add(candidate);
      }
    }
    const packages = discoverPackages(projectRoot, [...manifests]);
    const affected = new Map<string, PackageInfo | undefined>();
    for (const c of plan.internal) {
      const pkg = owningPackage(packages, c.file);
      affected.set(pkg?.dir ?? '', pkg);
    }
    for (const pkg of affected.values()) {
      for (const cmd of typecheckCommands(projectRoot, pkg)) {
        progress(`Typechecking ${pkg?.name ?? 'project'} (${cmd.label})…`);
        const started = Date.now();
        const res = await runCommand(cmd.command, cmd.args, cmd.cwd, timeoutMs);
        steps.push({
          package: pkg?.name ?? '(root)',
          command: cmd.label,
          ok: res.ok,
          output: res.output,
          durationMs: Date.now() - started,
          cwd: cmd.cwd,
        });
        // Keep going: one round should surface every failing package, so the
        // quarantine can drop all culprits at once instead of one per retry.
      }
    }
    if (steps.some((st) => !st.ok)) return { ok: false, steps };
  }
  if (opts.verifyCommand && opts.verifyCommand.length > 0) {
    const [command, ...args] = opts.verifyCommand;
    const label = opts.verifyCommand.join(' ');
    progress(`Running ${label}…`);
    const started = Date.now();
    const res = await runCommand(command!, args, projectRoot, timeoutMs);
    steps.push({
      package: '(custom)',
      command: label,
      ok: res.ok,
      output: res.output,
      durationMs: Date.now() - started,
      cwd: projectRoot,
    });
    if (!res.ok) return { ok: false, steps };
  }
  return { ok: true, steps };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Which selected findings a failed verification points at: a finding whose
 * symbol the errors name, or — when no name matches — whose changed file an
 * error is located in. Linked re-export removals blame the finding that pulled
 * them in.
 */
function attributeFailure(
  projectRoot: string,
  plan: InternalPlan,
  steps: readonly VerifyStepWithCwd[],
  selected: ReadonlySet<string>,
): Map<string, string> {
  const failed = steps.filter((s) => !s.ok);
  const text = failed.map((s) => s.output).join('\n');
  const errorFiles = new Set<string>();
  for (const step of failed) {
    ERROR_LOCATION.lastIndex = 0;
    for (;;) {
      const m = ERROR_LOCATION.exec(step.output);
      if (m === null) break;
      const abs = path.resolve(step.cwd, m[1]!.trim());
      errorFiles.add(path.relative(projectRoot, abs).split(path.sep).join('/'));
    }
  }
  const byId = new Map(plan.analysis.findings.map((f) => [f.id, f]));
  const blame = new Map<string, string>();
  const blameSelected = (id: string, reason: string): void => {
    const target = selected.has(id) ? id : plan.linkedBy.get(id);
    if (target && selected.has(target) && !blame.has(target)) blame.set(target, reason);
  };
  for (const id of plan.planned) {
    const f = byId.get(id);
    if (!f?.name) continue;
    // TypeScript quotes identifiers in diagnostics (`Property 'x'`, `name 'Y'`);
    // a bare-word match blamed `main` for every error in a file named main.ts.
    const re = new RegExp(`['"\u0060]${escapeRegExp(f.name)}['"\u0060]`);
    if (re.test(text)) blameSelected(id, `verification errors name '${f.name}'`);
  }
  if (blame.size === 0) {
    for (const c of plan.internal) {
      if (!errorFiles.has(c.file)) continue;
      for (const id of c.findingIds) blameSelected(id, `verification failed in ${c.file}`);
    }
  }
  return blame;
}

export async function applyDeadCodeFixes(
  projectRoot: string,
  findingIds: readonly string[],
  opts: DeadCodeApplyOptions = {},
): Promise<DeadCodeApplyResult> {
  const progress = opts.onProgress ?? (() => {});
  const excluded: Array<{ id: string; reason: string }> = [];
  let ids = [...new Set(findingIds)];
  let lastSteps: DeadCodeVerifyStep[] = [];
  let lastPlan: DeadCodePlan = { changes: [], planned: [], skipped: [], notes: [] };
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    progress(
      attempts === 1
        ? 'Re-scanning and planning…'
        : `Retrying without ${excluded.length} finding(s)…`,
    );
    const plan = await planDeadCodeFixesInternal(projectRoot, ids, opts);
    lastPlan = {
      changes: plan.changes,
      planned: plan.planned,
      skipped: [...plan.skipped, ...excluded],
      notes: plan.notes,
    };
    if (plan.internal.length === 0) break;

    const manifest = writeChanges(projectRoot, plan);
    const { ok, steps } = await verifyChanges(projectRoot, plan, opts, progress);
    lastSteps = steps.map(({ cwd: _cwd, ...step }) => step);
    if (ok) {
      return {
        ok: true,
        backupId: manifest.id,
        changed: plan.internal.filter((c) => c.action === 'edit').map((c) => c.file),
        deleted: plan.internal.filter((c) => c.action === 'delete').map((c) => c.file),
        rolledBack: false,
        verify: lastSteps,
        plan: lastPlan,
        excluded,
        attempts,
      };
    }
    progress('Verification failed — restoring every file…');
    // Verification can run for minutes: a file edited meanwhile is someone
    // else's work now. Keep it and the backup instead of overwriting it.
    const conflicts = changedSinceFix(projectRoot, manifest);
    restoreFromManifest(projectRoot, manifest, new Set(conflicts));
    if (conflicts.length > 0) {
      // The kept backup covers only what was not restored.
      const kept = { ...manifest, files: manifest.files.filter((f) => conflicts.includes(f.file)) };
      fs.writeFileSync(
        path.join(backupRoot(projectRoot), manifest.id, 'manifest.json'),
        JSON.stringify(kept, null, 2),
      );
      return {
        ok: false,
        backupId: manifest.id,
        changed: [],
        deleted: [],
        rolledBack: true,
        verify: lastSteps,
        plan: {
          ...lastPlan,
          notes: [
            ...lastPlan.notes,
            `Not restored — changed while verification ran: ${conflicts.join(', ')}. Undo backup ${manifest.id} with force to restore them.`,
          ],
        },
        excluded,
        attempts,
      };
    }
    fs.rmSync(path.join(backupRoot(projectRoot), manifest.id), { recursive: true, force: true });
    if (opts.quarantine === false) {
      return {
        ok: false,
        changed: [],
        deleted: [],
        rolledBack: true,
        verify: lastSteps,
        plan: lastPlan,
        excluded,
        attempts,
      };
    }
    const blame = attributeFailure(projectRoot, plan, steps, new Set(ids));
    if (blame.size === 0 || blame.size >= ids.length) {
      return {
        ok: false,
        changed: [],
        deleted: [],
        rolledBack: true,
        verify: lastSteps,
        plan: lastPlan,
        excluded,
        attempts,
      };
    }
    for (const [id, reason] of blame) excluded.push({ id, reason: `Excluded: ${reason}.` });
    ids = ids.filter((id) => !blame.has(id));
  }
  // Nothing left to write (every finding skipped or excluded) or attempts exhausted.
  const nothingWritten = lastPlan.changes.length === 0;
  return {
    ok: nothingWritten && excluded.length === 0,
    changed: [],
    deleted: [],
    rolledBack: !nothingWritten || excluded.length > 0,
    verify: lastSteps,
    plan: lastPlan,
    excluded,
    attempts,
  };
}
