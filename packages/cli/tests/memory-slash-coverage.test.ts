import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @wrongstack/sage — controls getSageSurface return per-test
const mockGetSageSurface = vi.hoisted(() => vi.fn((): any => null));
vi.mock('@wrongstack/sage', () => ({ getSageSurface: mockGetSageSurface }));

// Mock memory-formatters
vi.mock('../src/slash-commands/memory-formatters.js', () => {
  const requiresSageMock = vi.fn().mockReturnValue({ message: 'This command requires SAGE.' });
  return {
    formatSageShow: vi.fn(() => 'SAGE SHOW'),
    formatSageStats: vi.fn(() => 'SAGE STATS'),
    formatSageMemories: vi.fn(() => 'SAGE MEMORIES'),
    formatGraph: vi.fn(() => 'GRAPH'),
    formatAudit: vi.fn(() => 'AUDIT'),
    formatCandidates: vi.fn(() => 'CANDIDATES'),
    formatHygiene: vi.fn(() => 'HYGIENE'),
    formatVerification: vi.fn(() => 'VERIFICATION'),
    formatLegacyEntries: vi.fn(() => 'LEGACY'),
    formatLegacyImport: vi.fn(() => 'LEGACY IMPORT'),
    formatForFileResponse: vi.fn(() => 'FOR FILE'),
    formatSearchRace: vi.fn(() => 'RACE'),
    formatMemoryDiagnostics: vi.fn(() => 'DIAGNOSTICS'),
    requiresSage: requiresSageMock,
  };
});

// Mock memory-compact
vi.mock('../src/slash-commands/memory-compact.js', () => ({
  runCompact: vi.fn(async () => ({ message: 'Compacted.' })),
}));

import type { SlashCommandContext } from '../src/slash-commands/command-context.js';
import { buildMemoryCommand } from '../src/slash-commands/memory.js';
import { runCompact } from '../src/slash-commands/memory-compact.js';
import { formatSageStats } from '../src/slash-commands/memory-formatters.js';

/** Narrow the slash-command execute/run union (which includes `void`) to its message. */
function runMessage(result: unknown): string | undefined {
  return (result as { message?: string } | undefined)?.message;
}

function makeCtx(): SlashCommandContext {
  return {
    memoryStore: {
      readAll: vi.fn(async () => ''),
      remember: vi.fn(async () => undefined),
      forget: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(function (this: any) {
        return this;
      }),
    },
    broadcast: vi.fn(),
    send: vi.fn(),
  } as any;
}

function makeSageStub(extra: Record<string, unknown> = {}) {
  return {
    stats: vi.fn(async () => ({ total: 1, byStatus: { active: 1 }, byKind: {}, edges: 0 })),
    listSage: vi.fn(async () => [
      { id: 'm1', kind: 'fact', status: 'active', text: 'hello', tags: [] },
    ]),
    getSage: vi.fn(async () => ({
      id: 'm1',
      kind: 'fact',
      status: 'active',
      text: 'hello',
      tags: [],
    })),
    rememberSage: vi.fn(async () => ({
      id: 'mem-new',
      kind: 'fact',
      status: 'active',
      text: 'new',
      tags: ['t'],
    })),
    updateSage: vi.fn(async () => ({
      id: 'm1',
      kind: 'fact',
      status: 'active',
      text: 'updated',
      tags: [],
    })),
    deleteSage: vi.fn(async () => undefined),
    listSagePage: vi.fn(async () => ({ memories: [], nextCursor: null, total: 0 })),
    graphFor: vi.fn(async () => []),
    findMemoriesForFile: vi.fn(async () => ({ primary: [], symbol: [], related: [] })),
    acceptCandidate: vi.fn(async () => null),
    rejectCandidate: vi.fn(async () => null),
    searchSage: vi.fn(async () => []),
    ...extra,
  };
}

