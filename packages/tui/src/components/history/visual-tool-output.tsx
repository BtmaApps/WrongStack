import { firstNonEmpty, numOf, stringOf, tryParseJson } from './basic-format.js';
import { visualCommand } from './tool-visual-command.js';
import {
  visualCodebase,
  visualDocument,
  visualMetaExecution,
  visualTodo,
  visualToolCatalog,
  visualWorkBoard,
} from './tool-visual-domain.js';
import {
  appendOutputPreview,
  bodyLines,
  numberFromParsedField,
  parseHeaderLine,
  parseKeyValueLines,
  parseNamedSections,
} from './tool-visual-format.js';
import { visualLsp } from './tool-visual-lsp.js';
import {
  visualAudit,
  visualFetch,
  visualJson,
  visualOutdated,
  visualScaffold,
} from './tool-visual-misc.js';
import { visualMode, visualWorkingDir } from './tool-visual-mode-workdir.js';
import type { ToolVisualLine, ToolVisualLineKind } from './tool-visual-types.js';
import { visualLogs, visualMemory } from './visual-memory-logs.js';

// ============================================
// Semantic tool output preview
// ============================================

const VISUAL_MAX_LINES = 7;

/**
 * Build richer terminal-native rows for common tool outputs. This handles both
 * raw JSON-shaped results used by unit tests and the compact serializer text
 * emitted in real sessions.
 */
export function formatToolVisualOutput(
  toolName: string,
  output: string | undefined,
  ok: boolean,
  input?: unknown | undefined,
): ToolVisualLine[] | undefined {
  if (!output) return undefined;
  const text = output.trim();
  if (!text) return undefined;

  if (toolName === 'read' || toolName === 'view_file') return visualRead(text);
  if (toolName === 'grep' || toolName === 'search' || toolName === 'grep_search')
    return visualSearch(toolName, text);
  if (
    toolName === 'glob' ||
    toolName === 'find' ||
    toolName === 'find_by_name' ||
    toolName === 'find_files' ||
    toolName === 'list_dir' ||
    toolName === 'dir_list' ||
    toolName === 'list_directory'
  ) {
    return visualPathList(toolName, text);
  }
  if (toolName === 'tree') return visualTree(text);
  // Edit-style tools render two layers: a compact meta line via
  // `visualEdit` (path + replacement count) at the top, then the actual
  // diff body via the dedicated `<DiffBlock>` that `entry.tsx` already
  // renders below. Without the meta line the user only sees the diff
  // body and may miss which file got touched; with it they get the
  // summary even in `simple` mode where the diff body is hidden.
  if (
    toolName === 'edit' ||
    toolName === 'replace_file_content' ||
    toolName === 'write' ||
    toolName === 'write_to_file' ||
    toolName === 'diff' ||
    toolName === 'patch' ||
    toolName === 'replace'
  ) {
    return visualEdit(toolName, text, ok);
  }
  if (
    toolName === 'bash' ||
    toolName === 'shell' ||
    toolName === 'run_command' ||
    toolName === 'git' ||
    toolName === 'exec' ||
    toolName === 'install'
  ) {
    return visualCommand(toolName, text, ok);
  }
  if (
    toolName === 'test' ||
    toolName === 'lint' ||
    toolName === 'typecheck' ||
    toolName === 'format'
  ) {
    return visualVerifier(toolName, text, ok);
  }
  if (
    toolName === 'fetch' ||
    toolName === 'webfetch' ||
    toolName === 'web_fetch' ||
    toolName === 'read_url_content'
  ) {
    return visualFetch(text);
  }
  if (toolName === 'json') return visualJson(text);
  if (toolName === 'outdated') return visualOutdated(text);
  if (toolName === 'audit') return visualAudit(text);
  if (toolName === 'scaffold') return visualScaffold(text);
  if (toolName === 'todo') return visualTodo(text, input);
  if (toolName === 'task' || toolName === 'plan') return visualWorkBoard(toolName, text, ok);
  if (
    toolName === 'remember' ||
    toolName === 'forget' ||
    toolName === 'search_memory' ||
    toolName === 'find_related_memories'
  ) {
    return visualMemory(toolName, text, ok);
  }
  if (toolName === 'logs') return visualLogs(text);
  if (toolName === 'document') return visualDocument(text);
  if (toolName === 'tool_help' || toolName === 'tool_search')
    return visualToolCatalog(toolName, text);
  if (toolName === 'tool_use' || toolName === 'batch_tool_use')
    return visualMetaExecution(toolName, text, ok);
  if (
    toolName === 'codebase-index' ||
    toolName === 'codebase-search' ||
    toolName === 'codebase-stats' ||
    toolName === 'codebase-incoming-calls' ||
    toolName === 'codebase-outgoing-calls'
  ) {
    return visualCodebase(toolName, text, ok);
  }
  if (toolName.startsWith('lsp_') || toolName === 'codebase-lsp-search') {
    return visualLsp(toolName, text, ok);
  }
  if (toolName === 'set_working_dir') return visualWorkingDir(text, ok);
  if (toolName === 'mode') return visualMode(text, ok);
  return undefined;
}

