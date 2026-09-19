#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalProjectRoot } from '@wrongstack/core/utils';
import { serveHttp, serveStdio } from '@wrongstack/mcp';
import { createRequirementIntakeMcpServer } from './adapter.js';
import { SERVER_INFO } from './version.js';

export interface ParsedArgs {
  projectRoot: string;
  transport: 'stdio' | 'http';
  httpPort: number;
  httpHost: string;
  httpToken?: string | undefined;
  writable: boolean;
  actor?: string | undefined;
  help: boolean;
}

export function printHelp(stdout: NodeJS.WriteStream): void {
  stdout.write(
    [
      `${SERVER_INFO.name} v${SERVER_INFO.version} — WrongStack Requirements Intake MCP server`,
      '',
      'Usage:',
      `  ${SERVER_INFO.name} --project-root <path> [options]`,
      '',
      'Options:',
      '  --project-root <path>   Project whose requirement intakes should be served (required).',
      '  --stdio                 Use stdio transport (default).',
      '  --http                  Use HTTP transport.',
      '  --port <n>              HTTP port (default 0 = ephemeral).',
      '  --host <h>              HTTP bind host (default 127.0.0.1).',
      '  --token <t>             Bearer token. Required for a non-loopback HTTP bind.',
      '                          Prefer WRONGSTACK_MCP_TOKEN — a command line is readable',
      '                          by other local processes (WS-064).',
      '  --actor <id>            Actor id recorded as the intake requester.',
      '  --writable              Expose requirement_intake_submit (filing records).',
      '  -h, --help              Show this message.',
    ].join('\n') + '\n',
  );
}

/**
 * Environment variable carrying the HTTP auth token (WS-064) — same contract
 * as the Kanban MCP server. The flag wins when both are given.
 */
const HTTP_TOKEN_ENV = 'WRONGSTACK_MCP_TOKEN';

export function parseArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ParsedArgs {
  const parsed: ParsedArgs = {
    projectRoot: '',
    transport: 'stdio',
    httpPort: 0,
    httpHost: '127.0.0.1',
    writable: false,
    help: false,
  };

  const warn = (event: string, message: string): void => {
    console.warn(
      JSON.stringify({ level: 'warn', event, message, timestamp: new Date().toISOString() }),
    );
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = (): string | undefined => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        warn('mcp_cli_flag_missing_value', `${arg} expects a value; ignoring it.`);
        return undefined;
      }
      index++;
      return next;
    };
    switch (arg) {
      case '--project-root': {
        const next = value();
        if (next !== undefined) parsed.projectRoot = path.resolve(next);
        break;
      }
      case '--stdio':
        parsed.transport = 'stdio';
        break;
      case '--http':
        parsed.transport = 'http';
        break;
      case '--port': {
        const next = value();
        if (next === undefined) break;
        const port = Number(next);
        if (Number.isInteger(port) && port >= 0 && port <= 65_535) parsed.httpPort = port;
        else warn('mcp_cli_invalid_port', `--port ${next} is not a valid port; using 0.`);
        break;
      }
      case '--host': {
        const next = value();
        if (next !== undefined) parsed.httpHost = next;
        break;
      }
      case '--token': {
        const next = value();
        if (next !== undefined) parsed.httpToken = next;
        break;
      }
      case '--actor': {
        const next = value();
        if (next !== undefined) parsed.actor = next;
        break;
      }
      case '--writable':
        parsed.writable = true;
        break;
      case '-h':
      case '--help':
        parsed.help = true;
        break;
      default:
        if (arg?.startsWith('-')) warn('mcp_cli_unknown_option', `unknown option ${arg} ignored.`);
        break;
    }
  }
  if (parsed.httpToken === undefined) {
    const fromEnv = env[HTTP_TOKEN_ENV]?.trim();
    if (fromEnv) parsed.httpToken = fromEnv;
  } else if (parsed.httpToken.length > 0) {
    console.warn(
      `[mcp] --token puts the auth token in this process's command line, which other ` +
        `local processes can read. Prefer ${HTTP_TOKEN_ENV}.`,
    );
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp(process.stdout);
    return 0;
  }
  if (!args.projectRoot) {
    process.stderr.write(`${SERVER_INFO.name}: --project-root is required\n`);
    printHelp(process.stderr);
    return 2;
  }

  const projectRoot = canonicalProjectRoot(args.projectRoot);
  const server = createRequirementIntakeMcpServer(projectRoot, {
    writable: args.writable,
    ...(args.actor ? { actor: args.actor } : {}),
  });
  const policyText = `writable=${String(args.writable)}`;

  if (args.transport === 'http') {
    const handle = await serveHttp(server, {
      port: args.httpPort,
      host: args.httpHost,
      ...(args.httpToken ? { token: args.httpToken } : {}),
      logger: { warn: (message) => process.stderr.write(`[requirement-intake-mcp] ${message}\n`) },
    });
    process.stderr.write(
      `${SERVER_INFO.name}: ready at ${handle.url} — projectRoot=${projectRoot} transport=http ${policyText}${
        args.httpToken ? ' [token auth]' : ''
      }\n`,
    );
    await new Promise<void>((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
    await handle.close();
    return 0;
  }

  const handle = serveStdio(server);
  process.stderr.write(
    `${SERVER_INFO.name}: ready on stdio — projectRoot=${projectRoot} transport=stdio ${policyText}\n`,
  );
  await handle.done;
  return 0;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  if (path.resolve(entry) === self) return true;
  try {
    return realpathSync(entry) === realpathSync(self);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${SERVER_INFO.name}: unexpected error\n`);
      process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.stderr.write('\n');
      process.exitCode = 1;
    },
  );
}
