import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGit } from '../src/services/run-git.js';
import {
  buildCommitCommand,
  buildGitCommand,
  buildGitcheckCommand,
  buildPushCommand,
} from '../src/slash-commands/git.js';

describe('/git family', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-cmd-'));
    await runGit(['init'], tmpDir);
    await runGit(['config', 'user.email', 'test@example.com'], tmpDir);
    await runGit(['config', 'user.name', 'Test'], tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns help for unknown subcommand', async () => {
    const cmd = buildGitCommand({ cwd: tmpDir } as never);
    const res = await cmd.run('unknown');
    expect((res as { message?: string })?.message).toContain('Unknown subcommand');
  });

  it('shows branch and head as JSON', async () => {
    const cmd = buildGitCommand({ cwd: tmpDir } as never);
    const res = await cmd.run('branch --json');
    const payload = JSON.parse((res as { message?: string })?.message ?? '{}');
    expect(typeof payload.branch).toBe('string');
    expect(payload.head === null || typeof payload.head === 'string').toBe(true);
    expect((res as { metadata?: Record<string, unknown> })?.metadata?.['git']).toEqual(payload);
  });

  it('renders an overview in status mode', async () => {
    const cmd = buildGitCommand({ cwd: tmpDir } as never);
    const res = await cmd.run('status');
    expect((res as { message?: string })?.message).toContain('Git overview');
    expect((res as { message?: string })?.message).toContain('Branch:');
  });

  it('gitcheck returns empty in a clean repo', async () => {
    const cmd = buildGitcheckCommand({ cwd: tmpDir } as never);
    const res = await cmd.run('');
    expect((res as { message?: string })?.message).toBe('');
  });

  it('commit refuses when working tree is clean', async () => {
    const cmd = buildCommitCommand({ cwd: tmpDir, projectRoot: tmpDir } as never);
    const res = await cmd.run('');
    expect((res as { message?: string })?.message).toContain('Nothing to commit');
  });

  it('push reports no remote configured', async () => {
    const cmd = buildPushCommand({ cwd: tmpDir } as never);
    const res = await cmd.run('--dry-run');
    expect((res as { message?: string })?.message).toContain('No remote configured');
  });
  describe('what /commit and /push actually do', () => {
    const text = (res: unknown) =>
      ((res as { message?: string })?.message ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    async function seed(): Promise<void> {
      await runGit(['config', 'commit.gpgsign', 'false'], tmpDir);
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# r\n');
      await runGit(['add', '.'], tmpDir);
      await runGit(['commit', '-q', '-m', 'init'], tmpDir);
    }
    const subject = async () => (await runGit(['log', '-1', '--pretty=%s'], tmpDir)).stdout.trim();

    // The message was drafted from `git diff` (unstaged, tracked only) before
    // staging, so a new file committed as "feat: update" and the dry run
    // previewed "(no changes)".
    it('drafts the message and preview from what is committed, leaving the index alone on --dry-run', async () => {
      await seed();
      await fs.mkdir(path.join(tmpDir, 'src'));
      await fs.writeFile(path.join(tmpDir, 'src', 'login.ts'), 'export const login = 1;\n');
      const cmd = buildCommitCommand({ cwd: tmpDir, projectRoot: tmpDir } as never);

      const dry = text(await cmd.run('--dry-run'));
      expect(dry).toContain('feat(src): login.ts');
      expect(dry).toContain('src/login.ts');
      expect((await runGit(['status', '--porcelain'], tmpDir)).stdout).toContain('?? src/');

      await cmd.run('');
      expect(await subject()).toBe('feat(src): login.ts');
    });

    it('gives the LLM the staged diff, including new files', async () => {
      await seed();
      await fs.writeFile(path.join(tmpDir, 'new.ts'), 'export const fresh = 1;\n');
      let prompt = '';
      const llmProvider = {
        complete: async (req: { messages: Array<{ content: Array<{ text: string }> }> }) => {
          prompt = req.messages[0]?.content[0]?.text ?? '';
          return { content: [{ type: 'text', text: 'feat: add fresh' }] };
        },
      };
      const cmd = buildCommitCommand({
        cwd: tmpDir,
        projectRoot: tmpDir,
        llmProvider,
        llmModel: 'm',
      } as never);
      await cmd.run('');
      expect(prompt).toContain('export const fresh = 1;');
      expect(await subject()).toBe('feat: add fresh');
    });

    // `args.includes('-n')` matched "--no-llm": it was always a dry run.
    it('commits with --no-llm', async () => {
      await seed();
      await fs.appendFile(path.join(tmpDir, 'README.md'), 'more\n');
      const res = text(
        await buildCommitCommand({ cwd: tmpDir, projectRoot: tmpDir } as never).run('--no-llm'),
      );
      expect(res).toContain('Committed');
      expect(await subject()).not.toBe('init');
    });

    it('pushes to one remote when several exist, and reads flags as whole tokens', async () => {
      await seed();
      const bare = async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
        await runGit(['init', '-q', '--bare', dir], tmpDir);
        return dir;
      };
      const [origin, upstream] = [await bare(), await bare()];
      try {
        await runGit(['remote', 'add', 'origin', origin], tmpDir);
        await runGit(['remote', 'add', 'upstream', upstream], tmpDir);
        const push = buildPushCommand({ cwd: tmpDir } as never);
        expect(text(await push.run('--dry-run --follow-tags'))).not.toContain('(force)');
        const res = text(await push.run('--no-verify'));
        expect(res).toContain('Pushed to origin');
        const branch = (await runGit(['branch', '--show-current'], tmpDir)).stdout.trim();
        expect(
          (await runGit(['--git-dir', origin, 'branch', '--list', branch], tmpDir)).stdout,
        ).toContain(branch);
      } finally {
        await fs.rm(origin, { recursive: true, force: true });
        await fs.rm(upstream, { recursive: true, force: true });
      }
    });
  });
});
