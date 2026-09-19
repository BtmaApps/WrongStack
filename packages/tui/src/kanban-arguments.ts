import type {
  KanbanBoundaryAccess,
  KanbanBoundaryPolicy,
  KanbanBoundarySelectorKind,
} from '@wrongstack/kanban';

// ── Argument parser ─────────────────────────────────────────────────────────

export type ParsedKanbanArgs =
  | { kind: 'open' }
  | { kind: 'help' }
  | { kind: 'boards' }
  | { kind: 'create'; title: string }
  | { kind: 'add'; title: string; column: string | null; description?: string | undefined }
  | { kind: 'use'; query: string }
  | { kind: 'health' }
  | { kind: 'audit'; boardQuery: string }
  | {
      kind: 'boundary';
      boardQuery: string;
      action: 'show' | 'allow' | 'deny' | 'clear';
      taskQuery?: string | undefined;
      selectorKind?: KanbanBoundarySelectorKind | undefined;
      access?: KanbanBoundaryAccess | undefined;
      path?: string | undefined;
      enforcement?: KanbanBoundaryPolicy['enforcement'] | undefined;
      shellAccess?: KanbanBoundaryPolicy['shellAccess'] | undefined;
    };

/**
 * Parse the raw `args` string (everything after `/kanban`) into a tagged
 * union. Exported so tests can exercise the grammar in isolation.
 *
 * Grammar (whitespace-separated; quoted titles supported for the `create`
 * subcommand):
 *
 *   args       ::= ε | "help" | "boards" | "create" title
 *                |  "add" title ("--" "column" columnId)?
 *   title      ::= token+
 *   columnId   ::= token
 */
export function parseKanbanArgs(raw: string): ParsedKanbanArgs {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0) return { kind: 'open' };
  const head = tokens[0]?.toLowerCase() ?? '';
  if (head === 'help' || head === '--help' || head === '-h') return { kind: 'help' };
  if (head === 'boards' || head === 'list' || head === 'ls') {
    return { kind: 'boards' };
  }
  if (head === 'create' || head === 'new' || head === 'add-board') {
    const title = tokens.slice(1).join(' ').trim();
    if (!title) return { kind: 'help' };
    return { kind: 'create', title };
  }
  if (head === 'add' || head === 'add-task' || head === 'task') {
    let title = '';
    let column: string | null = null;
    let description: string | null = null;
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i] ?? '';
      if (tok === '--column' || tok === '-c') {
        const next = tokens[i + 1];
        if (next) {
          column = next;
          i++;
        }
        continue;
      }
      if (tok.startsWith('--column=')) {
        column = tok.slice('--column='.length);
        continue;
      }
      if (tok === '--desc' || tok === '-d') {
        const next = tokens[i + 1];
        if (next) {
          description = next;
          i++;
        }
        continue;
      }
      if (tok.startsWith('--desc=')) {
        description = tok.slice('--desc='.length);
        continue;
      }
      title = title ? `${title} ${tok}` : tok;
    }
    title = title.trim();
    if (!title) return { kind: 'help' };
    return {
      kind: 'add',
      title,
      column,
      ...(description ? { description } : {}),
    };
  }
  if (head === 'use' || head === 'open-board' || head === 'focus') {
    const query = tokens.slice(1).join(' ').trim();
    if (!query) return { kind: 'help' };
    return { kind: 'use', query };
  }
  if (head === 'health' || head === 'queue' || head === 'status') {
    return { kind: 'health' };
  }
  if (head === 'boundary' || head === 'scope' || head === 'bounds') {
    const boardQuery = tokens[1] ?? '';
    const action = (tokens[2]?.toLowerCase() ?? 'show') as 'show' | 'allow' | 'deny' | 'clear';
    if (!boardQuery || !['show', 'allow', 'deny', 'clear'].includes(action)) {
      return { kind: 'help' };
    }
    const readFlag = (name: string): string | undefined => {
      const index = tokens.indexOf(name);
      return index >= 0 ? tokens[index + 1] : undefined;
    };
    const taskQuery = readFlag('--task');
    const enforcement = readFlag('--enforcement');
    const shellAccess = readFlag('--shell');
    if (enforcement && enforcement !== 'confirm' && enforcement !== 'block') {
      return { kind: 'help' };
    }
    if (shellAccess && !['allow', 'confirm', 'block'].includes(shellAccess)) {
      return { kind: 'help' };
    }
    if (action === 'show' || action === 'clear') {
      return {
        kind: 'boundary',
        boardQuery,
        action,
        ...(taskQuery ? { taskQuery } : {}),
      };
    }
    const selectorKind = tokens[3] as KanbanBoundarySelectorKind | undefined;
    const access = tokens[4] as KanbanBoundaryAccess | undefined;
    const selectorPath = tokens[5];
    if (
      !selectorKind ||
      !['file', 'directory', 'package', 'glob'].includes(selectorKind) ||
      !access ||
      !['read', 'write', 'read_write'].includes(access) ||
      !selectorPath
    ) {
      return { kind: 'help' };
    }
    return {
      kind: 'boundary',
      boardQuery,
      action,
      selectorKind,
      access,
      path: selectorPath,
      ...(taskQuery ? { taskQuery } : {}),
      ...(enforcement ? { enforcement: enforcement as KanbanBoundaryPolicy['enforcement'] } : {}),
      ...(shellAccess ? { shellAccess: shellAccess as KanbanBoundaryPolicy['shellAccess'] } : {}),
    };
  }
  if (head === 'audit' || head === 'clean' || head === 'cleaner') {
    // `audit` runs against every board when no argument is supplied;
    // `audit <query>` runs against one board (id / title / tag).
    const boardQuery = tokens.slice(1).join(' ').trim();
    return { kind: 'audit', boardQuery };
  }
  // Unknown subcommand — show the usage text so users discover the right
  // command shape instead of getting a silent "command not found".
  return { kind: 'help' };
}

/**
 * Tokenize the raw `args` string honoring simple shell-style quoting so a
 * title like `Sprint 2 — "Done" state` survives intact.
 *
 * Rules:
 *   - Whitespace separates tokens (spaces and tabs).
 *   - Double-quoted spans preserve spaces; `\\` and `\"` are unescaped.
 *   - Single quotes are literal — no escapes inside.
 *   - A trailing unclosed quote is treated literally (we never throw).
 */
function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '\\' && raw[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (ch === '\\' && raw[i + 1] === '\\') {
        current += '\\';
        i++;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}
