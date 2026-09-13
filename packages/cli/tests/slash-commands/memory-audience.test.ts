import { describe, expect, it, vi } from 'vitest';
import { runAudienceMemory } from '../../src/slash-commands/memory-audience.js';

interface MemoryStub {
  id: string;
  kind: string;
  status: string;
  text: string;
  tags: string[];
  audience?: { roles?: string[]; taskTypes?: string[]; modes?: string[] };
  importance?: number;
  confidence?: number;
}

function mem(id: string, overrides: Partial<MemoryStub> = {}): MemoryStub {
  return { id, kind: 'fact', status: 'active', text: `text ${id}`, tags: [], ...overrides };
}

function storeStub(memories: MemoryStub[] = []) {
  return {
    listSage: vi.fn(async () => memories),
    retrieveForAudience: vi.fn(async () => memories.filter((m) => m.audience)),
    rememberSage: vi.fn(async (input: { text: string; audience?: MemoryStub['audience'] }) => ({
      id: 'new-1',
      kind: 'fact',
      status: 'active',
      tags: [],
      ...input,
    })),
    updateSage: vi.fn(async () => undefined),
  };
}

async function run(store: ReturnType<typeof storeStub>, args: string): Promise<string> {
  const tokens = args.trim() ? args.trim().split(/\s+/) : [];
  return (await runAudienceMemory(store as never, tokens)).message;
}

const SCOPED = [
  mem('m1', { audience: { roles: ['Reviewer'], modes: ['plan'] }, tags: ['style'] }),
  mem('m2', { audience: { roles: ['builder', 'reviewer'], taskTypes: ['bugfix'] } }),
  mem('m3'),
];

describe('runAudienceMemory — list', () => {
  it('defaults to listing every audience-scoped memory', async () => {
    const store = storeStub(SCOPED);
    const out = await run(store, '');
    expect(store.listSage).toHaveBeenCalledWith(['active', 'stale']);
    expect(out).toContain('## Audience-Scoped Memory');
    expect(out).toContain('`m1` [fact|active] text m1 (roles: Reviewer · modes: plan)');
    expect(out).toContain('(roles: builder, reviewer · taskTypes: bugfix)');
    expect(out).not.toContain('`m3`');
  });

  it('explains how to add one when nothing is scoped', async () => {
    expect(await run(storeStub([mem('plain')]), 'ls')).toContain('No audience-scoped memories.');
  });

  it('queries the store with the first selector of each kind', async () => {
    const store = storeStub(SCOPED);
    await run(store, 'show --role a,b --task-type t --mode m');
    expect(store.retrieveForAudience).toHaveBeenCalledWith(
      { role: 'a', taskType: 't', mode: 'm' },
      50,
    );
  });

  it('reports no selector matches', async () => {
    const store = storeStub([mem('plain')]);
    expect(await run(store, 'list --role nobody')).toBe(
      'No audience-scoped memories match the given selectors.',
    );
  });

  it.each([
    ['list --role', '--role needs a value.'],
    ['list --role --mode x', '--role needs a value.'],
    ['list --colour red', 'Unknown audience flag "--colour".'],
  ])('rejects bad flags: %s', async (args, error) => {
    expect(await run(storeStub(SCOPED), args)).toContain(error);
  });
});

describe('runAudienceMemory — remember', () => {
  it('requires at least one selector and some text', async () => {
    const store = storeStub();
    expect(await run(store, 'remember just text')).toContain('At least one of --role');
    expect(await run(store, 'add --role reviewer')).toBe(
      'Nothing to remember — provide the memory text after the flags.',
    );
    expect(store.rememberSage).not.toHaveBeenCalled();
  });

  it('collects text around flags and merges repeated selectors', async () => {
    const store = storeStub();
    const out = await run(
      store,
      'remember prefer --ROLE reviewer small --roles builder,  --mode plan diffs',
    );
    expect(store.rememberSage).toHaveBeenCalledWith({
      text: 'prefer small diffs',
      audience: { roles: ['reviewer', 'builder'], modes: ['plan'] },
    });
    expect(out).toBe(
      'Remembered `new-1` for roles: reviewer, builder · modes: plan: prefer small diffs',
    );
  });

  it('reports store failures', async () => {
    const store = storeStub();
    store.rememberSage.mockRejectedValueOnce(new Error('db locked'));
    expect(await run(store, 'remember --task-types bugfix x')).toBe(
      'Could not remember: db locked',
    );
  });
});

describe('runAudienceMemory — clear', () => {
  it('clears the audience or reports usage and failures', async () => {
    const store = storeStub();
    expect(await run(store, 'clear')).toBe('Usage: /memory audience clear <memory-id>');
    expect(await run(store, 'clear m1')).toContain('Cleared audience scope from `m1`');
    expect(store.updateSage).toHaveBeenCalledWith('m1', { audience: {} });
    store.updateSage.mockRejectedValueOnce(new Error('no such memory'));
    expect(await run(store, 'clear m9')).toBe('Could not clear audience: no such memory');
  });
});

