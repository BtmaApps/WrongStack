/**
 * `wstack sage connect <client>` — plan the files that wire SAGE memory into
 * another coding agent.
 *
 * Each client gets two things in this project: an MCP server entry that runs
 * `wstack sage mcp --origin <name>` (attach-only: it serves memory while
 * WrongStack has the project open and never starts a daemon of its own), and
 * a skill/rule file telling the agent when to recall and how to propose.
 *
 * Everything here is pure: callers hand in a file reader and get back a list
 * of changes, so `--dry-run`, the real write and the tests share one path.
 * Only entries this tool owns are touched — one MCP server name, one skill
 * directory, one marked block — and a file that exists but does not parse is
 * refused rather than rewritten.
 */
import * as path from 'node:path';
import { toErrorMessage } from '@wrongstack/core/utils';

// Gemini CLI is gone (retired 2026-06-18 for Antigravity CLI), so it is not a target.
export const SAGE_CONNECT_TARGETS = ['claude-code', 'codex', 'cursor', 'antigravity'] as const;
export type SageConnectTarget = (typeof SAGE_CONNECT_TARGETS)[number];

export function isSageConnectTarget(value: string): value is SageConnectTarget {
  return (SAGE_CONNECT_TARGETS as readonly string[]).includes(value);
}

/** The guide pieces, injected so this module stays free of the MCP package. */
export interface SageConnectGuide {
  serverName: string;
  skillName: string;
  skillDescription: string;
  skillBody: string;
}

export interface SageLaunch {
  command: string;
  args: string[];
}

export interface ResolveSageLaunchOptions {
  /** `--command`: an explicit executable, used as written. */
  command?: string | undefined;
  platform?: NodeJS.Platform | undefined;
  /** Resolve a bare command on PATH; `null` when absent. */
  findOnPath: (cmd: string) => string | null;
}

/**
 * The command a client runs. Bare `wstack` keeps project files portable
 * between machines. On Windows an npm install is a `.cmd` shim, which a
 * client spawning without a shell cannot start, so it goes through `cmd /c`.
 */
export function resolveSageLaunch(
  client: string,
  opts: ResolveSageLaunchOptions,
): { launch: SageLaunch; warning?: string } {
  // `--origin`, not `--client`: the global parser reads `--client` as a
  // boolean and would drop the name.
  const serveArgs = ['sage', 'mcp', '--origin', client];
  const command = opts.command?.trim() || 'wstack';
  const resolved = opts.findOnPath(command);
  const platform = opts.platform ?? process.platform;
  const shim =
    platform === 'win32' && resolved !== null && /\.(cmd|bat)$/i.test(path.extname(resolved));
  const launch: SageLaunch = shim
    ? { command: 'cmd', args: ['/c', command, ...serveArgs] }
    : { command, args: serveArgs };
  if (resolved === null) {
    return {
      launch,
      warning: `"${command}" is not on PATH, so ${client} will fail to start the server. Install wstack globally or pass --command <path to wstack>.`,
    };
  }
  return { launch };
}

export type PlannedChangeAction = 'create' | 'update' | 'delete' | 'unchanged';

export interface PlannedChange {
  /** Absolute path. */
  path: string;
  action: PlannedChangeAction;
  /** New content for create/update. */
  content?: string | undefined;
  summary: string;
}

export interface SageConnectPlan {
  target: SageConnectTarget;
  changes: PlannedChange[];
  notes: string[];
}

export interface PlanSageConnectOptions {
  projectRoot: string;
  launch: SageLaunch;
  guide: SageConnectGuide;
  /** Current content, `undefined` when the file does not exist. */
  read: (absPath: string) => string | undefined;
}

const MANAGED_NOTE =
  '<!-- Managed by `wstack sage connect`; `wstack sage disconnect` removes it. -->';

interface TargetLayout {
  mcpFile: string;
  mcpFormat: 'json' | 'toml';
  guideFile: string;
  guideFormat: 'skill' | 'cursor-rule';
  notes: string[];
}

function layoutFor(target: SageConnectTarget, skillName: string): TargetLayout {
  switch (target) {
    case 'claude-code':
      return {
        mcpFile: '.mcp.json',
        mcpFormat: 'json',
        guideFile: path.join('.claude', 'skills', skillName, 'SKILL.md'),
        guideFormat: 'skill',
        notes: ['Claude Code asks once to approve project MCP servers from .mcp.json.'],
      };
    case 'codex':
      return {
        mcpFile: path.join('.codex', 'config.toml'),
        mcpFormat: 'toml',
        guideFile: path.join('.agents', 'skills', skillName, 'SKILL.md'),
        guideFormat: 'skill',
        notes: [
          'Codex reads a project .codex/config.toml only when the project is trusted; mark it trusted in Codex if the server does not appear.',
        ],
      };
    case 'cursor':
      return {
        mcpFile: path.join('.cursor', 'mcp.json'),
        mcpFormat: 'json',
        guideFile: path.join('.cursor', 'rules', `${skillName}.mdc`),
        guideFormat: 'cursor-rule',
        notes: ['Enable the server once in Cursor Settings > MCP if it starts disabled.'],
      };
    case 'antigravity':
      // CLI and IDE share both paths. The skill directory is the same one
      // Codex reads, so the two targets share one SKILL.md.
      return {
        mcpFile: path.join('.agents', 'mcp_config.json'),
        mcpFormat: 'json',
        guideFile: path.join('.agents', 'skills', skillName, 'SKILL.md'),
        guideFormat: 'skill',
        notes: [
          'If the server does not appear, add the `wstack sage connect print` JSON to ~/.gemini/config/mcp_config.json (some Antigravity CLI builds load MCP servers only from the global file).',
        ],
      };
  }
}