/**
 * Render the meta line for edit-style tools (`edit`, `write`, `diff`,
 * `patch`, `replace`). The actual diff body is rendered separately by
 * `<DiffBlock>` in `entry.tsx`; this function only produces the compact
 * summary that lives above it — `path · N replacement(s)` for `edit`,
 * `path · N bytes` for `write`, `diff N file(s)` for `diff`/`patch`,
 * `replace · N file(s)` for `replace`. Failing to render means the
 * user only sees the raw diff body (or nothing in `simple` mode),
 * which makes the tool entry look empty.
 */
function visualEdit(toolName: string, text: string, ok: boolean): ToolVisualLine[] | undefined {
  const rows: ToolVisualLine[] = [];
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const path = typeof obj['path'] === 'string' ? (obj['path'] as string) : undefined;
    const replacements =
      typeof obj['replacements'] === 'number' ? (obj['replacements'] as number) : undefined;
    const bytes = typeof obj['bytes'] === 'number' ? (obj['bytes'] as number) : undefined;
    const created = obj['created'] === true;
    const files = Array.isArray(obj['files']) ? (obj['files'] as unknown[]) : undefined;
    const results = Array.isArray(obj['results']) ? (obj['results'] as unknown[]) : undefined;

    if (toolName === 'edit' && path !== undefined) {
      const repText =
        replacements !== undefined
          ? `${replacements} replacement${replacements === 1 ? '' : 's'}`
          : undefined;
      rows.push({ kind: 'ok', text: '', marker: 'edit ', path });
      if (repText) rows.push({ kind: 'meta', text: repText });
    } else if (toolName === 'write' && path !== undefined) {
      const sizeText = bytes !== undefined ? `${bytes} bytes` : created ? 'new file' : 'updated';
      rows.push({ kind: 'ok', text: '', marker: 'write ', path });
      rows.push({ kind: 'meta', text: sizeText });
    } else if ((toolName === 'diff' || toolName === 'patch') && files && files.length > 0) {
      rows.push({
        kind: 'ok',
        marker: `${toolName} `,
        text: `${files.length} file${files.length === 1 ? '' : 's'}`,
      });
    } else if (toolName === 'replace' && results && results.length > 0) {
      const pathSet = new Set<string>();
      for (const r of results) {
        if (r && typeof r === 'object') {
          const p = (r as Record<string, unknown>)['path'];
          if (typeof p === 'string') pathSet.add(p);
        }
      }
      const pathList = Array.from(pathSet);
      const fileCount = pathList.length || results.length;
      rows.push({
        kind: 'ok',
        marker: 'replace ',
        text: `${results.length} replacement${results.length === 1 ? '' : 's'} across ${fileCount} file${fileCount === 1 ? '' : 's'}`,
      });
    } else if (path !== undefined) {
      // Fallback: we have JSON but no recognised shape — still surface
      // the path so the user knows which file got touched.
      rows.push({ kind: 'ok', text: '', marker: `${toolName} `, path });
    } else {
      return undefined;
    }
  } else {
    // Non-JSON output: surface the first non-empty line so the user
    // at least sees *something* (matches the read-tool fallback in
    // visualRead).
    const first = firstNonEmpty(text);
    if (!first) return undefined;
    rows.push({ kind: 'meta', text: first.length > 80 ? `${first.slice(0, 77)}…` : first });
  }
  // Append an error flag for non-ok runs so the visual summary reflects
  // failure when the meta comes from a successful call site.
  if (!ok) rows.push({ kind: 'error', marker: '! ', text: 'edit failed' });
  return rows;
}

