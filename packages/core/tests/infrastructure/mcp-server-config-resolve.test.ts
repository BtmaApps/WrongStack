import { describe, expect, it } from 'vitest';
import { resolveMcpServerConfig } from '../../src/infrastructure/mcp-servers.js';

/**
 * `mcpServers` is keyed by server name, and the documented way to turn a preset
 * on is the bare `{ github: { enabled: true } }`. Boot paths read `cfg.name`
 * (undefined for that entry) or skipped the preset merge entirely, starting a
 * server with no name or no command.
 */
describe('resolveMcpServerConfig', () => {
  it('merges a bare preset entry and stamps the record key as the name', () => {
    const cfg = resolveMcpServerConfig('github', { enabled: true });
    expect(cfg).toMatchObject({
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      enabled: true,
    });
  });

  it('does not inherit the catalog `enabled: false` of a preset', () => {
    const cfg = resolveMcpServerConfig('github', { permission: 'auto' });
    expect(cfg?.enabled).toBeUndefined();
    expect(cfg?.permission).toBe('auto');
  });

  it('lets the entry override preset fields and ignores a conflicting inner name', () => {
    const cfg = resolveMcpServerConfig('github', {
      name: 'something-else',
      args: ['-y', 'fork'],
    } as never);
    expect(cfg).toMatchObject({ name: 'github', args: ['-y', 'fork'] });
  });

  it('accepts a fully specified custom server', () => {
    expect(
      resolveMcpServerConfig('mine', { transport: 'streamable-http', url: 'https://x.test/mcp' }),
    ).toEqual({ name: 'mine', transport: 'streamable-http', url: 'https://x.test/mcp' });
  });

  it('returns undefined for an unknown name without a transport', () => {
    expect(resolveMcpServerConfig('ghost', { enabled: true })).toBeUndefined();
    expect(resolveMcpServerConfig('__proto__', undefined)).toBeUndefined();
  });
});
