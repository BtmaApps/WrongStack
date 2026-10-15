/**
 * `wstack tools serve` — run the tool gateway as a REST service for an
 * external agent (see `tool-gateway-http.ts` for the routes and contract).
 *
 * The first stdout line is one JSON object a parent process can read:
 *   {"url":"http://127.0.0.1:53211/","token":"…","mode":"safe","tools":22}
 * `token` is present only when it was generated; pass your own through
 * WRONGSTACK_TOOLS_TOKEN to keep it out of the output. Everything else goes
 * to stderr. The server runs until SIGINT / SIGTERM.
 */
import { randomBytes } from 'node:crypto';
import { toErrorMessage } from '@wrongstack/core/utils';
import { parseToolsFlag, resolveServeHttpPort } from '../../mcp-serve.js';
import {
  createToolGateway,
  parseCapabilityGrants,
  resolveGatewayRegistry,
} from '../../tool-gateway.js';
import { serveToolGatewayHttp } from '../../tool-gateway-http.js';
import type { SubcommandDeps } from '../contracts.js';
import type { ToolsCliIo } from './tools-cli-args.js';

export async function serveToolsCommand(
  args: readonly string[],
  deps: SubcommandDeps,
  io: ToolsCliIo,
  waitForShutdown: () => Promise<void> = untilSignal,
): Promise<number> {
  const flags = deps.flags ?? {};
  let allow: string[];
  let port: number;
  try {
    allow = parseCapabilityGrants(flags['allow']);
    port = resolveServeHttpPort(flags);
  } catch (err) {
    io.stderr(`wstack tools serve: ${toErrorMessage(err)}\n`);
    return 2;
  }
  // `tools` is a BOOLEAN_FLAGS member: `--tools read,grep` arrives as `true`
  // plus a positional CSV. A flag without a list is an error, never "all".
  const whitelist = parseToolsFlag(flags, args);
  if (flags['tools'] !== undefined && whitelist === null) {
    io.stderr('wstack tools serve: --tools needs a comma-separated tool list\n');
    return 2;
  }
  const host = typeof flags['host'] === 'string' ? flags['host'] : '127.0.0.1';
  const envToken = process.env.WRONGSTACK_TOOLS_TOKEN?.trim();
  const flagToken = typeof flags['token'] === 'string' ? flags['token'] : undefined;
  if (flagToken) {
    io.stderr(
      'wstack tools serve: --token puts the token on the command line, where other local ' +
        'processes can read it. Prefer WRONGSTACK_TOOLS_TOKEN.\n',
    );
  }
  const generated = !flagToken && !envToken;
  const token = flagToken ?? envToken ?? randomBytes(24).toString('hex');

  const registry = resolveGatewayRegistry(deps.toolRegistry, deps.config);
  const gateway = await createToolGateway({
    registry,
    config: deps.config,
    cwd: deps.cwd,
    projectRoot: deps.projectRoot,
    yolo: flags['yolo'] === true || flags['allow-all'] === true,
    allow,
    whitelist,
    remoteAgent: true,
    onWarning: (message) => io.stderr(`wstack tools serve: ${message}\n`),
  });
  try {
    const handle = await serveToolGatewayHttp({
      gateway,
      registry,
      token,
      port,
      host,
      allowRemoteCallbacks: flags['allow-remote-callbacks'] === true,
      log: (message) => io.stderr(`${message}\n`),
    });
    io.stdout(
      `${JSON.stringify({
        url: handle.url,
        ...(generated ? { token } : {}),
        mode: gateway.mode,
        tools: gateway.tools.length,
      })}\n`,
    );
    io.stderr(
      `wstack tools serve: ${gateway.tools.length} tool(s) at ${handle.url} (${gateway.mode}). ` +
        'GET /v1/tools, POST /v1/tools/<name>/call with Authorization: Bearer <token>.\n',
    );
    await waitForShutdown();
    await handle.close();
    return 0;
  } catch (err) {
    io.stderr(`wstack tools serve: ${toErrorMessage(err)}\n`);
    return 1;
  } finally {
    await gateway.close();
  }
}

function untilSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
}
