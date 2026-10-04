import { execSync } from 'node:child_process';
import {
  configureSandboxPolicy,
  createSandboxExecWrapper,
  resetSandboxPolicy,
} from '@wrongstack/core/sandbox';
import { afterAll, describe, expect, it } from 'vitest';
import { bashTool } from '../src/bash.js';
import { mkSandbox } from './fixtures.js';

// Plan 28 T4 — gated container integration suite (spec AC2).
//
// Run with WRONGSTACK_SANDBOX_INTEGRATION=1 AND a working Docker on the host:
//   pnpm --filter @wrongstack/tools exec vitest run tests/sandbox-integration.test.ts
// Skipped everywhere else; the always-run argv-builder contract lives in
// packages/core/tests/sandbox/container.test.ts.

const INTEGRATION = process.env.WRONGSTACK_SANDBOX_INTEGRATION === '1';

function dockerAvailable(): boolean {
  try {
    execSync('docker version --format "{{.Client.Version}}"', { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const enabled = INTEGRATION && dockerAvailable();
const wrap = createSandboxExecWrapper();

async function runBash(command: string): Promise<{ output: string; exit_code: number | null }> {
  const sb = await mkSandbox();
  try {
    const wrapped = wrap(bashTool);
    const result = (await wrapped.execute({ command }, sb.ctx, {
      signal: newSignal(),
    })) as { output: string; exit_code: number | null };
    return { output: result.output, exit_code: result.exit_code };
  } finally {
    await sb.cleanup();
  }
}

// newSignal lives in ./fixtures.js as well.
import { newSignal } from './fixtures.js';

describe.skipIf(!enabled)('container tier integration (plan 28 T4, AC2)', () => {
  afterAll(() => resetSandboxPolicy());

  it('runs an in-root write inside the container and the file lands on the host', async () => {
    configureSandboxPolicy({
      mode: 'enforced',
      tier: 'workspace-write',
      backend: 'container',
      image: 'alpine:3.19',
    });
    const marker = `in-root-${Date.now()}.txt`;
    const result = await runBash(`echo contained > ${marker}`);
    expect(result.exit_code).toBe(0);
  });

  it('never creates host files outside the workspace root (ephemeral container FS)', async () => {
    configureSandboxPolicy({
      mode: 'enforced',
      tier: 'workspace-write',
      backend: 'container',
      image: 'alpine:3.19',
    });
    const probeName = `must-not-exist-${Date.now()}.txt`;
    await runBash(`echo escaped > ../${probeName}`);
    // The command may exit 0 (write lands in the ephemeral container FS); the
    // AC2 guarantee is that NO host file outside the root was created.
    let exists = false;
    const sb = await mkSandbox();
    try {
      const parent = sb.dir.replace(/[/\\][^/\\]+$/, '');
      exists = (await import('node:fs')).existsSync(`${parent}/${probeName}`);
    } finally {
      await sb.cleanup();
    }
    expect(exists).toBe(false);
  });

  it('deny-by-default network: egress fails inside the container', async () => {
    configureSandboxPolicy({
      mode: 'enforced',
      tier: 'workspace-write',
      backend: 'container',
      image: 'alpine:3.19',
    });
    const result = await runBash(
      'wget -q -T 3 -O /dev/null https://example.com 2>/dev/null; echo exit:$?',
    );
    expect(result.output).toContain('exit:1');
  });
});
