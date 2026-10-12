import * as os from 'node:os';
import { expect, it } from 'vitest';
import { handleAcpTerminalRequest } from '../src/client/acp-session-callbacks.js';
import { makePermissionPolicy } from '../src/client/permission.js';
import { TerminalServer } from '../src/client/terminal-server.js';

// Regression (audit 2026-10-12, F451): terminal/create asked the permission
// policy to approve a command whose title/rawInput omitted the agent-supplied
// env, while the spawned process received it — approving "git status" also
// approved hidden GIT_CONFIG_* / npm_config_* / BASH_ENV entries.

it('names the env it will apply in the terminal/create permission request', async () => {
  const server = new TerminalServer({ projectRoot: os.tmpdir() });
  const seen: Array<{ title: string | undefined; rawInput: unknown }> = [];
  const results: unknown[] = [];
  try {
    await handleAcpTerminalRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'terminal/create',
        params: {
          sessionId: 's',
          command: process.execPath,
          args: ['-e', 'process.stdout.write(String(process.env.ACP_ENV_PROBE))'],
          env: [{ name: 'ACP_ENV_PROBE', value: 'probe-value' }],
        },
      } as never,
      server,
      makePermissionPolicy((req) => {
        seen.push({ title: req.toolCall.title, rawInput: req.toolCall.rawInput });
        return true;
      }),
      {
        sendResult: async (_id: unknown, result: unknown) => {
          results.push(result);
        },
        sendErrorResponse: async () => {},
      } as never,
    );
    expect(seen[0]?.title).toContain('(env: ACP_ENV_PROBE=probe-value)');
    expect(seen[0]?.rawInput).toMatchObject({
      env: [{ name: 'ACP_ENV_PROBE', value: 'probe-value' }],
    });
    const { terminalId } = results[0] as { terminalId: string };
    await server.waitForExit(terminalId);
    expect(server.output(terminalId).output).toBe('probe-value');
  } finally {
    server.dispose();
  }
});