describe('runAudienceMemory — search', () => {
  it('matches text, roles, task types, modes and tags case-insensitively', async () => {
    const store = storeStub(SCOPED);
    expect(await run(store, 'search REVIEWER')).toContain('`m2`');
    expect(await run(store, 'find bugfix')).toContain('`m2`');
    expect(await run(store, 'search style')).toContain('`m1`');
    expect(await run(store, 'search plan')).not.toContain('`m2`');
  });

  it('never matches unscoped memories and reports misses', async () => {
    const store = storeStub(SCOPED);
    expect(await run(store, 'search text m3')).toBe('No audience-scoped memories match "text m3".');
    expect(await run(store, 'search')).toBe('Usage: /memory audience search <query>');
  });
});

describe('runAudienceMemory — transfer', () => {
  it('rewrites the role, dedupes and preserves other selectors', async () => {
    const store = storeStub(SCOPED);
    const out = await run(store, 'transfer reviewer builder');
    expect(out).toBe('Transferred 2 memories from role "reviewer" to "builder".');
    expect(store.updateSage).toHaveBeenCalledWith('m1', {
      audience: { roles: ['builder'], modes: ['plan'] },
    });
    expect(store.updateSage).toHaveBeenCalledWith('m2', {
      audience: { roles: ['builder'], taskTypes: ['bugfix'] },
    });
  });

  it('counts per-memory failures and reports total failure', async () => {
    const store = storeStub(SCOPED);
    store.updateSage.mockRejectedValue(new Error('boom'));
    expect(await run(store, 'reassign reviewer x')).toBe(
      'Failed to transfer any memories from "reviewer" to "x".',
    );

    const partial = storeStub(SCOPED);
    partial.updateSage.mockRejectedValueOnce(new Error('boom'));
    expect(await run(partial, 'transfer reviewer x')).toBe(
      'Transferred 1 memory from role "reviewer" to "x".',
    );
  });

  it('reports usage and unknown roles', async () => {
    const store = storeStub(SCOPED);
    expect(await run(store, 'transfer reviewer')).toContain('Usage:');
    expect(await run(store, 'transfer ghost x')).toBe(
      'No audience-scoped memories found for role "ghost".',
    );
  });
});

describe('runAudienceMemory — export', () => {
  it('exports every scoped memory as fenced JSON', async () => {
    const out = await run(storeStub(SCOPED), 'export');
    expect(out.startsWith('```json\n')).toBe(true);
    const data = JSON.parse(out.slice('```json\n'.length, -'\n```'.length));
    expect(data.map((d: { id: string }) => d.id)).toEqual(['m1', 'm2']);
  });

  it('filters by every selector with AND semantics', async () => {
    const store = storeStub(SCOPED);
    const both = await run(store, 'dump --role REVIEWER --task-type bugfix');
    expect(both).toContain('"m2"');
    expect(both).not.toContain('"m1"');
    expect(await run(store, 'export --role reviewer --mode nope')).toBe(
      'No audience-scoped memories to export.',
    );
    expect(await run(store, 'export --mode')).toContain('--mode needs a value.');
  });
});

describe('runAudienceMemory — import', () => {
  it('round-trips an export, including the markdown fence', async () => {
    const exported = await run(storeStub(SCOPED), 'export');
    const store = storeStub();
    const out = (await runAudienceMemory(store as never, ['import', exported])).message;
    expect(out).toBe('Imported 2 memories.');
    expect(store.rememberSage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'text m1', kind: 'fact', audience: SCOPED[0]!.audience }),
    );
  });

  it('skips non-object and textless entries instead of throwing', async () => {
    const store = storeStub();
    const json = JSON.stringify([
      null,
      1,
      'str',
      {},
      { text: '  ' },
      { text: 'keep', tags: ['a'] },
    ]);
    const out = (await runAudienceMemory(store as never, ['import', json])).message;
    expect(out).toBe('Imported 1 memory, skipped 5.');
    expect(store.rememberSage).toHaveBeenCalledTimes(1);
    expect(store.rememberSage).toHaveBeenCalledWith({ text: 'keep', tags: ['a'] });
  });

  it('drops wrongly-typed optional fields', async () => {
    const store = storeStub();
    const json = JSON.stringify([
      { text: 't', kind: 5, tags: 'x', audience: 'r', importance: '1', confidence: 0.4 },
    ]);
    await runAudienceMemory(store as never, ['import', json]);
    expect(store.rememberSage).toHaveBeenCalledWith({ text: 't', confidence: 0.4 });
  });

  it('counts store failures as skipped', async () => {
    const store = storeStub();
    store.rememberSage.mockRejectedValue(new Error('full'));
    const json = JSON.stringify([{ text: 'a' }]);
    expect((await runAudienceMemory(store as never, ['load', json])).message).toBe(
      'No memories imported — all entries were invalid.',
    );
  });

  it.each([
    ['', 'Usage: /memory audience import'],
    ['{not json', 'Invalid JSON.'],
    ['[]', 'No entries found in the JSON.'],
    ['{"text":"a"}', 'No entries found in the JSON.'],
  ])('rejects import payload %j', async (payload, expected) => {
    const tokens = payload ? ['import', payload] : ['import'];
    expect((await runAudienceMemory(storeStub() as never, tokens)).message).toContain(expected);
  });
});

it('prints help for unknown audience subcommands', async () => {
  expect(await run(storeStub(), 'wat')).toContain('## /memory audience');
});
