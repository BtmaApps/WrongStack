/**
 * Focused verification that the WrongTrace hooks are wired into the REAL
 * executor path — i.e. that HookRunner.preToolUse (the same call the
 * ToolExecutor makes before dispatching a tool) consults the registered
 * gate hooks and denies/allows/releases accordingly.
 *
 * Runs against a local daemon fixture, including an explicit offline case.
 * Uses the REAL HookRegistry + HookRunner from @wrongstack/core, so this
 * proves the wiring contract without depending on the operator's daemon.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HookRegistry, HookRunner } from '@wrongstack/core/hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getWrongTrace, resetWrongTraceGate } from '../src/wiring/wrongtrace-gate.js';
import {
  createWrongTraceHookPair,
  type WrongTraceGateDecisionEvent,
} from '../src/wiring/wrongtrace-hooks.js';

const PROBE = `__hook_probe_${Date.now()}__`;
const SESSION = 'hook-focused-test';

function buildRunner(emit?: (event: WrongTraceGateDecisionEvent) => void): HookRunner {
  // Mirrors the registration in lifecycle-plugins.ts: same event, same
  // matcher string, same owner, and the same per-runner PAIR factory (not
  // the legacy standalone factories). If the production wiring drifts, this
  // test still exercises the exact registration contract it must satisfy.
  // The optional emit callback mirrors production wiring too — lifecycle-plugins
  // forwards gate events onto the EventBus as `wrongtrace.gate.decision`.
  const hooks = createWrongTraceHookPair(() => SESSION, emit ? { emit } : undefined);
  const registry = new HookRegistry();
  registry.registerInProcess(
    'PreToolUse',
    'edit|write|replace|patch|codebase-ast-replace',
    hooks.preToolUse,
    'wrongtrace-gate',
  );
  registry.registerInProcess(
    'PostToolUse',
    'edit|write|replace|patch|codebase-ast-replace',
    hooks.postToolUse,
    'wrongtrace-gate',
  );
  return new HookRunner({ registry, logger: undefined, sessionId: () => SESSION });
}

/**
 * Minimal in-process WrongTrace daemon stub. Serves exactly the endpoints
 * the gate path touches (health / file-health / friction / guardrail
 * lock-unlock-list / atlas) against an in-memory lock store.
 *
 * Why: the live daemon's fragile files are precisely the files other agents
 * hold locks on — picking one from the live atlas and asserting "allow +
 * nudge" races real shared state, because the gate denies any foreign-locked
 * file before the nudge can fire. Serving a stub makes the fragile-file
 * contract deterministic while the test still drives the REAL HookRunner +
 * hook-pair wiring.
 */
function startStubDaemon(fragilePath: string): Promise<{
  url: string;
  close: () => Promise<void>;
  lockOwners: () => Array<{ path: string; owner: string }>;
  setAvailable: (value: boolean) => void;
}> {
  const locks = new Map<string, string>();
  let available = true;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub.local');
    const respond = (body: unknown, status = 200): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const route = (post: Record<string, unknown>): void => {
      switch (url.pathname) {
        case '/api/health':
          if (!available) {
            respond({ status: 'offline' }, 503);
            return;
          }
          // socket_path: '' keeps IPC unwired (client.test.ts precedent for
          // deterministic runs beside a live daemon). Returning NO
          // socket_path would fall back to defaultSocketPath() — the LIVE
          // daemon's pipe on this machine — and IPC-first getFileHealth
          // would bypass this stub entirely.
          respond({ status: 'ok', socket_path: '' });
          return;
        case '/api/file/health': {
          const p = url.searchParams.get('path') ?? '';
          const owner = locks.get(p);
          respond({
            file_path: p,
            health_score: p === fragilePath ? 25 : 90,
            is_fragile: p === fragilePath,
            recent_thrashing_count: 0,
            warning: '',
            ...(owner === undefined
              ? { is_locked: false }
              : {
                  is_locked: true,
                  lock_owner: owner,
                  lock_reason: 'stub lock',
                  lock_expires_at: new Date(Date.now() + 60_000).toISOString(),
                }),
          });
          return;
        }
        case '/api/metrics/friction':
          respond({ edges: [], recent_collisions: [], total_collisions: 0 });
          return;
        case '/api/guardrail/lock': {
          const p = String(post['path'] ?? '');
          const owner = locks.get(p);
          if (owner !== undefined) {
            respond({ ok: false, path: p, owner, error: 'conflict' }, 409);
            return;
          }
          locks.set(p, String(post['owner'] ?? 'unknown'));
          respond({ ok: true, path: p, status: 'locked' });
          return;
        }
        case '/api/guardrail/unlock': {
          const p = String(post['path'] ?? '');
          locks.delete(p);
          respond({ ok: true, path: p, status: 'unlocked' });
          return;
        }
        case '/api/guardrail/locks':
          respond([...locks.entries()].map(([path, owner]) => ({ path, owner })));
          return;
        case '/api/atlas':
          respond({
            workspaces: ['stub'],
            packages: [
              {
                name: 'stub',
                files: [
                  {
                    path: fragilePath,
                    health_score: 25,
                    is_fragile: true,
                    recent_thrashing_count: 0,
                  },
                ],
              },
            ],
          });
          return;
        default:
          respond({ error: 'not found' }, 404);
      }
    };
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk;
      });
      req.on('end', () => {
        route(body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {});
      });
    } else {
      route({});
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((resolveClose) => {
            // Kill keep-alive sockets (undici's global fetch agent) so close
            // resolves instead of hanging on open connections.
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
        lockOwners: () => [...locks.entries()].map(([path, owner]) => ({ path, owner })),
        setAvailable: (value) => {
          available = value;
        },
      });
    });
  });
}

