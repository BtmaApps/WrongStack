/**
 * `tool_script`: a JavaScript program composing tool calls, run in QuickJS
 * with no access to anything but the agent's tool gate.
 */
import type { NestedToolCaller, Tool } from '@wrongstack/core/types';
import { describe, expect, it } from 'vitest';
import { toolScriptTool } from '../src/tool-script.js';

type Call = Parameters<NestedToolCaller>[0];

function harness(answer: (call: Call) => Promise<{ content: string; isError: boolean }>) {
  const calls: Call[] = [];
  const ctx = {
    tools: [{ name: 'read' }, { name: 'grep' }, { name: 'codebase-search' }] as Tool[],
    meta: {} as Record<string, unknown>,
    nestedToolCall: (async (call) => {
      calls.push(call);
      return answer(call);
    }) as NestedToolCaller,
  };
  const run = (script: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) =>
    toolScriptTool.execute({ script, ...extra } as never, ctx as never, {
      signal: signal ?? new AbortController().signal,
      toolUseId: 'call_1',
    });
  return { run, calls, ctx };
}

const echo = async (call: Call) => ({
  content: `${call.name}:${JSON.stringify(call.input)}`,
  isError: false,
});

describe('tool_script', () => {
  it('composes tool calls and returns only the final value', async () => {
    const h = harness(echo);
    const out = await h.run(`
      const a = await tools.read({ path: 'a.ts' });
      const b = await tools.call('codebase-search', { query: 'x' });
      return { a, b };
    `);
    expect(out).toContain('"a": "read:{\\"path\\":\\"a.ts\\"}"');
    expect(out).toContain('"b": "codebase-search:{\\"query\\":\\"x\\"}"');
    expect(out).toContain('(2 tool calls: read, codebase-search)');
    // Numbered under the script's own call, for the session record.
    expect(h.calls.map((c) => [c.parentToolUseId, c.index])).toEqual([
      ['call_1', 1],
      ['call_1', 2],
    ]);
  });

  it('runs calls side by side with Promise.all', async () => {
    let inFlight = 0;
    let peak = 0;
    const h = harness(async (call) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight--;
      return echo(call);
    });
    const out = await h.run(
      `return (await Promise.all(['a','b','c'].map((p) => tools.read({ path: p })))).length;`,
    );
    expect(out.startsWith('3')).toBe(true);
    expect(peak).toBe(3);
  });

  it('turns a failed call into an exception the script can catch', async () => {
    const h = harness(async () => ({ content: 'no such file', isError: true }));
    const out = await h.run(
      `try { await tools.read({ path: 'x' }); } catch (e) { return 'caught: ' + e.message; }`,
    );
    expect(out).toContain('caught: no such file');
    expect(out).toContain('(1 tool call: read (1 failed))');
  });

  it('reports an uncaught error with the calls that already ran', async () => {
    const h = harness(echo);
    await expect(h.run(`await tools.grep({ q: 'x' }); throw new Error('boom');`)).rejects.toThrow(
      'The script failed: Error: boom (1 tool call: grep)',
    );
    await expect(h.run('return (;')).rejects.toThrow('SyntaxError');
  });

  it('has no filesystem, network, process or module access', async () => {
    const h = harness(echo);
    const out = await h.run(
      'return [typeof require, typeof process, typeof fetch, typeof std, typeof os, typeof XMLHttpRequest].join(",");',
    );
    expect(out.split('\n')[0]).toBe('undefined,undefined,undefined,undefined,undefined,undefined');
    await expect(h.run(`await import('fs');`)).rejects.toThrow(/script failed/);
    expect(h.calls).toEqual([]);
  });

  it('stops a script that runs past its time limit or loops forever', async () => {
    const h = harness(echo);
    await expect(h.run('while (true) {}', { timeout_ms: 300 })).rejects.toThrow(
      'ran past its 300 ms limit',
    );
    await expect(h.run(`await new Promise(() => {});`, { timeout_ms: 200 })).rejects.toThrow(
      'ran past its 200 ms limit',
    );
  });

  it('stops a script that computes without pausing, even with no time limit', async () => {
    const h = harness(echo);
    // An endless loop never yields to the event loop, so nothing else could stop it.
    await expect(h.run('while (true) {}', { timeout_ms: 0 })).rejects.toThrow(
      'computed for 5000 ms without pausing at an await',
    );
  }, 20_000);

  it('lets computation that pauses at awaits add up past the unpaused limit', async () => {
    const h = harness(echo);
    const out = await h.run(
      `for (let i = 0; i < 3; i++) {
         const end = Date.now() + 2000;
         while (Date.now() < end) {}
         await tools.read({ i });
       }
       return 'computed about 6s';`,
      { timeout_ms: 0 },
    );
    expect(out.startsWith('computed about 6s')).toBe(true);
  }, 30_000);

  it('has no call limit or output cut of its own', async () => {
    const h = harness(echo);
    const out = await h.run(
      `for (let i = 0; i < 80; i++) await tools.read({ i });
       console.log('y'.repeat(20000));
       return 'x'.repeat(150000);`,
    );
    expect(h.calls).toHaveLength(80);
    expect(out).toContain('x'.repeat(150000));
    expect(out).toContain(`console:\n${'y'.repeat(20000)}`);
    expect(out).toContain('(80 tool calls: read ×80)');
    // Its own timer governs `timeout_ms`, so the executor's generic ceiling does not apply.
    expect(toolScriptTool.managesOwnTimeout).toBe(true);
  });

  it('holds a script to its memory limit', async () => {
    const h = harness(echo);
    await expect(h.run(`const a = []; while (true) a.push('x'.repeat(1 << 20));`)).rejects.toThrow(
      /out of memory/,
    );
  });

  it('refuses calls past max_calls and a script inside a script', async () => {
    const h = harness(echo);
    const out = await h.run(
      `const r = [];
       for (let i = 0; i < 3; i++) { try { r.push(await tools.read({ i })); } catch (e) { r.push(e.message); } }
       try { await tools.call('tool_script', { script: 'return 1' }); } catch (e) { r.push(e.message); }
       return r;`,
      { max_calls: 2 },
    );
    expect(out).toContain('The script reached its limit of 2 tool calls.');
    expect(out).toContain('A tool script cannot run another tool script.');
    expect(h.calls).toHaveLength(2);

    // Reached through `tool_use`, the inner script finds the outer one running.
    h.ctx.meta.toolScriptRunning = true;
    await expect(h.run('return 1')).rejects.toThrow('cannot run inside another tool script');
  });

  it('stops when the run is aborted', async () => {
    const h = harness(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = h.run(`await tools.read({ path: 'slow' });`, {}, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow('the run was stopped');
    // The flag is cleared for the next script.
    expect(h.ctx.meta.toolScriptRunning).toBeUndefined();
  });

  it('returns console output with the result', async () => {
    const h = harness(echo);
    const out = await h.run(`console.log('step', 1, { ok: true }); return 'done';`);
    expect(out).toContain('done');
    expect(out).toContain('console:\nstep 1 {\n  "ok": true\n}');
  });

  it('refuses to run without the agent tool gate', async () => {
    await expect(
      toolScriptTool.execute({ script: 'return 1' }, { tools: [], meta: {} } as never, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('no tool gate');
  });
});
