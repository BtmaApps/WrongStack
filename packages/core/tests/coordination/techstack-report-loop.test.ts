import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startPackageOutdatedWatcher } from '../../src/coordination/package-outdated-watcher.js';
import { SqliteMailbox } from '../../src/coordination/sqlite-mailbox.js';

/**
 * Closes the last seam in the dep-watcher chain: the REPORT path.
 *
 * The consumer now instructs the audit agent to send `type: 'result'` to
 * `pkg-outdated-watcher`, and to `note` the leader. Before this was specified,
 * nothing named that recipient, so `startPackageOutdatedWatcher` — which polls
 * exactly `{ to: 'pkg-outdated-watcher', type: 'result' }` — never saw a thing.
 *
 * This test plays the agent's part (sends what the task tells it to send) and
 * asserts a real watcher consumes it and notifies the recorded author. It does
 * NOT invoke an LLM; it proves the delivery contract the prompt depends on.
 */

describe('tech-stack report delivery loop', () => {
  let dir: string;
  let mailbox: SqliteMailbox;
  let dispose: (() => void) | undefined;

  afterEach(async () => {
    dispose?.();
    dispose = undefined;
    await mailbox?.close().catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it('consumes a tech-stack result and notifies the recorded package author', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-report-'));
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
    mailbox = new SqliteMailbox(dir);

    // The agent that added `zod` is on record as the author.
    await mailbox.send({
      from: 'dep-watcher',
      to: 'tech-stack',
      type: 'assign',
      subject: 'Dependency added: zod@3.23.8 (package.json)',
      body: 'Manifest: package.json\n\nAdded packages (1):\n- zod@3.23.8 (dependencies)',
    });

    const notified: { to: string; body: string; subject: string }[] = [];

    dispose = startPackageOutdatedWatcher({
      mailbox,
      packageTrackerOpts: { storageDir: dir, projectRoot },
      pollIntervalMs: 50,
      onNotify: async (msg) => {
        notified.push({ to: msg.to, body: msg.body, subject: msg.subject });
      },
    });

    // Exactly what the spawned task tells the agent to emit: a 5-column table
    // addressed to the watcher.
    await mailbox.send({
      from: 'tech-stack@abc123',
      to: 'pkg-outdated-watcher',
      type: 'result',
      subject: 'TechStack audit: package.json',
      body: [
        '| Package | Current | Latest | Wanted | Manifest |',
        '|---|---|---|---|---|',
        '| zod | 3.23.8 | 3.25.76 | 3.23.8 | package.json |',
      ].join('\n'),
    });

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && notified.length === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(notified).toHaveLength(1);
    // Author unknown → broadcast, which is the documented fallback and keeps
    // the finding from being silently dropped.
    expect(notified[0]!.to).toBe('*');
    expect(notified[0]!.subject).toContain('zod');
    expect(notified[0]!.body).toContain('3.25.76');
  });

  it('rejects a result from a sender outside the tech-stack family', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-report-guard-'));
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
    mailbox = new SqliteMailbox(dir);

    const notified: string[] = [];
    dispose = startPackageOutdatedWatcher({
      mailbox,
      packageTrackerOpts: { storageDir: dir, projectRoot },
      pollIntervalMs: 50,
      onNotify: async (msg) => {
        notified.push(msg.to);
      },
    });

    // A peer agent trying to push attacker-chosen "outdated package" text.
    await mailbox.send({
      from: 'evil-peer',
      to: 'pkg-outdated-watcher',
      type: 'result',
      subject: 'totally real findings',
      body: '| Package | Current | Latest | Wanted | Manifest |\n|---|---|---|---|---|\n| x | 1 | 2 | 1 | package.json |',
    });

    await new Promise((r) => setTimeout(r, 600));

    expect(notified).toHaveLength(0);
  });
});
