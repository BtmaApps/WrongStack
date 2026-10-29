import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { installDesignTurnGate } from '../../src/execution/design-turn-gate.js';

type Handler = (payload: unknown, next: (p: unknown) => Promise<unknown>) => Promise<unknown>;
type Extension = {
  beforeRun(ctx: unknown): void;
  beforeTurnEnd(ctx: unknown): Promise<string | undefined>;
};

async function steerAfter(name: string, input: Record<string, unknown>, tool?: unknown) {
  let middleware: { handler: Handler } | undefined;
  let extension: Extension | undefined;
  installDesignTurnGate({
    pipelines: { toolCall: { use: (mw) => (middleware = mw as never) } },
    extensions: { register: (ext) => (extension = ext as never) },
    hasTool: () => true,
  });
  const ctx = { meta: {}, projectRoot: os.tmpdir() };
  extension?.beforeRun(ctx);
  await middleware?.handler(
    {
      toolUse: { type: 'tool_use', id: 't', name, input },
      result: { type: 'tool_result', tool_use_id: 't', content: 'ok' },
      ctx,
      tool,
    },
    async (payload) => payload,
  );
  return extension?.beforeTurnEnd(ctx);
}

// The gate read only `input.path`: `replace` (files) and `patch` (targets in
// the diff, declared through Tool.writeTargets) never counted as UI writes (F908).
describe('design turn gate write targets (F908)', () => {
  it('records a page changed by replace', async () => {
    expect(
      await steerAfter('replace', { files: ['public/index.html'], pattern: 'a', replacement: 'b' }),
    ).toContain('[design-gate]');
  });

  it('records a page changed by patch through its declared write targets', async () => {
    const patchTool = { name: 'patch', writeTargets: () => ['public/index.html'] };
    expect(
      await steerAfter(
        'patch',
        { patch: '--- a/public/index.html\n+++ b/public/index.html\n' },
        patchTool,
      ),
    ).toContain('[design-gate]');
  });
});
