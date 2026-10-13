import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mailbox: vi.fn(async (_argv: string[]) => 0),
  kanban: vi.fn(async (_argv: string[]) => 0),
  index: vi.fn(async (_argv: string[]) => 0),
  intake: vi.fn(async (_argv: string[]) => 0),
  sage: vi.fn(async (_opts: unknown) => undefined),
}));
vi.mock('@wrongstack/mailbox-mcp', () => ({ runMailboxMcpServer: hoisted.mailbox }));
vi.mock('@wrongstack/kanban-mcp', () => ({ runKanbanMcpServer: hoisted.kanban }));
vi.mock('@wrongstack/codebase-index-mcp', () => ({ runCodebaseIndexMcpServer: hoisted.index }));
vi.mock('@wrongstack/requirement-intake-mcp', () => ({
  runRequirementIntakeMcpServer: hoisted.intake,
}));
vi.mock('@wrongstack/sage-mcp', () => ({ serveAttachedSageMcpStdio: hoisted.sage }));

import { parseArgs } from '../src/arg-parser.js';
import { isProjectMcpServer, serveProjectMcp } from '../src/mcp-serve-project.js';
import { mcpCmd } from '../src/subcommands/handlers/mcp.js';

function deps(flags: Record<string, string | boolean> = {}) {
  return {
    projectRoot: '/proj/here',
    config: { Sage: { storage: { directory: '/sage-dir' } } },
    flags,
    renderer: { write: vi.fn(), writeError: vi.fn(), writeInfo: vi.fn(), writeWarning: vi.fn() },
  } as never;
}

/** Run `wstack <argv…>` through the real top-level parser, as the dispatcher does. */
async function runWstack(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  return mcpCmd(parsed.positional.slice(1), deps(parsed.flags));
}

beforeEach(() => {
  for (const fn of Object.values(hoisted)) fn.mockClear();
});

describe('wstack mcp serve <project server>', () => {
  it('knows exactly the project servers', () => {
    for (const s of ['mailbox', 'kanban', 'codebase-index', 'requirement-intake', 'sage']) {
      expect(isProjectMcpServer(s)).toBe(true);
    }
    expect(isProjectMcpServer('read,grep')).toBe(false);
    expect(isProjectMcpServer(undefined)).toBe(false);
  });

  it('binds to the current project when no --project-root is given', async () => {
    expect(await serveProjectMcp('kanban', [], deps())).toBe(0);
    expect(hoisted.kanban).toHaveBeenCalledWith(['--project-root', '/proj/here']);
  });

  it('restores the flags the global parser stripped, switches last and bare', async () => {
    const code = await runWstack([
      'mcp',
      'serve',
      'mailbox',
      '--project-root=/elsewhere',
      '--actor=claude-code',
      '--session-id=s1',
      '--writable',
    ]);
    expect(code).toBe(0);
    const argv = hoisted.mailbox.mock.calls[0]![0];
    expect(argv).toEqual([
      '--project-root',
      '/elsewhere',
      '--actor',
      'claude-code',
      '--session-id',
      's1',
      '--writable',
    ]);
  });

  it('reads a valued-parsed switch back as a bare switch', async () => {
    // `--writable` before another word: the global parser takes the word as its value.
    await serveProjectMcp('kanban', ['--writable', 'true', '--destructive=false'], deps());
    expect(hoisted.kanban.mock.calls[0]![0]).toEqual([
      '--writable',
      '--project-root',
      '/proj/here',
    ]);
  });

  it('runs codebase-index bound to the current project', async () => {
    await runWstack(['mcp', 'serve', 'codebase-index']);
    expect(hoisted.index).toHaveBeenCalledWith(['--project-root', '/proj/here']);
  });

  it('runs requirement-intake with a relative root as the presets pass it', async () => {
    await runWstack(['mcp', 'serve', 'requirement-intake', '--project-root', '.', '--writable']);
    expect(hoisted.intake).toHaveBeenCalledWith(['--project-root', '.', '--writable']);
  });

  it('serves SAGE for an explicit project root, origin from --origin', async () => {
    await runWstack(['mcp', 'serve', 'sage', '--project-root=/p2', '--origin=claude-code']);
    expect(hoisted.sage).toHaveBeenCalledWith({
      projectRoot: '/p2',
      directory: '/sage-dir',
      origin: 'claude-code',
    });
  });
});
