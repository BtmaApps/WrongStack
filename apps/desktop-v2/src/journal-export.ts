import { record } from './engine-values';

type JournalRow = Record<string, unknown>;

/** One journal entry per line, exactly as the engine returned it. */
export function journalJsonl(rows: readonly JournalRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

/** A fence that cannot be closed by the text it wraps. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text.replace(/\n+$/, '')}\n${fence}`;
}

/** Readable export; prompt text is fenced so its own Markdown cannot alter the document. */
export function journalMarkdown(
  rows: readonly JournalRow[],
  scope: { title: string; filters: string; exportedAt: string },
): string {
  const parts = [
    `# ${scope.title}`,
    '',
    `Exported ${scope.exportedAt} · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${scope.filters}`,
  ];
  for (const row of rows) {
    const meta = record(row['metadata']);
    const model = [meta['provider'], meta['model']].filter(Boolean).join('/');
    parts.push(
      '',
      `## ${String(row['timestamp'])} · ${row['category'] === 'raw_user' ? 'Original input' : 'Refined prompt'}`,
      '',
      `Session: \`${String(row['sessionId'] ?? '')}\`${model ? ` · Model: \`${model}\`` : ''}`,
    );
    if (typeof row['rawContent'] === 'string')
      parts.push('', '### Original text', '', fenced(row['rawContent']));
    parts.push(
      '',
      row['category'] === 'raw_user' ? '### Submitted text' : '### Refined text',
      '',
      fenced(String(row['content'] ?? '')),
    );
  }
  return `${parts.join('\n')}\n`;
}

/** File name safe on every platform: scope, filters and a timestamp, no separators. */
export function journalFileName(scope: string, exportedAt: string, extension: 'md' | 'jsonl') {
  const stamp = exportedAt.replaceAll(':', '-').replaceAll('.', '-');
  return `wrongstack-prompt-journal-${scope.replace(/[^a-z0-9-]+/gi, '-')}-${stamp}.${extension}`;
}