export function planSageConnect(
  target: SageConnectTarget,
  opts: PlanSageConnectOptions,
): SageConnectPlan {
  const layout = layoutFor(target, opts.guide.skillName);
  const mcpPath = path.join(opts.projectRoot, layout.mcpFile);
  const guidePath = path.join(opts.projectRoot, layout.guideFile);
  const mcpBefore = opts.read(mcpPath);
  const mcpAfter =
    layout.mcpFormat === 'json'
      ? setJsonMcpServer(mcpBefore, opts.guide.serverName, jsonEntry(target, opts.launch), mcpPath)
      : setTomlMcpServer(mcpBefore, opts.guide.serverName, opts.launch);
  const guideBefore = opts.read(guidePath);
  const guideAfter = renderGuide(layout.guideFormat, opts.guide);
  return {
    target,
    changes: [
      change(mcpPath, mcpBefore, mcpAfter, `MCP server "${opts.guide.serverName}"`),
      change(guidePath, guideBefore, guideAfter, guideSummary(layout.guideFormat)),
    ],
    notes: layout.notes,
  };
}

export function planSageDisconnect(
  target: SageConnectTarget,
  opts: Omit<PlanSageConnectOptions, 'launch'>,
): SageConnectPlan {
  const layout = layoutFor(target, opts.guide.skillName);
  const mcpPath = path.join(opts.projectRoot, layout.mcpFile);
  const guidePath = path.join(opts.projectRoot, layout.guideFile);
  const changes: PlannedChange[] = [];

  const mcpBefore = opts.read(mcpPath);
  if (mcpBefore !== undefined) {
    const after =
      layout.mcpFormat === 'json'
        ? removeJsonMcpServer(mcpBefore, opts.guide.serverName, mcpPath)
        : removeTomlMcpServer(mcpBefore, opts.guide.serverName);
    changes.push(removal(mcpPath, mcpBefore, after, `MCP server "${opts.guide.serverName}"`));
  }

  const guideBefore = opts.read(guidePath);
  // Codex and Antigravity read the same `.agents/skills` file: it stays while
  // another target that uses it is still connected.
  const sharedWith = SAGE_CONNECT_TARGETS.filter(
    (other) =>
      other !== target &&
      layoutFor(other, opts.guide.skillName).guideFile === layout.guideFile &&
      isSageConnected(other, opts),
  );
  if (guideBefore !== undefined) {
    if (sharedWith.length > 0) {
      changes.push({
        path: guidePath,
        action: 'unchanged',
        summary: `${guideSummary(layout.guideFormat)} (still used by ${sharedWith.join(', ')})`,
      });
    } else if (guideBefore.includes(MANAGED_NOTE)) {
      changes.push({
        path: guidePath,
        action: 'delete',
        summary: guideSummary(layout.guideFormat),
      });
    } else {
      changes.push({
        path: guidePath,
        action: 'unchanged',
        summary: `${guideSummary(layout.guideFormat)} (edited by hand; left in place)`,
      });
    }
  }
  return { target, changes, notes: [] };
}

function change(
  absPath: string,
  before: string | undefined,
  after: string,
  summary: string,
): PlannedChange {
  if (before === after) return { path: absPath, action: 'unchanged', summary };
  return {
    path: absPath,
    action: before === undefined ? 'create' : 'update',
    content: after,
    summary,
  };
}

/** A removal that empties a file deletes it; one that changes nothing is a no-op. */
function removal(absPath: string, before: string, after: string, summary: string): PlannedChange {
  if (after === before)
    return { path: absPath, action: 'unchanged', summary: `${summary} (not present)` };
  if (after.trim() === '' || after.trim() === '{}')
    return { path: absPath, action: 'delete', summary };
  return { path: absPath, action: 'update', content: after, summary };
}

function guideSummary(format: TargetLayout['guideFormat']): string {
  return format === 'skill' ? 'SAGE memory skill' : 'SAGE memory rule';
}

/** Whether `target`'s MCP file currently carries the SAGE server entry. */
export function isSageConnected(
  target: SageConnectTarget,
  opts: Pick<PlanSageConnectOptions, 'projectRoot' | 'guide' | 'read'>,
): boolean {
  const layout = layoutFor(target, opts.guide.skillName);
  const content = opts.read(path.join(opts.projectRoot, layout.mcpFile));
  if (content === undefined) return false;
  if (layout.mcpFormat === 'toml') {
    return content.split(/\r?\n/).some((line) => isOwnedTomlHeader(line, opts.guide.serverName));
  }
  try {
    const servers = (JSON.parse(content) as { mcpServers?: unknown }).mcpServers;
    return typeof servers === 'object' && servers !== null && opts.guide.serverName in servers;
  } catch {
    return false;
  }
}