function visualRead(text: string): ToolVisualLine[] | undefined {
  const header = parseHeaderLine(text);
  const lines = bodyLines(text);
  const numbered = lines
    .map((line) => line.match(/^\s*(\d+)→(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match?.[1]));
  if (numbered.length === 0) {
    const first = firstNonEmpty(lines.join('\n'));
    return first ? [{ kind: 'meta', text: first }] : undefined;
  }

  const first = Number.parseInt(numbered[0]?.[1] ?? '', 10);
  const last = Number.parseInt(numbered[numbered.length - 1]?.[1] ?? '', 10);
  const total = numberFromParsedField(header.fields, 'total_lines');
  const parts: string[] = [];
  if (Number.isFinite(first) && Number.isFinite(last)) {
    parts.push(first === last ? `L${first}` : `L${first}–${last}`);
  }
  const contiguous =
    Number.isFinite(first) && Number.isFinite(last) ? numbered.length === last - first + 1 : true;
  parts.push(
    `${numbered.length} line${numbered.length === 1 ? '' : 's'}${contiguous ? '' : ' (gaps)'}`,
  );
  if (total !== undefined && total !== numbered.length) parts.push(`${total} total`);
  if (header.fields['truncated'] === 'true') parts.push('truncated');
  if (header.fields['cached'] === 'true') parts.push('cached');
  return [{ kind: 'meta', text: parts.join(' · ') }];
}

function visualSearch(toolName: string, text: string): ToolVisualLine[] | undefined {
  const json = tryParseJson(text);
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const matches = Array.isArray(obj['matches'])
      ? (obj['matches'] as unknown[])
      : Array.isArray(obj['results'])
        ? (obj['results'] as unknown[])
        : [];
    return visualSearchMatches(matches, numOf(obj['count']) ?? matches.length);
  }

  const lines = bodyLines(text);
  if (lines.length === 0 || lines[0] === '(no matches)') return undefined;
  const rows: ToolVisualLine[] = [];
  let consumed = 0;
  let omitted = 0;
  const addRow = (row: ToolVisualLine): void => {
    if (consumed < VISUAL_MAX_LINES) {
      rows.push(row);
      consumed++;
    } else {
      omitted++;
    }
  };
  for (const line of lines) {
    const fileHeader = line.match(/^(.+?) \((\d+) match\(es\), showing \d+\)$/);
    if (fileHeader?.[1]) {
      addRow({ kind: 'path', path: fileHeader[1], text: `${fileHeader[2] ?? '?'} match(es)` });
      continue;
    }
    const direct = line.match(/^((?:[A-Za-z]:)?[^:]+):(\d+)[:-](.*)$/);
    const grouped = line.match(/^(\d+)([:-])(.*)$/);
    if (direct?.[1] && direct[2]) {
      addRow({ kind: 'match', path: direct[1], lineNo: direct[2], text: direct[3] ?? '' });
    } else if (grouped?.[1]) {
      addRow({
        kind: grouped[2] === ':' ? 'match' : 'context',
        lineNo: grouped[1],
        text: grouped[3] ?? '',
      });
    } else if (line.trim() && !line.startsWith(`${toolName}:`)) {
      addRow({ kind: 'meta', text: line.trim() });
    }
  }
  if (omitted > 0) rows.push({ kind: 'meta', text: `${omitted} more result line(s)` });
  return rows.length > 0 ? rows : undefined;
}