describe('memory slash command', () => {
  beforeEach(() => {
    // Do NOT use vi.clearAllMocks() — it also clears mockReturnValue/mockImplementation
    // set in the mock factory, causing requiresSage to return undefined.
    mockGetSageSurface.mockClear();
    mockGetSageSurface.mockReturnValue(null);
  });

  it('returns error when memoryStore is undefined', async () => {
    const cmd = buildMemoryCommand({ memoryStore: undefined } as any);
    const result = await cmd.run('');
    expect(runMessage(result)).toContain('No memory store');
  });

  describe('show / list', () => {
    it('shows SAGE stats when SAGE is available', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('');
      // `toContain('SAGE')` also matched the 'SAGE STATS' sentinel; pin the
      // show formatter's sentinel so a mis-route to `stats` fails.
      expect(runMessage(result)).toBe('SAGE SHOW');
    });

    it('shows empty message when SAGE is empty', async () => {
      mockGetSageSurface.mockReturnValue({
        stats: vi.fn(async () => ({ total: 0, byStatus: {}, byKind: {}, edges: 0 })),
        listSage: vi.fn(async () => []),
      });
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('');
      expect(runMessage(result)).toContain('empty');
    });

    it('falls back to legacy readAll when no SAGE', async () => {
      const ctx = makeCtx();
      (ctx.memoryStore!.readAll as any).mockResolvedValue('legacy text');
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('');
      expect(runMessage(result)).toBe('legacy text');
    });

    it('shows empty message for legacy empty store', async () => {
      const ctx = makeCtx();
      (ctx.memoryStore!.readAll as any).mockResolvedValue('  ');
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('');
      expect(runMessage(result)).toContain('empty');
    });
  });

  describe('remember / add', () => {
    it('returns usage when no text provided', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('remember');
      expect(runMessage(result)).toContain('Usage');
    });

    it('stores in legacy store when no SAGE', async () => {
      const ctx = makeCtx();
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('remember hello world');
      expect(ctx.memoryStore!.remember).toHaveBeenCalledWith('hello world');
      expect(runMessage(result)).toContain('Remembered');
    });

    it('stores via SAGE rememberSage when SAGE is available', async () => {
      const sage = makeSageStub();
      mockGetSageSurface.mockReturnValue(sage);
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('remember new fact');
      expect(sage.rememberSage).toHaveBeenCalled();
      expect(runMessage(result)).toContain('mem-new');
    });

    it('handles SAGE rememberSage errors', async () => {
      mockGetSageSurface.mockReturnValue({
        ...makeSageStub(),
        rememberSage: vi.fn(async () => {
          throw new Error('SAGE down');
        }),
      });
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('remember test');
      expect(runMessage(result)).toContain('Could not remember');
    });
  });

  describe('update / edit', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('update id1');
      expect(runMessage(result)).toContain('SAGE');
    });

    it('returns usage when no id', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('update');
      expect(runMessage(result)).toContain('Usage');
    });
  });

  describe('delete / forget', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('delete id1');
      expect(runMessage(result)).toContain('SAGE');
    });

    it('returns usage when no id', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('delete');
      expect(runMessage(result)).toContain('Usage');
    });
  });

  describe('stats', () => {
    it('returns legacy stats when no SAGE (falls back to store.list)', async () => {
      const ctx = makeCtx();
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('stats');
      // The stub store lists nothing, so the fallback reports an empty store —
      // a message only the non-SAGE `runStats` path produces.
      expect(runMessage(result)).toContain('Memory is empty');
      expect(ctx.memoryStore!.list).toHaveBeenCalledWith('project-memory');
    });

    it('returns formatted stats when SAGE available', async () => {
      const stub = makeSageStub();
      mockGetSageSurface.mockReturnValue(stub);
      // Mocks are not cleared between tests in this file (see beforeEach), so
      // drop earlier calls — the assertion below must see THIS run's call.
      vi.mocked(formatSageStats).mockClear();
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('stats');
      // This suite mocks the formatters to sentinel strings on purpose — it tests
      // COMMAND ROUTING, not formatting (formatting is covered against the real
      // formatter in memory-formatters.test.ts). `toBeTruthy()` could not tell
      // routes apart: the non-SAGE `runStats` fallback also returns a truthy
      // message. Pin that the SAGE branch ran and received the surface's stats.
      expect(runMessage(result)).toBe('SAGE STATS');
      expect(formatSageStats).toHaveBeenCalledWith(
        await stub.stats(),
        expect.any(Number),
        expect.any(String),
      );
    });
  });

  describe('search', () => {
    it('returns legacy search when no SAGE (falls back to store.search)', async () => {
      const ctx = makeCtx();
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('search query');
      expect(runMessage(result)).toBe('LEGACY');
      expect(ctx.memoryStore!.search).toHaveBeenCalledWith('query', 'project-memory', 20);
    });

    it('returns usage when no query', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('search');
      expect(runMessage(result)).toContain('Usage');
    });
  });

  describe('race', () => {
    it('returns usage when no query', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('race');
      expect(runMessage(result)).toContain('Usage');
    });

    it('falls back to lexical-only when no vector store is wired', async () => {
      mockGetSageSurface.mockReturnValue(makeSageStub());
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('race connection pool');
      expect(runMessage(result)).toContain('lexical channel');
    });

    it('runs the dual-channel race when both stores are wired', async () => {
      mockGetSageSurface.mockReturnValue(
        makeSageStub({
          searchSage: vi.fn(async () => [
            { id: 'a', kind: 'fact', status: 'active', text: 'overlap hit', tags: [] },
          ]),
        }),
      );
      const vectorStore = {
        search: vi.fn(async () => [
          {
            entry: { id: 'vec-1', text: 'vector hit', metadata: { sageId: 'a' } },
            score: 0.91,
          },
        ]),
      };
      const ctx = makeCtx();
      (ctx as { vectorMemoryStore?: unknown }).vectorMemoryStore = vectorStore;
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('race pool');
      expect(runMessage(result)).toBe('RACE'); // mocked formatter
      expect(vectorStore.search).toHaveBeenCalledWith('pool', { limit: 20 });
    });

    it('keeps the race usable when the vector store throws (fail-open)', async () => {
      mockGetSageSurface.mockReturnValue(
        makeSageStub({
          searchSage: vi.fn(async () => [
            { id: 'a', kind: 'fact', status: 'active', text: 'still works', tags: [] },
          ]),
        }),
      );
      const vectorStore = {
        search: vi.fn(async () => {
          throw new Error('provider unavailable');
        }),
      };
      const ctx = makeCtx();
      (ctx as { vectorMemoryStore?: unknown }).vectorMemoryStore = vectorStore;
      const cmd = buildMemoryCommand(ctx);
      // The race swallows vector-side failures (lexical side stays
      // usable) — the operator gets the channel-comparison output
      // even when the embedding model is offline.
      const result = await cmd.run('race pool');
      expect(runMessage(result)).toBe('RACE');
    });
  });

  describe('clear', () => {
    // Was titled "calls store.forget on legacy store" and asserted toBeTruthy();
    // measured, a bare `clear` is refused. The wipe goes through `store.clear()`,
    // so that is what must stay untouched. Forced clears (with and without
    // confirmation) are covered in slash-diag-memory-todos.test.ts.
    it('blocks a bare clear and deletes nothing', async () => {
      const ctx = makeCtx();
      const clear = vi.fn(async () => undefined);
      (ctx.memoryStore as unknown as { clear: typeof clear }).clear = clear;
      const cmd = buildMemoryCommand(ctx);
      const result = await cmd.run('clear');
      const message = runMessage(result) ?? '';
      expect(message).toContain('Bulk memory clear is blocked by default');
      expect(message).toContain('/memory clear --force');
      expect(clear).not.toHaveBeenCalled();
      expect(ctx.memoryStore!.forget).not.toHaveBeenCalled();
    });
  });

  describe('compact', () => {
    it('runs compact', async () => {
      vi.mocked(runCompact).mockClear();
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('compact');
      expect(runMessage(result)).toBe('Compacted.');
      expect(runCompact).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown subcommand', () => {
    it('returns help for unknown subcommand', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('totally-unknown');
      const message = runMessage(result) ?? '';
      expect(message).toContain('Unknown subcommand "totally-unknown" for /memory.');
      expect(message).toMatch(/Valid: show, search, /);
    });
  });

  describe('graph', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('graph query');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('for-file', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('for-file x.ts');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('hygiene', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('hygiene');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('verify', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('verify');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('candidates', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('candidates');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('audit', () => {
    it('returns requiresSage when no SAGE', async () => {
      const cmd = buildMemoryCommand(makeCtx());
      const result = await cmd.run('audit');
      expect(runMessage(result)).toContain('SAGE');
    });
  });

  describe('unknown-subcommand Valid list', () => {
    it('names every implemented subcommand, including compact-log and diagnostics', async () => {
      // Regression (round3-memory-valid-list): `compact-log` (case L545) and
      // `diagnostics` (case L614) were implemented and documented in the
      // command description but missing from the unknownSubcommand Valid
      // list — the same omission class the gather fix (memory
      // 01KYQ59WBHNG8Z4T9N8507DPS7) established as a convention violation.
      const cmd = buildMemoryCommand(makeCtx());
      const message = runMessage(await cmd.run('definitely-not-a-memory-command')) ?? '';
      expect(message).toContain('Unknown subcommand "definitely-not-a-memory-command" for /memory');
      expect(message).toContain('compact-log');
      expect(message).toContain('diagnostics');
      expect(message).toContain('gather');
    });
  });
});