function jsonEntry(target: SageConnectTarget, launch: SageLaunch): Record<string, unknown> {
  // Claude Code documents the explicit transport type; the others infer stdio
  // from `command` and some reject unknown keys, so they get the bare pair.
  return target === 'claude-code'
    ? { type: 'stdio', command: launch.command, args: launch.args }
    : { command: launch.command, args: launch.args };
}

// ── JSON ──────────────────────────────────────────────────────────────────

function parseJsonObject(content: string | undefined, absPath: string): Record<string, unknown> {
  if (content === undefined || content.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `${absPath} is not valid JSON (${toErrorMessage(error)}); fix it by hand, nothing was changed.`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${absPath} is not a JSON object; nothing was changed.`);
  }
  return parsed as Record<string, unknown>;
}

function serializeJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function setJsonMcpServer(
  content: string | undefined,
  name: string,
  entry: Record<string, unknown>,
  absPath: string,
): string {
  const root = parseJsonObject(content, absPath);
  const servers = root['mcpServers'];
  if (
    servers !== undefined &&
    (typeof servers !== 'object' || servers === null || Array.isArray(servers))
  ) {
    throw new Error(`${absPath}: "mcpServers" is not an object; nothing was changed.`);
  }
  const next = {
    ...root,
    mcpServers: { ...((servers as Record<string, unknown>) ?? {}), [name]: entry },
  };
  const serialized = serializeJson(next);
  // Unchanged entry in an otherwise hand-formatted file: keep the file as is.
  if (content !== undefined && serializeJson(root) === serialized) return content;
  return serialized;
}

export function removeJsonMcpServer(content: string, name: string, absPath: string): string {
  const root = parseJsonObject(content, absPath);
  const servers = root['mcpServers'];
  if (
    typeof servers !== 'object' ||
    servers === null ||
    Array.isArray(servers) ||
    !(name in servers)
  ) {
    return content;
  }
  const { [name]: _removed, ...rest } = servers as Record<string, unknown>;
  const next: Record<string, unknown> = { ...root };
  if (Object.keys(rest).length === 0) delete next['mcpServers'];
  else next['mcpServers'] = rest;
  return serializeJson(next);
}

// ── TOML (one owned table, edited as text) ────────────────────────────────

function tomlString(value: string): string {
  // JSON string escapes are valid TOML basic-string escapes.
  return JSON.stringify(value);
}

function isOwnedTomlHeader(line: string, name: string): boolean {
  const header = line.trim();
  const bare = `mcp_servers.${name}`;
  const quoted = `mcp_servers."${name}"`;
  return [bare, quoted].some((key) => header === `[${key}]` || header.startsWith(`[${key}.`));
}

/** Drop the owned table and its sub-tables; everything else is kept verbatim. */
function stripTomlTable(content: string, name: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^\s*\[/.test(line)) skipping = isOwnedTomlHeader(line, name);
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

export function setTomlMcpServer(
  content: string | undefined,
  name: string,
  launch: SageLaunch,
): string {
  const table = [
    `[mcp_servers.${name}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(', ')}]`,
  ].join('\n');
  const base = stripTomlTable(content ?? '', name).replace(/\s+$/, '');
  const next = base ? `${base}\n\n${table}\n` : `${table}\n`;
  if (content !== undefined && content.replace(/\r\n/g, '\n') === next) return content;
  return next;
}

export function removeTomlMcpServer(content: string, name: string): string {
  const stripped = stripTomlTable(content, name);
  if (stripped === content.replace(/\r\n/g, '\n')) return content;
  const trimmed = stripped.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n` : '';
}

// ── Guides ────────────────────────────────────────────────────────────────

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderGuide(format: TargetLayout['guideFormat'], guide: SageConnectGuide): string {
  const frontmatter =
    format === 'skill'
      ? [`name: ${guide.skillName}`, `description: ${yamlString(guide.skillDescription)}`]
      : [`description: ${yamlString(guide.skillDescription)}`, 'alwaysApply: false'];
  return ['---', ...frontmatter, '---', '', guide.skillBody.trimEnd(), '', MANAGED_NOTE, ''].join(
    '\n',
  );
}

/** `wstack sage connect print`: config for any MCP client, by hand. */
export function renderSageConnectSnippets(launch: SageLaunch, serverName: string): string {
  const json = JSON.stringify(
    { mcpServers: { [serverName]: { command: launch.command, args: launch.args } } },
    null,
    2,
  );
  return [
    'JSON (Claude Desktop, Cursor, Antigravity, Windsurf, most MCP clients):',
    json,
    '',
    'TOML (Codex):',
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(', ')}]`,
    '',
    'Start the client from the project root (or set its working directory to it):',
    'the server serves the memory of the WrongStack project it is launched in.',
  ].join('\n');
}
