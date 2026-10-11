import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bashTool } from '../src/bash.js';
import { mkSandbox, newSignal } from './fixtures.js';
import { runtimeFixtureCommand } from './shell-fixture-command.js';

const shells =
  process.platform === 'win32' ? [undefined, 'cmd', 'pwsh', 'powershell'] : [undefined];
afterEach(() => vi.unstubAllEnvs());

describe('runtime fixture command', () => {
  it.each(shells)('preserves paths and marker arguments with shell %s', async (shell) => {
    vi.stubEnv('WRONGSTACK_SHELL', shell);
    const sb = await mkSandbox();
    try {
      const dir = path.join(sb.dir, "fixture space ' Ω");
      await fs.mkdir(dir);
      const script = path.join(dir, "probe ' args.js");
      await fs.writeFile(script, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
      const args = ['wstack_orphan_fixture_marker', "marker space ' Ω"];
      const command = runtimeFixtureCommand(script, args);
      const out = await bashTool.execute({ command }, sb.ctx, { signal: newSignal() });
      expect(out.exit_code).toBe(0);
      expect(out.timed_out).toBe(false);
      expect(JSON.parse(out.output.trim())).toEqual(args);
    } finally {
      await sb.cleanup();
    }
  });
});