function visualSearchMatches(matches: unknown[], count: number): ToolVisualLine[] | undefined {
  if (count === 0) return [{ kind: 'ok', marker: 'ok ', text: 'no matches' }];
  const rows: ToolVisualLine[] = [];
  for (const match of matches.slice(0, VISUAL_MAX_LINES)) {
    const hit = parseMatchHit(match);
    if (hit) rows.push({ kind: 'match', path: hit.path, lineNo: hit.line, text: hit.text });
  }
  if (rows.length === 0)
    return count > 0
      ? [{ kind: 'meta', text: `${count} result${count === 1 ? '' : 's'}` }]
      : undefined;
  if (count > rows.length)
    rows.push({ kind: 'meta', text: `${count - rows.length} more result(s)` });
  return rows;
}

function parseMatchHit(
  hit: unknown,
): { path?: string | undefined; line?: string | undefined; text: string } | undefined {
  if (typeof hit === 'string') {
    const m = hit.match(/^((?:[A-Za-z]:)?[^:]+):(\d+)[:-](.*)$/);
    return m?.[1] && m[2] ? { path: m[1], line: m[2], text: m[3] ?? '' } : { text: hit };
  }
  if (hit && typeof hit === 'object') {
    const o = hit as Record<string, unknown>;
    const path =
      stringOf(o['file']) ??
      stringOf(o['path']) ??
      stringOf(o['url']) ??
      stringOf(o['filename']) ??
      stringOf(o['Filename']);
    const lineNum =
      numOf(o['line']) ??
      numOf(o['lineNumber']) ??
      numOf(o['line_number']) ??
      numOf(o['LineNumber']);
    const line = lineNum === undefined ? undefined : String(lineNum);
    const title = stringOf(o['title']);
    const snippet =
      stringOf(o['snippet']) ??
      stringOf(o['lineContent']) ??
      stringOf(o['LineContent']) ??
      stringOf(o['line_content']);
    const text =
      stringOf(o['text']) ??
      stringOf(o['match']) ??
      stringOf(o['preview']) ??
      snippet ??
      title ??
      [title, snippet].filter(Boolean).join(' — ');
    return { path, line, text };
  }
  return undefined;
}

function visualPathList(toolName: string, text: string): ToolVisualLine[] | undefined {
  const json = tryParseJson(text);
  const rawList =
    json && typeof json === 'object'
      ? Array.isArray((json as Record<string, unknown>)['files'])
        ? (json as Record<string, unknown>)['files']
        : Array.isArray((json as Record<string, unknown>)['paths'])
          ? (json as Record<string, unknown>)['paths']
          : Array.isArray((json as Record<string, unknown>)['matches'])
            ? (json as Record<string, unknown>)['matches']
            : Array.isArray((json as Record<string, unknown>)['entries'])
              ? (json as Record<string, unknown>)['entries']
              : Array.isArray(json)
                ? json
                : undefined
      : undefined;

  const files = rawList
    ? (rawList as unknown[])
        .map((v) => {
          if (typeof v === 'string') return v;
          if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            return (
              stringOf(o['path']) ??
              stringOf(o['relativePath']) ??
              stringOf(o['name']) ??
              stringOf(o['file'])
            );
          }
          return undefined;
        })
        .filter((v): v is string => typeof v === 'string')
    : bodyLines(text).filter((line) => line.trim() && !line.startsWith(`${toolName}:`));

  if (files.length === 0) return undefined;
  const rows = files.slice(0, VISUAL_MAX_LINES).map(
    (file): ToolVisualLine => ({
      kind: 'path',
      path: file,
      text: '',
    }),
  );
  if (files.length > rows.length)
    rows.push({ kind: 'meta', text: `${files.length - rows.length} more path(s)` });
  return rows;
}

