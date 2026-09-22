import { describe, expect, it, vi } from 'vitest';
import { buildMcpSlashCommand } from '../src/slash-commands/mcp.js';

describe('buildMcpSlashCommand', () => {
  it('returns a SlashCommand with the expected metadata', () => {
    const cmd = buildMcpSlashCommand({ onMcp: vi.fn() } as never);
    expect(cmd.name).toBe('mcp');
    expect(cmd.aliases).toContain('mcp-servers');
    expect(cmd.description).toContain('Manage MCP servers');
    expect(cmd.help).toContain('Usage:');
    expect(cmd.help).toContain('add <name>');
  });

  it('reports unavailable when no onMcp callback is wired', async () => {
    const cmd = buildMcpSlashCommand({} as never);
    const res = await cmd.run('list');
    expect(res?.message).toContain('not available');
  });

  it('trims args and forwards the result of onMcp as the message', async () => {
    const onMcp = vi.fn().mockResolvedValue('OK from onMcp');
    const cmd = buildMcpSlashCommand({ onMcp } as never);
    const res = await cmd.run('  list  ');
    expect(onMcp).toHaveBeenCalledWith('list');
    expect(res?.message).toBe('OK from onMcp');
  });

  it('forwards empty string when args is whitespace only', async () => {
    const onMcp = vi.fn().mockResolvedValue('empty');
    const cmd = buildMcpSlashCommand({ onMcp } as never);
    await cmd.run('   ');
    expect(onMcp).toHaveBeenCalledWith('');
  });

  it('also re-exports parseMcpArgs and runMcpManagementCommand via the barrel', async () => {
    const mod = await import('../src/slash-commands/mcp.js');
    expect(typeof mod.parseMcpArgs).toBe('function');
    expect(typeof mod.runMcpManagementCommand).toBe('function');
  });

  it('lists resources and templates through the live registry', async () => {
    const mcpRegistry = {
      listResources: vi
        .fn()
        .mockResolvedValue([
          { uri: 'repo://README.md', name: 'readme', mimeType: 'text/markdown', size: 42 },
        ]),
      listResourceTemplates: vi
        .fn()
        .mockResolvedValue([{ uriTemplate: 'repo://{path}', name: 'repository file' }]),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run('resources docs --refresh');

    expect(mcpRegistry.listResources).toHaveBeenCalledWith('docs', { refresh: true });
    expect(res?.message).toContain('repo://README.md');
    expect(res?.message).toContain('repo://{path}');
  });

  it('lists prompts and required argument names', async () => {
    const mcpRegistry = {
      listPrompts: vi.fn().mockResolvedValue([
        {
          name: 'review',
          description: 'Review code',
          arguments: [{ name: 'target', required: true }],
        },
      ]),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run('prompts docs');

    expect(res?.message).toContain('review (target*) — Review code');
  });

  it('inserts only an explicitly selected resource with provenance metadata', async () => {
    const insertion = {
      kind: 'resource',
      untrusted: true,
      byteSize: 5,
      provenance: {
        origin: 'mcp',
        serverName: 'docs',
        capability: 'resource',
        resourceUri: 'repo://guide',
      },
      contents: [{ uri: 'repo://guide', text: 'hello' }],
    };
    const mcpRegistry = { selectResourceForInsertion: vi.fn().mockResolvedValue(insertion) };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run('read docs repo://guide');

    expect(res?.message).toContain('untrusted MCP resource');
    expect(res?.runText).toContain('[UNTRUSTED MCP CONTENT');
    expect(res?.runText).toContain('repo://guide');
    expect(res?.metadata).toEqual({ mcpInsertion: insertion.provenance });
  });

  it('passes prompt arguments and never includes argument values in metadata', async () => {
    const insertion = {
      kind: 'prompt',
      untrusted: true,
      byteSize: 12,
      provenance: {
        origin: 'mcp',
        serverName: 'docs',
        capability: 'prompt',
        promptName: 'review',
        promptArgumentNames: ['token'],
      },
      messages: [{ role: 'user', content: { type: 'text', text: 'review' } }],
    };
    const mcpRegistry = { selectPromptForInsertion: vi.fn().mockResolvedValue(insertion) };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run('get docs review token=secret-value');

    expect(mcpRegistry.selectPromptForInsertion).toHaveBeenCalledWith('docs', 'review', {
      token: 'secret-value',
    });
    expect(JSON.stringify(res?.metadata)).not.toContain('secret-value');
  });

  it('rejects malformed prompt key/value arguments before calling the registry', async () => {
    const mcpRegistry = { selectPromptForInsertion: vi.fn() };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run('get docs review malformed');

    expect(res?.message).toContain('expected key=value');
    expect(mcpRegistry.selectPromptForInsertion).not.toHaveBeenCalled();
  });

  it('starts manual OAuth without exposing the PKCE verifier', async () => {
    const mcpRegistry = {
      beginAuthorization: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize?state=safe-state',
        expiresAt: Date.parse('2026-07-13T03:00:00.000Z'),
      }),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run(
      'auth start remote wrongstack http://127.0.0.1:43123/callback tools:read',
    );

    expect(mcpRegistry.beginAuthorization).toHaveBeenCalledWith('remote', {
      clientId: 'wrongstack',
      redirectUri: 'http://127.0.0.1:43123/callback',
      scopes: ['tools:read'],
    });
    expect(res?.message).toContain('https://auth.example.com/authorize');
    expect(res?.message).not.toContain('codeVerifier');
  });

  it('completes OAuth and renders only non-secret status', async () => {
    const callbackUrl = 'http://127.0.0.1:43123/callback?code=one-time&state=expected';
    const mcpRegistry = {
      completeAuthorization: vi.fn().mockResolvedValue({
        state: 'authorized',
        resource: 'https://mcp.example.com/mcp',
        scopes: ['tools:read'],
        canRefresh: true,
      }),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const res = await cmd.run(`auth complete remote ${callbackUrl}`);

    expect(mcpRegistry.completeAuthorization).toHaveBeenCalledWith('remote', callbackUrl);
    expect(res?.message).toContain('state=authorized');
    expect(res?.message).not.toContain('one-time');
  });

  it('shows status and removes stored OAuth credentials', async () => {
    const mcpRegistry = {
      authorizationStatus: vi.fn().mockResolvedValue({
        state: 'expired',
        resource: 'https://mcp.example.com/mcp',
        scopes: [],
        canRefresh: true,
      }),
      disconnectAuthorization: vi.fn().mockResolvedValue(true),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry } as never);

    const status = await cmd.run('auth status remote');
    const logout = await cmd.run('auth logout remote');

    expect(status?.message).toContain('state=expired');
    expect(logout?.message).toContain('credentials removed');
  });
});

describe('/mcp auth argument forms', () => {
  function loginRegistry(overrides: Record<string, unknown> = {}) {
    return {
      loginAuthorization: vi.fn().mockResolvedValue({
        started: {
          serverName: 'notion',
          resource: 'https://mcp.notion.com/mcp',
          authorizationUrl: 'https://auth.notion.com/authorize?client_id=dcr',
          redirectUri: 'http://127.0.0.1:51234/callback',
          scopes: ['tools:read'],
          expiresAt: Date.now() + 600_000,
          clientIdSource: 'registered',
        },
        completion: new Promise(() => undefined),
        cancel: vi.fn(),
      }),
      ...overrides,
    };
  }

  const events = { emit: vi.fn() };

  it('signs in with no client id and shows the URL without blocking', async () => {
    const mcpRegistry = loginRegistry();
    const cmd = buildMcpSlashCommand({ mcpRegistry, events } as never);

    const res = await cmd.run('auth login notion');

    expect(mcpRegistry.loginAuthorization).toHaveBeenCalledWith('notion', {
      clientId: undefined,
      port: undefined,
    });
    expect(res?.message).toContain('registered a new OAuth client');
    expect(res?.message).toContain('https://auth.notion.com/authorize?client_id=dcr');
  });

  it('passes an explicit client id, port and scopes through', async () => {
    const mcpRegistry = loginRegistry();
    const cmd = buildMcpSlashCommand({ mcpRegistry, events } as never);

    await cmd.run('auth login notion --client-id abc --port 43123 tools:read tools:write');

    expect(mcpRegistry.loginAuthorization).toHaveBeenCalledWith('notion', {
      clientId: 'abc',
      port: 43123,
      scopes: ['tools:read', 'tools:write'],
    });
  });

  it('still accepts the legacy positional start form', async () => {
    const mcpRegistry = {
      beginAuthorization: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize',
        expiresAt: Date.now() + 600_000,
        clientIdSource: 'explicit',
      }),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry, events } as never);

    await cmd.run('auth start remote my-client http://127.0.0.1:43123/callback tools:read');

    expect(mcpRegistry.beginAuthorization).toHaveBeenCalledWith('remote', {
      clientId: 'my-client',
      redirectUri: 'http://127.0.0.1:43123/callback',
      scopes: ['tools:read'],
    });
  });

  it('allows start without a client id so registration can supply one', async () => {
    const mcpRegistry = {
      beginAuthorization: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize',
        expiresAt: Date.now() + 600_000,
        clientIdSource: 'registered',
      }),
    };
    const cmd = buildMcpSlashCommand({ mcpRegistry, events } as never);

    await cmd.run('auth start remote --redirect-uri http://127.0.0.1:43123/callback');

    expect(mcpRegistry.beginAuthorization).toHaveBeenCalledWith('remote', {
      clientId: undefined,
      redirectUri: 'http://127.0.0.1:43123/callback',
    });
  });

  it('rejects an unknown auth option instead of treating it as a scope', async () => {
    const cmd = buildMcpSlashCommand({ mcpRegistry: loginRegistry(), events } as never);

    const res = await cmd.run('auth login notion --oops');

    expect(res?.message).toContain('Unknown MCP auth option "--oops"');
  });
});
