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
  if (edit.documentChanges?.length) {
    for (const change of edit.documentChanges) {
      if ('textDocument' in change && Array.isArray(change.edits)) {
        const target = uriToPathOrUri(change.textDocument.uri);
        const validEdits = change.edits.filter((e): e is TextEdit => 'newText' in e);
        const existing = out.get(target);
        if (existing) {
          existing.push(...validEdits);
        } else {
          out.set(target, [...validEdits]);
        }
      }
    }
    return out;
  }
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    const target = uriToPathOrUri(uri);
    const existing = out.get(target);
    if (existing) {
      existing.push(...edits);
    } else {
      out.set(target, [...edits]);
    }
  }
  return out;
}
