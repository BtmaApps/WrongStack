import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAndValidateWorkingDir } from '../../src/core/context-working-dir.js';

/**
 * The working directory (`set_working_dir`, the shell's cwd) is confined to the
 * same roots as the file tools: the project root AND the user-global
 * `~/.wrongstack`. Before, it allowed only the project root, so in restricted
 * mode the agent could write files under `~/.wrongstack` but not run a shell
 * there.
 */
describe('resolveAndValidateWorkingDir — ~/.wrongstack is always reachable', () => {
  let base: string;
  let project: string;
  let home: string;
  let outside: string;
  let savedHome: string | undefined;

  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-cwd-home-')));
    project = path.join(base, 'project');
    home = path.join(base, '.wrongstack');
    outside = path.join(base, 'outside');
    for (const dir of [project, path.join(home, 'profiles'), outside]) {
      await fs.mkdir(dir, { recursive: true });
    }
    savedHome = process.env['WRONGSTACK_HOME'];
    process.env['WRONGSTACK_HOME'] = home;
  });

  afterEach(async () => {
    if (savedHome === undefined) delete process.env['WRONGSTACK_HOME'];
    else process.env['WRONGSTACK_HOME'] = savedHome;
    await fs.rm(base, { recursive: true, force: true });
  });

  /** Directory link; a junction on Windows so no elevated privilege is needed. */
  async function linkDir(target: string, link: string): Promise<boolean> {
    try {
      await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      return true;
    } catch {
      return false;
    }
  }

  it('accepts the global root and anything under it in restricted mode', () => {
    expect(resolveAndValidateWorkingDir(home, project, false)).toBe(home);
    const profiles = path.join(home, 'profiles');
    expect(resolveAndValidateWorkingDir(profiles, project, false)).toBe(profiles);
  });

  it('still rejects other directories outside the project', () => {
    expect(() => resolveAndValidateWorkingDir(outside, project, false)).toThrow(
      /outside project root/,
    );
  });

  it('does not treat a name that merely starts with the root as inside it', async () => {
    const lookalike = `${home}-evil`;
    await fs.mkdir(lookalike);
    expect(() => resolveAndValidateWorkingDir(lookalike, project, false)).toThrow(
      /outside project root/,
    );
  });

  it('accepts an in-project link into the global root, like the file tools', async () => {
    const link = path.join(project, 'state');
    if (!(await linkDir(home, link))) return;
    expect(resolveAndValidateWorkingDir(link, project, false)).toBe(link);
  });

  it('rejects a link under the global root that escapes both roots', async () => {
    const link = path.join(home, 'escape');
    if (!(await linkDir(outside, link))) return;
    expect(() => resolveAndValidateWorkingDir(link, project, false)).toThrow(
      /resolves to .*outside project root/,
    );
  });
});
