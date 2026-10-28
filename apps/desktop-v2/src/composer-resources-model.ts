export interface ComposerFileReference {
  path: string;
}
export interface PromptVariable {
  name: string;
  description?: string;
  default?: string;
  required?: boolean;
  multiline?: boolean;
  enum?: string[];
}
const referenceReadContract =
  'Read each referenced file from this project root with the available file-reading tools before answering or editing it. Continue paginated reads until EOF; filenames alone are not file contents.';

/** Append only; choosing a resource must never silently replace an unsent draft. */
export function appendToDraft(draft: string, insertion: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n\n${insertion}` : insertion;
}
export function renderPromptTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) && values[name] ? values[name]! : whole,
  );
}
export function referenceMessage(
  text: string,
  refs: readonly ComposerFileReference[],
  projectRoot: string,
): string {
  if (!refs.length) return text.trim();
  const paths = [...new Set(refs.map((ref) => ref.path))];
  const root = projectRoot
    .replace(/^\\\\\?\\/, '')
    .replaceAll('\\', '/')
    .replace(/\/$/, '');
  return [
    text.trim(),
    '[Project file references]',
    `Project root: ${JSON.stringify(root)}`,
    ...paths.map((path) => `- ${JSON.stringify(path)}`),
    referenceReadContract,
  ]
    .filter(Boolean)
    .join('\n\n');
}
export function splitReferenceMessage(value: string): { text: string; paths: string[] } {
  const marker = '[Project file references]';
  const start = value.lastIndexOf(marker);
  if (start < 0 || !value.endsWith(referenceReadContract)) return { text: value, paths: [] };
  try {
    const lines = value
      .slice(start + marker.length)
      .split('\n')
      .filter((line) => line.startsWith('- '));
    const paths = lines.map((line) => JSON.parse(line.slice(2)) as unknown);
    if (!paths.length || paths.some((path) => typeof path !== 'string'))
      return { text: value, paths: [] };
    return { text: value.slice(0, start).trimEnd(), paths: paths as string[] };
  } catch {
    return { text: value, paths: [] };
  }
}
export function fileMention(
  text: string,
  cursor: number,
): { start: number; end: number; query: string } | null {
  const prefix = text.slice(0, cursor);
  const match = /(?:^|[\s(])@([^\s@]*)$/.exec(prefix);
  if (!match) return null;
  const start = prefix.lastIndexOf('@');
  const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
  if (
    (prefix.match(/^\s*(?:```|~~~)/gm)?.length ?? 0) % 2 ||
    (line.match(/(?<!\\)`/g)?.length ?? 0) % 2
  )
    return null;
  return { start, end: cursor, query: match[1] ?? '' };
}
export const desktopCommands = [
  { name: '/help', description: 'Show desktop commands', action: 'help' },
  {
    name: '/prompt',
    aliases: ['/prompts'],
    description: 'Browse project and user prompt templates',
    action: 'library',
  },
  { name: '/history', description: 'Read this project’s prompt journal', action: 'journal' },
  {
    name: '/sessions',
    aliases: ['/session-history'],
    description: 'Browse this project’s recorded conversations',
    action: 'history',
  },
  {
    name: '/context',
    aliases: ['/debug'],
    description: 'Inspect this session’s context and instructions',
    action: 'context',
  },
  { name: '/compact', description: 'Compact this session’s context', action: 'compact' },
  {
    name: '/compact!',
    description: 'Aggressively compact this session’s context',
    action: 'compact-aggressive',
  },
  {
    name: '/repair',
    description: 'Repair orphan tool/result blocks in this session',
    action: 'repair',
  },
  {
    name: '/clear',
    description: 'Clear provider context; retain the on-disk conversation',
    action: 'clear',
  },
  {
    name: '/queue',
    description: 'Inspect pending prompts, or queue the text after this command',
    action: 'queue',
  },
  {
    name: '/btw',
    description: 'Send the following text using Message / BTW delivery',
    action: 'btw',
  },
  { name: '/steer', description: 'Stop and steer with the following instruction', action: 'steer' },
  {
    name: '/stop',
    aliases: ['/abort', '/interrupt', '/int'],
    description: 'Stop the active turn',
    action: 'stop',
  },
  { name: '/files', description: 'Open this project’s file manager', action: 'files' },
  {
    name: '/diff',
    aliases: ['/review'],
    description: 'Open this project’s changes and review',
    action: 'changes',
  },
  {
    name: '/skills',
    aliases: ['/skill'],
    description: 'Open this project’s skill library',
    action: 'skills',
  },
  { name: '/memory', description: 'Open project SAGE memory', action: 'memory' },
  { name: '/kanban', description: 'Open the project task board', action: 'kanban' },
  { name: '/mailbox', description: 'Open project correspondence and receipts', action: 'mailbox' },
  { name: '/atlas', description: 'Open project Code Atlas', action: 'atlas' },
  {
    name: '/settings',
    aliases: ['/model', '/auth', '/setup'],
    description: 'Open WrongStack provider and profile settings',
    action: 'settings',
  },
  { name: '/enhance', description: 'Toggle prompt refinement before sending', action: 'enhance' },
] as const;
export type DesktopCommandAction = (typeof desktopCommands)[number]['action'];
export function parseDesktopCommand(
  text: string,
): { action: DesktopCommandAction | 'unknown'; argument: string } | null {
  const match = /^\/([a-z][\w!-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null; // //literal and absolute paths remain ordinary draft text.
  const name = `/${match[1]!.toLowerCase()}`;
  const found = desktopCommands.find(
    (command) =>
      command.name === name ||
      ('aliases' in command && (command.aliases as readonly string[]).includes(name)),
  );
  return { action: found?.action ?? 'unknown', argument: match[2]?.trim() ?? '' };
}
