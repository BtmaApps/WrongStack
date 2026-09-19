import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  initialize: vi.fn(async () => undefined),
  serveStdio: vi.fn(),
}));

vi.mock('@wrongstack/core/coordination', async (original) => ({
  ...(await original()),
  createProjectMailbox: vi.fn(() => ({
    close: mocks.close,
    initialize: mocks.initialize,
  })),
  resolveProjectDir: vi.fn(() => 'project-state'),
}));

vi.mock('@wrongstack/core/utils', async (original) => ({
  ...(await original()),
  canonicalProjectRoot: vi.fn((root: string) => root),
  wstackGlobalRoot: vi.fn(() => 'global-state'),
}));

vi.mock('@wrongstack/mcp', async (original) => ({
  ...(await original()),
  serveStdio: mocks.serveStdio,
}));

import { main } from '../src/cli.js';

describe('Mailbox MCP CLI lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serveStdio.mockReturnValue({ done: Promise.reject(new Error('transport failed')) });
  });

  it('closes the Mailbox when the stdio transport fails', async () => {
    await expect(main(['--project-root', '.', '--actor', 'codex'])).rejects.toThrow(
      'transport failed',
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
