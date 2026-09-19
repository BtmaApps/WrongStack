/**
 * Per-site regression for the wave-2 dot-dot fix in the project watcher
 * (server/project-watcher.ts `shouldIgnore`): the escape test used a bare
 * `startsWith('..')`, so a legal in-root first segment like `..configs`
 * was treated as outside the project and its change events were dropped —
 * the UI silently stopped seeing edits in that subtree.
 *
 * Driven through the real watcher: a write inside `..configs/` must
 * produce a `files.tree.changed` broadcast (pre-fix it produced none),
 * while a write inside a heavyweight SKIP_DIR (read dynamically from
 * file-picker.ts) must not.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKIP_DIRS } from '../src/server/file-picker.js';
import { startProjectWatcher } from '../src/server/project-watcher.js';

describe('project watcher: in-root ..-prefixed subtrees are watched', () => {
  let projectDir: string;
  let dispose: (() => void) | undefined;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-watch-dotdot-'));
    await fs.mkdir(path.join(projectDir, '..configs'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '..configs', 'keep.json'), '{}', 'utf8');
  });

  afterEach(async () => {
    dispose?.();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('broadcasts changes inside ..configs and still skips heavyweight dirs', async () => {
    const broadcast = vi.fn();
    dispose = startProjectWatcher({
      projectRoot: projectDir,
      broadcast,
      clients: [{}],
    } as never);
    await fs.writeFile(path.join(projectDir, '..configs', 'other.json'), '{}', 'utf8');
    await vi.waitFor(() => expect(broadcast).toHaveBeenCalled(), {
      timeout: 10_000,
      interval: 100,
    });
    const seen = broadcast.mock.calls.length;

    const [skipDir] = [...SKIP_DIRS];
    expect(skipDir).toBeTruthy();
    await fs.mkdir(path.join(projectDir, skipDir!), { recursive: true });
    await fs.writeFile(path.join(projectDir, skipDir!, 'noise.bin'), 'x', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(broadcast.mock.calls.length).toBe(seen);
  });
});
