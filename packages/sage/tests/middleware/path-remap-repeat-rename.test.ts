import { describe, expect, it } from 'vitest';
const SURFACE_CAPABILITY_ID = 'wrongstack.memory.surface.v1';
import { createSagePathRemapMiddleware } from '../../src/middleware/path-remap.js';

type Row = { id: string; text: string; status: string; anchors: { type: string; path: string }[] };

function harness(initialPath: string) {
  const rows: Row[] = [
    { id: 'm1', text: 'note', status: 'active', anchors: [{ type: 'file', path: initialPath }] },
  ];
  const surface = {
    listSage: async () => rows.map((r) => ({ ...r, anchors: [...r.anchors] })),
    updateSage: async (id: string, patch: Partial<Row>) => {
      const row = rows.find((r) => r.id === id);
      if (row && patch.anchors) row.anchors = patch.anchors;
      return row;
    },
  };
  const memory = {
    getCapability: (c: { id: string }) => (c.id === SURFACE_CAPABILITY_ID ? surface : undefined),
  } as never;
  const mw = createSagePathRemapMiddleware({ memory, maxPerHour: 50 });
  const run = (command: string) =>
    mw.handler(
      {
        toolUse: { id: 't', name: 'bash', input: { command } },
        result: { content: '', is_error: false },
        ctx: { projectRoot: '/proj', cwd: '/proj' },
      } as never,
      async (p) => p,
    );
  return { rows, run };
}

describe('sage path-remap middleware repeated renames', () => {
  it('control: a single rename remaps the anchor', async () => {
    const h = harness('src/ctrl-a.ts');
    await h.run('git mv src/ctrl-a.ts src/ctrl-b.ts');
    expect(h.rows[0]?.anchors[0]?.path).toBe('src/ctrl-b.ts');
  });

  it('follows a file moved away, back, and away again within the hour', async () => {
    const h = harness('src/rt-a.ts');
    await h.run('git mv src/rt-a.ts src/rt-b.ts');
    expect(h.rows[0]?.anchors[0]?.path).toBe('src/rt-b.ts');
    await h.run('git mv src/rt-b.ts src/rt-a.ts');
    expect(h.rows[0]?.anchors[0]?.path).toBe('src/rt-a.ts');
    await h.run('git mv src/rt-a.ts src/rt-b.ts');
    expect(h.rows[0]?.anchors[0]?.path).toBe('src/rt-b.ts');
  });
});
