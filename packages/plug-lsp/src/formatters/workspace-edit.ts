import type { TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { displayPath, uriToPathOrUri } from '../utils/uri.js';

export function summarizeWorkspaceEdit(edit: WorkspaceEdit, cwd: string): string {
  const entries = editsByPath(edit);
  if (entries.size === 0) return 'WorkspaceEdit contains no text edits.';
  let total = 0;
  const lines = ['Workspace edit:'];
  for (const [file, edits] of entries) {
    total += edits.length;
    lines.push(`  ${displayPath(file, cwd)} ${edits.length} edit(s)`);
  }
  lines.push(`Total: ${total} edits across ${entries.size} files.`);
  return lines.join('\n');
}

export function editsByPath(edit: WorkspaceEdit): Map<string, TextEdit[]> {
  const out = new Map<string, TextEdit[]>();
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    out.set(uriToPathOrUri(uri), [...edits]);
  }
  const seenInDocChanges = new Set<string>();
  for (const change of edit.documentChanges ?? []) {
    if ('textDocument' in change && Array.isArray(change.edits)) {
      const target = uriToPathOrUri(change.textDocument.uri);
      const validEdits = change.edits.filter((e): e is TextEdit => 'newText' in e);
      if (seenInDocChanges.has(target)) {
        out.get(target)?.push(...validEdits);
      } else {
        seenInDocChanges.add(target);
        out.set(target, [...validEdits]);
      }
    }
  }
  return out;
}
