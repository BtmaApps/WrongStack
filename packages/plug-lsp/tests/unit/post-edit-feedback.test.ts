import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventBus } from '@wrongstack/core/kernel';
import type { HookInput, Logger } from '@wrongstack/core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { mergeConfig } from '../../src/config.js';
import { DocumentTracker } from '../../src/document-tracker.js';
import { createPostEditFeedback } from '../../src/post-edit-feedback.js';
import { LSPServer } from '../../src/server/lsp-server.js';
import type { ToolDeps } from '../../src/tools/shared.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const error: Diagnostic = {
  range: { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } },
  severity: 1,
  source: 'typescript',
  code: 2322,
  message: 'Type string is not assignable to number',
};

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-feedback-'));
  roots.push(root);
  const file = path.join(root, 'a.ts');
  await fs.writeFile(file, 'const a: number = "x";');
  const log = { debug() {}, warn() {} } as unknown as Logger;
  const server = new LSPServer(
    'typescript',
    { command: 'unused', languages: ['typescript'] },
    {
      cwd: root,
      rootPath: root,
      log,
      events: new EventBus(),
    },
  );
  server.state = 'ready';
  server.capabilities = {
    diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
  };
  const pull = vi.spyOn(server, 'pullDiagnostics').mockResolvedValue([error]);
  const registry = {
    list: () => [server],
    get: () => server,
    findForPath: async () => server,
    languageIdForPath: (target: string) => (target.endsWith('.ts') ? 'typescript' : null),
  };
  const tracker = new DocumentTracker(() => registry, log, root);
  const cfg = mergeConfig({ diagnosticsWaitMs: 15 });
  let current = true;
  const hook = createPostEditFeedback(
    { registry, tracker, cfg, log } as unknown as ToolDeps,
    () => () => current,
  );
  const input: HookInput = {
    event: 'PostToolUse',
    toolName: 'edit',
    toolInput: { path: file },
    toolResult: { content: 'edited', isError: false },
    cwd: root,
    sessionId: 'owned',
  };
  const run = (value = input, signal = new AbortController().signal) =>
    hook(value, { signal, deadlineAt: Date.now() + 1000 });
  return {
    root,
    file,
    server,
    pull,
    registry,
    tracker,
    cfg,
    input,
    run,
    leave: () => {
      current = false;
    },
  };
}

describe('same-call post-edit LSP feedback', () => {
  it('includes current diagnostics with exact document identity', async () => {
    const f = await fixture();
    const output = await f.run();
    expect(output).toMatchObject({ contextAs: 'inline' });
    expect(output?.additionalContext).toContain('ERROR typescript(2322)');
    expect(output?.additionalContext).toMatch(/version=1; sha256=[a-f0-9]{64}/);
    expect(output?.additionalContext).toContain('Tests/typecheck remain required');
  });

  it('reports a confirmed clean file separately from a failed check', async () => {
    const f = await fixture();
    f.pull.mockResolvedValue([]);
    expect((await f.run())?.additionalContext).toContain('No LSP diagnostics.');
    f.pull.mockRejectedValue(new Error('timeout'));
    const output = (await f.run())?.additionalContext;
    expect(output).toContain('file not verified');
    expect(output).not.toContain('No LSP diagnostics');
  });

  it('states the filter and received count when errors were filtered out', async () => {
    const f = await fixture();
    f.cfg.severityFilter = ['hint'];
    const output = (await f.run())?.additionalContext;
    expect(output).toContain('Received 1 diagnostics; displayed severities: hint');
    expect(output).toContain('No LSP diagnostics.');
  });

  it('rejects stale diagnostics if the file changes during analysis', async () => {
    const f = await fixture();
    f.pull.mockImplementation(async () => {
      await fs.writeFile(f.file, 'const b = 2;');
      return [];
    });
    expect((await f.run())?.additionalContext).toContain('file not verified');
  });

  it('rejects results from a replaced server', async () => {
    const f = await fixture();
    f.pull.mockImplementation(async () => {
      f.registry.get = () => null as never;
      return [];
    });
    expect((await f.run())?.additionalContext).toContain('file not verified');
  });

  it('discards results after the originating project/session leaves', async () => {
    const f = await fixture();
    f.pull.mockImplementation(async () => {
      f.leave();
      return [error];
    });
    expect(await f.run()).toBeUndefined();
  });

  it('does not check failed edits, unsupported files or manual mode', async () => {
    const f = await fixture();
    await f.run({ ...f.input, toolResult: { content: 'denied', isError: true } });
    await f.run({ ...f.input, toolInput: { path: path.join(f.root, 'notes.txt') } });
    f.cfg.diagnosticsAfterEdit = 'manual';
    await f.run();
    expect(f.pull).not.toHaveBeenCalled();
  });

  it('does not mistake a silent push server for a verified file', async () => {
    const f = await fixture();
    f.server.capabilities = {};
    const output = await f.run();
    expect(output?.additionalContext).toContain('file not verified');
    expect(f.pull).not.toHaveBeenCalled();
  });

  it('drops feedback on cancellation and bounds diagnostic text', async () => {
    const f = await fixture();
    const aborted = new AbortController();
    aborted.abort();
    expect(await f.run(f.input, aborted.signal)).toBeUndefined();
    f.pull.mockResolvedValue([{ ...error, message: 'x'.repeat(20_000) }]);
    const output = (await f.run())?.additionalContext ?? '';
    expect(output.length).toBeLessThan(8000);
    expect(output).toContain('[diagnostics truncated]');
  });
});
