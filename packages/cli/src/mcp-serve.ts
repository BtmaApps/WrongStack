/**
 * `wstack mcp serve` — run WrongStack itself as an MCP server over stdio.
 *
 * Exposes the built-in tool registry to any MCP client (Claude Desktop, another
 * agent, an IDE) through the shared tool gateway (`tool-gateway.ts`). stdout is
 * the JSON-RPC channel — every status/log line goes to stderr. By default a safe `AutoApprovePermissionPolicy` is used: read-only
 * tools are exposed, while shell/write/edit and dangerous-capability tools are
 * withheld. `--allow <caps>` grants named capabilities on top, `--yolo` grants
 * every capability; `--tools a,b,c` restricts the set.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toErrorMessage } from '@wrongstack/core/utils';
import {
  DEFAULT_MCP_INSERTION_MAX_BYTES,
  MCPServer,
  type MCPServerPrompt,
  type MCPServerResource,
  type MCPServerToolHost,
  serveHttp,
  serveStdio,
} from '@wrongstack/mcp';
import type { SubcommandDeps } from './subcommands/contracts.js';
import {
  createToolGateway,
  parseCapabilityGrants,
  resolveGatewayRegistry,
} from './tool-gateway.js';

/**
 * Resolve the `--tools` whitelist for `mcp serve`.
 *
 * `'tools'` is in BOOLEAN_FLAGS (a `models add` capability toggle), so
 * parseArgs turns the space form `mcp serve --tools read,grep` into
 * `tools: true` plus a positional CSV instead of a string value. Accept both
 * shapes: a string value directly, or `true` + the following positional CSV.
 * Returns null only when no list was supplied at all — callers must treat
 * "flag present but no list" as an error, never as "no whitelist".
 */
export function parseToolsFlag(
  flags: Record<string, string | boolean>,
  positional?: readonly string[],
): Set<string> | null {
  const raw = flags['tools'];
  const csv = typeof raw === 'string' ? raw : raw === true ? (positional?.[0] ?? '') : '';
  if (!csv) return null;
  const set = new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.size > 0 ? set : null;
}

/**
 * Resolve the TCP port for `mcp serve --http`.
 *
 * `--http` is also a boolean flag, and the old `Number(flags.port ?? flags.http)`
 * turned a bare `--http` into `Number(true) === 1` — the server tried to bind
 * privileged port 1 instead of an ephemeral one. A bare flag now means "pick a
 * free port" (0); an explicit value must be an integer in 0–65535.
 */
export function resolveServeHttpPort(flags: Record<string, string | boolean>): number {
  const raw =
    typeof flags['port'] === 'string'
      ? flags['port']
      : typeof flags['http'] === 'string'
        ? flags['http']
        : undefined;
  if (raw === undefined || raw.trim() === '') return 0;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`invalid --port "${raw}" — expected an integer between 0 and 65535`);
  }
  return port;
}

interface SelectedMcpServeContent {
  resources: MCPServerResource[];
  prompts: MCPServerPrompt[];
}

/** Load only files explicitly named by trusted CLI flags; nothing is auto-discovered. */
export async function loadSelectedMcpServeContent(
  flags: Record<string, string | boolean>,
  cwd: string,
): Promise<SelectedMcpServeContent> {
  const resources: MCPServerResource[] = [];
  const prompts: MCPServerPrompt[] = [];
  const resourceUris = new Set<string>();
  const promptNames = new Set<string>();
  for (const selected of commaSeparatedFlag(flags, 'resources')) {
    const file = path.resolve(cwd, selected);
    const data = await readSelectedFile(file);
    const uri = pathToFileURL(file).toString();
    if (resourceUris.has(uri)) throw new Error(`Duplicate MCP resource selection: ${selected}`);
    resourceUris.add(uri);
    const mimeType = mimeTypeFor(file);
    resources.push({
      uri,
      name: path.basename(file),
      mimeType,
      size: data.byteLength,
      contents: [
        isTextMime(mimeType)
          ? { uri, mimeType, text: data.toString('utf8') }
          : { uri, mimeType, blob: data.toString('base64') },
      ],
    });
  }
  for (const selected of commaSeparatedFlag(flags, 'prompts')) {
    const file = path.resolve(cwd, selected);
    const data = await readSelectedFile(file);
    const name = path
      .basename(file, path.extname(file))
      .replace(/[^A-Za-z0-9_.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!name) throw new Error(`Cannot derive an MCP prompt name from: ${selected}`);
    if (promptNames.has(name)) throw new Error(`Duplicate MCP prompt name: ${name}`);
    promptNames.add(name);
    const template = data.toString('utf8');
    const argumentNames = Array.from(
      template.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g),
      (match) => match[1],
    ).filter((value, index, all): value is string => !!value && all.indexOf(value) === index);
    prompts.push({
      name,
      description: `Explicitly selected local prompt: ${path.basename(file)}`,
      arguments: argumentNames.map((argument) => ({ name: argument, required: true })),
      template,
    });
  }
  return { resources, prompts };
}

function commaSeparatedFlag(
  flags: Record<string, string | boolean>,
  name: 'resources' | 'prompts',
): string[] {
  const value = flags[name];
  if (value === undefined) return [];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`--${name} requires a comma-separated file list`);
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readSelectedFile(file: string): Promise<Buffer> {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error(`Selected MCP content is not a regular file: ${file}`);
  if (stat.size > DEFAULT_MCP_INSERTION_MAX_BYTES) {
    throw new Error(
      `Selected MCP content exceeds ${DEFAULT_MCP_INSERTION_MAX_BYTES} bytes: ${file}`,
    );
  }
  return fs.readFile(file);
}

function mimeTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.md':
    case '.mdx':
      return 'text/markdown';
    case '.json':
      return 'application/json';
    case '.yaml':
    case '.yml':
      return 'application/yaml';
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
    case '.mjs':
      return 'text/javascript';
    case '.ts':
    case '.tsx':
      return 'text/typescript';
    case '.txt':
    case '.log':
      return 'text/plain';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/yaml'
  );
}

export async function serveMcpStdio(
  deps: SubcommandDeps,
  positional?: readonly string[],
): Promise<number> {
  const flags = deps.flags ?? {};
  const yolo = flags['yolo'] === true || flags['allow-all'] === true;
  const whitelist = parseToolsFlag(flags, positional);
  // `--tools` present but no list resolvable: fail loudly instead of silently
  // exposing the default (policy-filtered) toolset — a dropped whitelist is a
  // security-relevant widening, not a convenience fallback.
  if (flags['tools'] !== undefined && whitelist === null) {
    process.stderr.write(
      'wrongstack MCP server: --tools requires a comma-separated tool list ' +
        '(e.g. `--tools read,grep` or `--tools=read,grep`)\n',
    );
    return 1;
  }
  const log = (m: string) => process.stderr.write(`${m}\n`);
  let selectedContent: SelectedMcpServeContent;
  try {
    selectedContent = await loadSelectedMcpServeContent(flags, deps.cwd);
  } catch (err) {
    log(`wrongstack MCP server: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let allow: string[];
  try {
    allow = parseCapabilityGrants(flags['allow']);
  } catch (err) {
    log(`wrongstack MCP server: ${toErrorMessage(err)}`);
    return 1;
  }

  const gateway = await createToolGateway({
    registry: resolveGatewayRegistry(deps.toolRegistry, deps.config),
    config: deps.config,
    cwd: deps.cwd,
    projectRoot: deps.projectRoot,
    yolo,
    allow,
    whitelist,
  });
  const allowed = gateway.tools;

  if (allowed.length === 0) {
    log(
      'wrongstack MCP server: no tools to expose (all withheld by policy or filtered out). ' +
        'Pass --yolo to expose write/exec tools, or --tools <names> to whitelist.',
    );
  }

  const host: MCPServerToolHost = {
    listTools: () =>
      allowed.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      })),
    callTool: async (name, callArgs) => {
      const outcome = await gateway.call(name, callArgs);
      if (outcome.kind === 'not_exposed') {
        return { content: `Tool "${name}" is not exposed by this server`, isError: true };
      }
      if (outcome.kind === 'confirm_required') {
        return {
          content: `Tool "${name}" requires interactive confirmation, which is unavailable over MCP`,
          isError: true,
        };
      }
      return { content: outcome.content, isError: outcome.isError };
    },
  };

  const server = new MCPServer({
    host,
    resources: selectedContent.resources,
    prompts: selectedContent.prompts,
    logger: { warn: (m) => log(`[mcp-serve] ${m}`) },
  });

  const mode =
    gateway.mode === 'yolo'
      ? 'yolo: all tools'
      : gateway.mode === 'granted'
        ? `granted: ${gateway.capabilities.join(', ')}`
        : 'safe: read-only tools';

  // HTTP transport — network-reachable. Loopback by default; non-loopback
  // requires a token (enforced in serveHttp).
  if (
    flags['http'] === true ||
    typeof flags['http'] === 'string' ||
    flags['port'] ||
    flags['host']
  ) {
    let port: number;
    try {
      port = resolveServeHttpPort(flags);
    } catch (err) {
      log(`wrongstack MCP server: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    const httpHost = typeof flags['host'] === 'string' ? flags['host'] : '127.0.0.1';
    // Keep bearer credentials out of the process list where possible. The
    // standalone MCP packages use the same environment variable.
    const tokenFromArg = typeof flags['token'] === 'string' ? flags['token'] : undefined;
    const token = tokenFromArg ?? process.env.WRONGSTACK_MCP_TOKEN?.trim() ?? undefined;
    if (tokenFromArg) {
      log(
        '[mcp-serve] --token puts the auth token in this process command line, which other local ' +
          'processes can read. Prefer WRONGSTACK_MCP_TOKEN.',
      );
    }
    let handle: Awaited<ReturnType<typeof serveHttp>>;
    try {
      handle = await serveHttp(server, {
        port,
        host: httpHost,
        token,
        logger: { warn: (m) => log(`[mcp-serve] ${m}`) },
      });
    } catch (err) {
      log(`wrongstack MCP server: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    log(
      `wrongstack MCP server ready at ${handle.url} — exposing ${allowed.length} tool(s), ` +
        `${selectedContent.resources.length} resource(s), ${selectedContent.prompts.length} prompt(s) (${mode})` +
        `${token ? ' [token auth]' : ''}.`,
    );
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    await handle.close();
    await gateway.close();
    return 0;
  }

  log(
    `wrongstack MCP server ready on stdio — exposing ${allowed.length} tool(s), ` +
      `${selectedContent.resources.length} resource(s), ${selectedContent.prompts.length} prompt(s) (${mode}).`,
  );

  const handle = serveStdio(server);
  await handle.done;
  await gateway.close();
  return 0;
}