function visualTree(text: string): ToolVisualLine[] | undefined {
  const json = tryParseJson(text);
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const files = numOf(obj['total_files']) ?? numOf(obj['files']);
    const dirs = numOf(obj['total_dirs']) ?? numOf(obj['dirs']);
    if (files !== undefined || dirs !== undefined) {
      const parts = [
        files !== undefined ? `${files} file${files === 1 ? '' : 's'}` : undefined,
        dirs !== undefined ? `${dirs} dir${dirs === 1 ? '' : 's'}` : undefined,
        obj['truncated'] === true ? 'truncated' : undefined,
      ].filter(Boolean);
      return [{ kind: 'meta', text: parts.join(' · ') }];
    }
  }
  const lines = bodyLines(text).filter((line) => line.trim());
  if (lines.length === 0) return undefined;
  const rows = lines.slice(0, VISUAL_MAX_LINES).map(
    (line): ToolVisualLine => ({
      kind: line.includes('──') || line.includes('|--') ? 'path' : 'meta',
      text: line,
    }),
  );
  if (lines.length > rows.length)
    rows.push({ kind: 'meta', text: `${lines.length - rows.length} more tree line(s)` });
  return rows;
}

function visualVerifier(toolName: string, text: string, ok: boolean): ToolVisualLine[] | undefined {
  const json = tryParseJson(text);
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const errors = numOf(obj['errors']) ?? numOf(obj['failed']) ?? 0;
    const warnings = numOf(obj['warnings']) ?? 0;
    const changed = numOf(obj['files_changed']) ?? 0;
    const statusKind: ToolVisualLineKind =
      !ok || errors > 0 ? 'error' : changed > 0 ? 'warn' : 'ok';
    const parts = [
      toolName,
      errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : undefined,
      warnings > 0 ? `${warnings} warning${warnings === 1 ? '' : 's'}` : undefined,
      changed > 0 ? `${changed} changed` : undefined,
      toolName === 'test'
        ? obj['status'] === 'no_tests'
          ? 'no tests'
          : `${numOf(obj['passed']) ?? 0}/${numOf(obj['tests_run']) ?? 0} passed`
        : undefined,
    ].filter(Boolean);
    return [
      {
        kind: statusKind,
        marker: statusKind === 'ok' ? 'ok ' : statusKind === 'warn' ? '! ' : 'x ',
        text: parts.join(' · ') || toolName,
      },
    ];
  }

  const header = parseHeaderLine(text);
  const sections = parseNamedSections(text);
  const report = sections.get('report') ?? '';
  const errorContext = sections.get('error_context');
  const fields = { ...header.fields, ...parseKeyValueLines(report) };
  const status = fields['status'];
  const errorCount =
    numberFromParsedField(fields, 'errors') ?? numberFromParsedField(fields, 'failed') ?? 0;
  const warningCount = numberFromParsedField(fields, 'warnings') ?? 0;
  const changed = numberFromParsedField(fields, 'files_changed') ?? 0;
  const statusKind: ToolVisualLineKind =
    !ok || errorContext || errorCount > 0
      ? 'error'
      : status === 'changed' || changed > 0
        ? 'warn'
        : 'ok';
  const rows: ToolVisualLine[] = [
    {
      kind: statusKind,
      marker: statusKind === 'ok' ? 'ok ' : statusKind === 'warn' ? '! ' : 'x ',
      text: [
        toolName,
        status ? `status=${status}` : undefined,
        errorCount > 0 ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : undefined,
        warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : undefined,
        changed > 0 ? `${changed} changed` : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
  appendOutputPreview(rows, errorContext, 'stderr');
  return rows.slice(0, VISUAL_MAX_LINES);
}
