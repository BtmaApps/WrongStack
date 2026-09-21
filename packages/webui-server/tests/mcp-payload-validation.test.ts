/**
 * WS-004 — `mcp.add` / `mcp.update` payload validation.
 *
 * Both handlers cast the raw WebSocket payload with `as McpServerInput` and
 * handed it to `addMcp`, which persists `command`/`args`/`env` into the global
 * config and then spawns them. An unvalidated frame therefore became a
 * persistent child process that respawns on every restart. Four separate
 * scanners reached this handler independently.
 *
 * These cover the structural contract only. Whether a given `command` is
 * *allowed* is a policy question owned elsewhere; the spawn itself is hardened
 * by buildWin32CmdShimInvocation (CMDI-005).
 */
import { describe, expect, it } from 'vitest';
import { validateMcpServerPayload } from '../src/server/ws-payload-validation.js';

const ok = (payload: unknown) => validateMcpServerPayload(payload, 'mcp.add');

describe('validateMcpServerPayload', () => {
  it('accepts a minimal stdio server', () => {
    const result = ok({ name: 'files', command: 'npx', args: ['-y', '@scope/pkg'] });
    expect(result.ok).toBe(true);
  });

  it('accepts an http server with headers', () => {
    const result = ok({
      name: 'remote',
      url: 'https://mcp.example/v1',
      headers: { Authorization: 'Bearer x' },
      enabled: true,
      lazy: false,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an environment-backed bearer token name but not a secret object', () => {
    expect(
      ok({
        name: 'zai-web-search',
        transport: 'streamable-http',
        url: 'https://api.z.ai/api/mcp/web_search_prime/mcp',
        bearerTokenEnv: 'Z_AI_API_KEY',
      }).ok,
    ).toBe(true);
    expect(ok({ name: 'remote', bearerTokenEnv: { value: 'secret' } }).ok).toBe(false);
  });

  it('rejects a non-object payload', () => {
    for (const payload of [undefined, null, 'name', 42, []]) {
      expect(ok(payload).ok).toBe(false);
    }
  });

  it('rejects a missing or blank name', () => {
    expect(ok({}).ok).toBe(false);
    expect(ok({ name: '' }).ok).toBe(false);
    expect(ok({ name: '   ' }).ok).toBe(false);
    expect(ok({ name: 123 }).ok).toBe(false);
  });

  it('rejects a non-string command', () => {
    const result = ok({ name: 'x', command: { toString: 'evil' } });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('command');
  });

  it('rejects args that are not a string array', () => {
    expect(ok({ name: 'x', command: 'node', args: 'not-an-array' }).ok).toBe(false);
    expect(ok({ name: 'x', command: 'node', args: [1, 2] }).ok).toBe(false);
    expect(ok({ name: 'x', command: 'node', args: [{}] }).ok).toBe(false);
  });

  it('rejects env and headers that are not string maps', () => {
    expect(ok({ name: 'x', env: 'PATH=/' }).ok).toBe(false);
    expect(ok({ name: 'x', env: { PATH: 42 } }).ok).toBe(false);
    expect(ok({ name: 'x', headers: { Authorization: null } }).ok).toBe(false);
  });

  it('rejects non-boolean enabled/lazy', () => {
    expect(ok({ name: 'x', enabled: 'yes' }).ok).toBe(false);
    expect(ok({ name: 'x', lazy: 1 }).ok).toBe(false);
  });

  // `allowPrivateNetworks` belongs in that same boolean group: `buildConfig`
  // copies it to disk, and `assertTransportAddressAllowed` gates the private/LAN
  // dial relaxation on its TRUTHINESS. Any non-empty string is truthy in JS, so
  // a frame carrying `allowPrivateNetworks: "false"` — the natural serialization
  // of an "off" toggle — enabled private-range dialing while saying the opposite,
  // and persisted across restarts. Rejecting the non-boolean is the fail-closed
  // answer; `false` itself must stay valid (see the control below).
  it('rejects non-boolean allowPrivateNetworks', () => {
    expect(ok({ name: 'x', allowPrivateNetworks: 'false' }).ok).toBe(false);
    expect(ok({ name: 'x', allowPrivateNetworks: 'yes' }).ok).toBe(false);
    expect(ok({ name: 'x', allowPrivateNetworks: 1 }).ok).toBe(false);
    expect(ok({ name: 'x', allowPrivateNetworks: {} }).ok).toBe(false);
  });

  it('CONTROL: accepts a genuine boolean allowPrivateNetworks', () => {
    expect(ok({ name: 'x', allowPrivateNetworks: true }).ok).toBe(true);
    expect(ok({ name: 'x', allowPrivateNetworks: false }).ok).toBe(true);
  });

  it('bounds oversized strings and collections', () => {
    const huge = 'a'.repeat(5_000);
    expect(ok({ name: huge }).ok).toBe(false);
    expect(ok({ name: 'x', command: huge }).ok).toBe(false);
    expect(ok({ name: 'x', args: Array.from({ length: 300 }, () => 'a') }).ok).toBe(false);
  });

  it('accepts the object form of transport', () => {
    expect(ok({ name: 'x', transport: { type: 'stdio' } }).ok).toBe(true);
    expect(ok({ name: 'x', transport: 'stdio' }).ok).toBe(true);
    expect(ok({ name: 'x', transport: 42 }).ok).toBe(false);
  });

  // `health` is the second field `buildConfig` copies to disk with no type check
  // (`allowPrivateNetworks` was the first). `evaluateHealthThresholds` compares
  // every threshold with `<=`, and a non-numeric operand makes that comparison
  // false — so `applyHealthThresholds` pins an otherwise-healthy server to
  // `degraded` permanently, surviving restarts. `null` matters specifically:
  // each group above guards with `!== undefined`, so a null slips past all of
  // them untouched. Numbers stay valid, including a legitimate `0`.
  it('rejects non-numeric health thresholds', () => {
    const bad = [
      { connectionLatencyP95Ms: 'soon' },
      { discoveryLatencyP95Ms: null },
      { callLatencyP95Ms: { ms: 1 } },
      { inFlightCalls: '5' },
      { connectionLatencyP95Ms: true },
    ];
    for (const thresholds of bad) {
      expect(ok({ name: 'x', health: { thresholds } }).ok).toBe(false);
    }
  });

  it('rejects a malformed health envelope', () => {
    expect(ok({ name: 'x', health: 'yes' }).ok).toBe(false);
    expect(ok({ name: 'x', health: { thresholds: 'soon' } }).ok).toBe(false);
  });

  it('CONTROL: accepts declared health shapes and leaves unknown keys inert', () => {
    expect(ok({ name: 'x', health: { thresholds: { connectionLatencyP95Ms: 500 } } }).ok).toBe(
      true,
    );
    expect(ok({ name: 'x', health: { thresholds: { inFlightCalls: 0 } } }).ok).toBe(true);
    // Omitted thresholds "cannot mark a server degraded" (operations.ts:168-169).
    expect(ok({ name: 'x', health: { thresholds: {} } }).ok).toBe(true);
    expect(ok({ name: 'x', health: {} }).ok).toBe(true);
    // `evaluateHealthThresholds` reads its four keys by name and never enumerates
    // Object.keys, so an unknown key is inert. Rejecting it would break a
    // forward-compatible config for no safety gain.
    expect(ok({ name: 'x', health: { thresholds: { futureThing: 'soon' } } }).ok).toBe(true);
  });
});
