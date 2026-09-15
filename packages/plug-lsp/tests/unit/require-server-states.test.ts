import { describe, expect, it } from 'vitest';
import { requireServer } from '../../src/tools/shared.js';
import { LSPErrorCode } from '../../src/types.js';

/**
 * `findForPath` returns null both when no server claims the language and when
 * the configured one is not ready; requireServer must tell those apart and
 * degrade to "not configured" when the registry cannot say which.
 */
const signal = new AbortController().signal;
const notFound = { findForPath: async () => null };

describe('requireServer', () => {
  it('returns the server findForPath resolves', async () => {
    const server = { name: 'ts' };
    await expect(
      requireServer({ findForPath: async () => server } as never, '/p/a.ts', signal),
    ).resolves.toBe(server);
  });

  it('names the configured server and its state when it is not ready', async () => {
    const registry = {
      ...notFound,
      languageIdForPath: () => 'typescript',
      list: () => [
        { name: 'py', state: 'ready', config: { languages: ['python'] } },
        { name: 'ts', state: 'starting', config: { languages: ['typescript'] } },
      ],
    };
    await expect(requireServer(registry as never, '/p/a.ts', signal)).rejects.toMatchObject({
      code: LSPErrorCode.ServerNotReady,
      message: expect.stringContaining('"ts" for typescript is starting'),
    });
  });

  it('reports not configured when no server claims the language', async () => {
    const registry = {
      ...notFound,
      languageIdForPath: () => 'rust',
      list: () => [{ name: 'ts', state: 'ready', config: { languages: ['typescript'] } }],
    };
    await expect(requireServer(registry as never, '/p/a.rs', signal)).rejects.toMatchObject({
      code: LSPErrorCode.ServerNotFound,
    });
  });

  it('reports not configured when the registry cannot resolve a language or list servers', async () => {
    await expect(requireServer(notFound as never, '/p/a.ts', signal)).rejects.toMatchObject({
      code: LSPErrorCode.ServerNotFound,
    });
    await expect(
      requireServer(
        { ...notFound, languageIdForPath: () => 'typescript' } as never,
        '/p/a.ts',
        signal,
      ),
    ).rejects.toMatchObject({ code: LSPErrorCode.ServerNotFound });
    await expect(
      requireServer(
        { ...notFound, languageIdForPath: () => null, list: () => [] } as never,
        '/p/x',
        signal,
      ),
    ).rejects.toMatchObject({ code: LSPErrorCode.ServerNotFound });
  });
});