let previousUrl: string | undefined;
let stub: Awaited<ReturnType<typeof startStubDaemon>>;
const FRAGILE_PATH = `${PROBE}-fragile.ts`;
beforeEach(async () => {
  previousUrl = process.env.WRONGTRACE_URL;
  stub = await startStubDaemon(FRAGILE_PATH);
  process.env.WRONGTRACE_URL = stub.url;
  resetWrongTraceGate();
  expect((await getWrongTrace()).isAvailable).toBe(true);
});
afterEach(async () => {
  if (previousUrl === undefined) delete process.env.WRONGTRACE_URL;
  else process.env.WRONGTRACE_URL = previousUrl;
  resetWrongTraceGate();
  await stub.close();
});

describe('WrongTrace hooks on the real HookRunner (executor path)', () => {
  it('preToolUse denies an edit when another owner holds the lock', async () => {
    const wt = await getWrongTrace();
    const runner = buildRunner();
    const env = { cwd: process.cwd() };

    await wt.lockFile(PROBE, 'held by peer', { owner: 'peer-agent', ttlSeconds: 60 });
    try {
      const r = await runner.preToolUse('edit', { path: PROBE }, env, { mutating: true });
      expect(r.block).toBe(true);
      expect(r.reason).toContain('peer-agent');
      expect(r.reason).toContain('WrongTrace lock');
    } finally {
      await wt.unlockFile(PROBE);
    }
  });

  it('preToolUse allows an unlocked edit, claims the lock, postToolUse releases it', async () => {
    const wt = await getWrongTrace();
    const runner = buildRunner();
    const env = { cwd: process.cwd() };

    const pre = await runner.preToolUse('edit', { path: PROBE }, env, { mutating: true });
    expect(pre.block).toBeFalsy();

    const held = (await wt.listLocks()).find((l) => l.path === PROBE);
    expect(held?.owner).toBe(`wrongstack:${SESSION}`);

    await runner.postToolUse('edit', { path: PROBE }, { content: '', isError: false }, env);
    const after = (await wt.listLocks()).filter((l) => l.path === PROBE);
    expect(after).toHaveLength(0);
  });

  it('non-edit tools and path-less inputs pass through untouched', async () => {
    const runner = buildRunner();
    const env = { cwd: process.cwd() };

    const grep = await runner.preToolUse('grep', { pattern: 'x' }, env, { mutating: false });
    expect(grep.block).toBeFalsy();

    const noPath = await runner.preToolUse('edit', { content: 'x' }, env, { mutating: true });
    expect(noPath.block).toBeFalsy();
  });

  it('emits typed gate-decision events (deny / lock-acquired / lock-released)', async () => {
    const wt = await getWrongTrace();
    const emitted: WrongTraceGateDecisionEvent[] = [];
    const runner = buildRunner((event) => emitted.push(event));
    const env = { cwd: process.cwd() };

    // Foreign lock → deny event with the owner in the reason.
    await wt.lockFile(PROBE, 'held by peer', { owner: 'peer-agent', ttlSeconds: 60 });
    try {
      await runner.preToolUse('edit', { path: PROBE }, env, { mutating: true });
      const deny = emitted.find((e) => e.kind === 'deny');
      expect(deny).toBeDefined();
      expect(deny?.path).toBe(PROBE);
      expect(deny?.kind === 'deny' ? deny.reason : '').toContain('peer-agent');
    } finally {
      await wt.unlockFile(PROBE);
    }

    // Unlocked edit → lock-acquired on claim, lock-released on postToolUse.
    emitted.length = 0;
    await runner.preToolUse('edit', { path: PROBE }, env, { mutating: true });
    expect(emitted.some((e) => e.kind === 'lock-acquired')).toBe(true);
    await runner.postToolUse('edit', { path: PROBE }, { content: '', isError: false }, env);
    expect(emitted.some((e) => e.kind === 'lock-released')).toBe(true);
    const after = (await wt.listLocks()).filter((l) => l.path === PROBE);
    expect(after).toHaveLength(0);
  });

  it('fragile files allow with a surgical-edit nudge in additionalContext', async () => {
    const emitted: WrongTraceGateDecisionEvent[] = [];
    const runner = buildRunner((event) => emitted.push(event));
    const env = { cwd: process.cwd() };
    const r = await runner.preToolUse('edit', { path: FRAGILE_PATH }, env, { mutating: true });
    expect(r.block).toBeFalsy();
    expect(r.additionalContext).toContain('fragile');
    expect(stub.lockOwners()).toEqual([{ path: FRAGILE_PATH, owner: `wrongstack:${SESSION}` }]);
    await runner.postToolUse('edit', { path: FRAGILE_PATH }, { content: '', isError: false }, env);
    expect(stub.lockOwners()).toHaveLength(0);
    expect(emitted.some((e) => e.kind === 'allow-fragile')).toBe(true);
    expect(emitted.some((e) => e.kind === 'lock-acquired')).toBe(true);
    expect(emitted.some((e) => e.kind === 'lock-released')).toBe(true);
  });

  it('allows an edit without gate events or lock claims when its daemon is offline', async () => {
    stub.setAvailable(false);
    resetWrongTraceGate();
    expect((await getWrongTrace()).isAvailable).toBe(false);
    const emitted: WrongTraceGateDecisionEvent[] = [];
    const runner = buildRunner((event) => emitted.push(event));
    const env = { cwd: process.cwd() };
    expect(
      (await runner.preToolUse('edit', { path: PROBE }, env, { mutating: true })).block,
    ).toBeFalsy();
    await runner.postToolUse('edit', { path: PROBE }, { content: '', isError: false }, env);
    expect(emitted).toHaveLength(0);
    expect(stub.lockOwners()).toHaveLength(0);
  });
});
