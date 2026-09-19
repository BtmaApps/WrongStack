import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(async () => undefined),
  initialize: vi.fn(async () => {
    throw new Error('connect failed');
  }),
}));

vi.mock('@wrongstack/sage', async (original) => ({
  ...(await original()),
  ProjectSageMemoryPort: class {
    initialize = mocks.initialize;
    dispose = mocks.dispose;
  },
}));

import { main } from '../src/cli.js';

describe('SAGE MCP CLI lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disposes the IPC port when initialization fails', async () => {
    await expect(main(['--project-root', '.'])).resolves.toBe(3);
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
