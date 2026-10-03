import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubcommandDeps } from '../../src/subcommands/contracts.js';
import { automationCmd } from '../../src/subcommands/handlers/automation.js';
import { runSandboxCommand } from '../../src/subcommands/handlers/sandbox.js';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    if (
      path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) ||
      !/^wrongstack-(?:preview|sandbox-preview)-/.test(path.basename(dir))
    )
      throw new Error('Refusing cleanup outside the owned fixture');
    await rm(dir, { recursive: true, force: true });
  }
});
describe('headless dry run commands', () => {
  it('previews an existing encrypted profile reference without decrypting or persisting a job', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-preview-'));
    directories.push(dir);
    const profile = path.join(dir, 'profile.json');
    await writeFile(
      profile,
      JSON.stringify({
        providers: {
          team: {
            type: 'openai',
            apiKeys: [{ label: 'work', apiKey: 'encrypted-fixture-private-value' }],
          },
        },
      }),
    );
    const write = vi.fn();
    const decrypt = vi.fn();
    const deps = {
      renderer: { write },
      projectRoot: dir,
      paths: { profileName: 'default', profileConfig: () => profile },
      vault: { decrypt },
      flags: {
        name: 'fixture',
        image: 'trusted:1',
        prompt: 'Review',
        credential: 'OPENAI_API_KEY=team/work',
        'data-dir': path.join(dir, 'state'),
        cron: '0 9 * * 1-5',
        timezone: 'Europe/Istanbul',
      },
    } as unknown as SubcommandDeps;
    expect(await automationCmd(['preview'], deps)).toBe(0);
    const output = write.mock.calls.map(([text]) => text).join('');
    expect(output).toContain('read-at-use');
    expect(output).toContain('nextRunTimes');
    expect(output).not.toContain('encrypted-fixture-private-value');
    expect(decrypt).not.toHaveBeenCalled();
    await expect(readFile(path.join(dir, 'state', 'jobs.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('previews a sandbox without exporting a patch or creating an output directory', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-sandbox-preview-'));
    directories.push(dir);
    const write = vi.fn();
    expect(
      await runSandboxCommand(
        ['docker'],
        { image: 'trusted:1', prompt: 'Review', out: path.join(dir, 'out'), 'dry-run': true },
        { write } as never,
      ),
    ).toBe(0);
    expect(write.mock.calls.map(([text]) => text).join('')).toContain('--max-iterations');
    await expect(readFile(path.join(dir, 'out', 'run.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
