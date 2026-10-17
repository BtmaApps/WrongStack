export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: FileNode[];
}

export function parseFileTree(value: unknown): FileNode[] {
  let budget = 20_000;
  const parse = (entries: unknown, depth: number): FileNode[] => {
    if (!Array.isArray(entries) || depth > 12) return [];
    return entries.flatMap((entry) => {
      if (--budget < 0 || !entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      if (
        typeof item.name !== 'string' ||
        typeof item.path !== 'string' ||
        (item.type !== 'file' && item.type !== 'directory')
      )
        return [];
      return [
        {
          name: item.name,
          path: item.path,
          type: item.type,
          children: parse(item.children, depth + 1),
        },
      ];
    });
  };
  return parse(value, 0);
}

export function matchingFiles(tree: FileNode[], query: string): FileNode[] {
  const result: FileNode[] = [];
  const visit = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'directory') visit(node.children);
      else if (node.path.toLowerCase().includes(query.toLowerCase())) result.push(node);
    }
  };
  visit(tree);
  return result;
}

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export function effortOptions(levels: string[] | undefined, current: string): string[] {
  return [
    ...new Set([
      'auto',
      ...(levels?.length ? levels.filter((v) => EFFORTS.includes(v)) : EFFORTS),
      ...(EFFORTS.includes(current) ? [current] : []),
    ]),
  ];
}

export function transcriptMarkdown(input: {
  project: string;
  provider: string;
  model: string;
  messages: { role: string; text: string; images?: unknown[] }[];
}): string {
  return (
    [
      `# ${input.project || 'WrongStack'} conversation`,
      `Model: ${input.provider}/${input.model}`,
      ...input.messages
        .filter((message) => message.role !== 'thinking')
        .map(
          (message) =>
            `## ${message.role === 'user' ? 'You' : message.role === 'assistant' ? 'WrongStack' : 'Workspace'}\n\n${message.text}${message.images?.length ? `\n\n[${message.images.length} attached image(s)]` : ''}`,
        ),
    ].join('\n\n') + '\n'
  );
}
