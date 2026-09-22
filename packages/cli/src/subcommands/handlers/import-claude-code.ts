/**
 * `wstack import-claude-code [--apply] [--overwrite] [--enable-project-servers]`
 *
 * Brings a Claude Code setup across. Previews by default; `--apply` writes.
 *
 * Imported: MCP servers — user-level and this project's entries from
 * `~/.claude.json`, and the repository's `.mcp.json`. The repository file
 * ships with the code, so its servers (which run commands) arrive DISABLED
 * unless `--enable-project-servers` is given — the same trust line the
 * in-project config loader draws when it strips `mcpServers`.
 *
 * Reported, not imported: skills (already read in place from `.claude/skills`),
 * hooks and permission rules (different matcher semantics — a silently
 * mistranslated deny rule is worse than none), and CLAUDE.md files.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MCPServerConfig } from '@wrongstack/core/types';
import { readJsonObjectFile, setJsonPath, updateJsonObjectFile } from '@wrongstack/core/utils';
import { normalizeMcpServerEntry } from '../../boot/mcp-config-flag.js';
import { activeProfileConfigPath } from '../../profile-config-path.js';
import type { SubcommandHandler } from '../contracts.js';
import { restoreFlags } from '../flags.js';

export type McpImportSource = 'claude-user' | 'claude-project-local' | 'repository';

export interface McpImportCandidate {
  name: string;
  source: McpImportSource;
  config: Partial<MCPServerConfig>;
  action: 'add' | 'overwrite' | 'skip-exists' | 'skip-invalid';
  enabled: boolean;
  note?: string | undefined;
}

export interface ClaudeCodeImportPlan {
  mcp: McpImportCandidate[];
  notes: string[];
}

export interface ClaudeCodeSources {
  /** Parsed `~/.claude.json`, or undefined when absent. */
  userState?: Record<string, unknown> | undefined;
  /** Parsed `<project>/.mcp.json`, or undefined when absent. */
  projectMcp?: Record<string, unknown> | undefined;
  /** Settings files that exist, with their parsed content. */
  settings: Array<{ file: string; content: Record<string, unknown> }>;
  /** CLAUDE.md files that exist. */
  instructionFiles: string[];
  /** Skill directories that exist. */
  skillDirs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Claude keys projects by absolute path; spelling varies (slashes, drive case). */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const resolved = path.resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

function projectEntry(
  userState: Record<string, unknown> | undefined,
  projectRoot: string,
): Record<string, unknown> | undefined {
  const projects = userState?.['projects'];
  if (!isRecord(projects)) return undefined;
  for (const [key, value] of Object.entries(projects)) {
    if (isRecord(value) && samePath(key, projectRoot)) return value;
  }
  return undefined;
}

/** Decide what an import would do. Pure: no reads, no writes. */
export function planClaudeCodeImport(opts: {
  sources: ClaudeCodeSources;
  projectRoot: string;
  existingServers: Readonly<Record<string, unknown>>;
  overwrite: boolean;
  enableProjectServers: boolean;
}): ClaudeCodeImportPlan {
  const { sources } = opts;
  const mcp: McpImportCandidate[] = [];
  const seen = new Set<string>();

  const collect = (servers: unknown, source: McpImportSource): void => {
    if (!isRecord(servers)) return;
    for (const [name, raw] of Object.entries(servers)) {
      // First source wins, most specific first (see call order below).
      if (seen.has(name)) continue;
      seen.add(name);
      let config: Partial<MCPServerConfig>;
      try {
        config = normalizeMcpServerEntry(name, raw);
      } catch (err) {
        mcp.push({
          name,
          source,
          config: {},
          action: 'skip-invalid',
          enabled: false,
          note: (err as Error).message,
        });
        continue;
      }
      const exists = Object.hasOwn(opts.existingServers, name);
      const repository = source === 'repository';
      const enabled = !repository || opts.enableProjectServers;
      mcp.push({
        name,
        source,
        config,
        action: exists ? (opts.overwrite ? 'overwrite' : 'skip-exists') : 'add',
        enabled,
        ...(repository && !enabled
          ? { note: 'from the repository — imported disabled; review, then `/mcp enable`' }
          : {}),
      });
    }
  };

  collect(
    projectEntry(sources.userState, opts.projectRoot)?.['mcpServers'],
    'claude-project-local',
  );
  collect(sources.projectMcp?.['mcpServers'] ?? sources.projectMcp, 'repository');
  collect(sources.userState?.['mcpServers'], 'claude-user');

  const notes: string[] = [];
  if (sources.skillDirs.length > 0) {
    notes.push(
      `Skills: ${sources.skillDirs.join(', ')} — already loaded in place (skills.readClaudeSkills); nothing to copy.`,
    );
  }
  let hookCount = 0;
  let ruleCount = 0;
  for (const { content } of sources.settings) {
    const hooks = content['hooks'];
    if (isRecord(hooks)) {
      for (const list of Object.values(hooks)) if (Array.isArray(list)) hookCount += list.length;
    }
    const permissions = content['permissions'];
    if (isRecord(permissions)) {
      for (const key of ['allow', 'deny', 'ask']) {
        const list = permissions[key];
        if (Array.isArray(list)) ruleCount += list.length;
      }
    }
  }
  if (hookCount > 0) {
    notes.push(
      `Hooks: ${hookCount} found — not imported (matcher semantics differ). Recreate under config.hooks; see docs/hooks.md.`,
    );
  }
  if (ruleCount > 0) {
    notes.push(
      `Permission rules: ${ruleCount} found — not imported (a mistranslated deny is worse than none). Use /permissions or --allowed-tools/--disallowed-tools.`,
    );
  }
  for (const file of sources.instructionFiles) {
    notes.push(
      `Instructions: ${file} — not imported. Project context lives in .wrongstack/AGENTS.md; merge what applies there.`,
    );
  }
  return { mcp, notes };
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read everything the importer looks at. Missing files are simply absent. */
export async function readClaudeCodeSources(
  projectRoot: string,
  userHome: string = os.homedir(),
): Promise<ClaudeCodeSources> {
  const settingsFiles = [
    path.join(userHome, '.claude', 'settings.json'),
    path.join(projectRoot, '.claude', 'settings.json'),
    path.join(projectRoot, '.claude', 'settings.local.json'),
  ];
  const settings: ClaudeCodeSources['settings'] = [];
  for (const file of settingsFiles) {
    const content = await readJson(file);
    if (content) settings.push({ file, content });
  }
  const instructionCandidates = [
    path.join(userHome, '.claude', 'CLAUDE.md'),
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, '.claude', 'CLAUDE.md'),
  ];
  const skillCandidates = [
    path.join(userHome, '.claude', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
  ];
  return {
    userState: await readJson(path.join(userHome, '.claude.json')),
    projectMcp: await readJson(path.join(projectRoot, '.mcp.json')),
    settings,
    instructionFiles: (
      await Promise.all(instructionCandidates.map(async (f) => ((await exists(f)) ? f : null)))
    ).filter((f): f is string => f !== null),
    skillDirs: (
      await Promise.all(skillCandidates.map(async (d) => ((await exists(d)) ? d : null)))
    ).filter((d): d is string => d !== null),
  };
}

const SOURCE_LABEL: Record<McpImportSource, string> = {
  'claude-user': '~/.claude.json (user)',
  'claude-project-local': '~/.claude.json (this project)',
  repository: '.mcp.json (repository)',
};

export const importClaudeCodeCmd: SubcommandHandler = async (args, deps) => {
  args = restoreFlags(args, deps, ['apply', 'overwrite', 'enable-project-servers']);
  const apply = args.includes('--apply');
  const overwrite = args.includes('--overwrite');
  const enableProjectServers = args.includes('--enable-project-servers');

  let sources: ClaudeCodeSources;
  try {
    sources = await readClaudeCodeSources(deps.projectRoot, deps.userHome);
  } catch (err) {
    deps.renderer.writeError(`import-claude-code: ${(err as Error).message}`);
    return 1;
  }
  const configPath = activeProfileConfigPath(deps.paths, deps.config);
  const current = await readJsonObjectFile(configPath);
  const existingServers = isRecord(current['mcpServers']) ? current['mcpServers'] : {};
  const plan = planClaudeCodeImport({
    sources,
    projectRoot: deps.projectRoot,
    existingServers,
    overwrite,
    enableProjectServers,
  });

  const out = (line: string) => deps.renderer.write(`${line}\n`);
  out(apply ? 'Importing from Claude Code:' : 'Claude Code import preview (nothing written):');
  if (plan.mcp.length === 0) out('  MCP servers: none found');
  for (const c of plan.mcp) {
    const state = c.action.startsWith('skip') ? '' : c.enabled ? ' [enabled]' : ' [disabled]';
    const verb = {
      add: 'add',
      overwrite: 'overwrite',
      'skip-exists': 'skip (exists; --overwrite to replace)',
      'skip-invalid': 'skip (invalid)',
    }[c.action];
    out(`  MCP ${c.name} — ${verb}${state} — ${SOURCE_LABEL[c.source]}`);
    if (c.note) out(`      ${c.note}`);
  }
  for (const note of plan.notes) out(`  ${note}`);

  const writes = plan.mcp.filter((c) => c.action === 'add' || c.action === 'overwrite');
  if (!apply) {
    if (writes.length > 0)
      out(`\nRun with --apply to write ${writes.length} server(s) to ${configPath}.`);
    return 0;
  }
  if (writes.length > 0) {
    await updateJsonObjectFile(configPath, (config) => {
      for (const c of writes) {
        setJsonPath(config, ['mcpServers', c.name], { ...c.config, enabled: c.enabled });
      }
    });
  }
  out(`\nWrote ${writes.length} server(s) to ${configPath}.`);
  return 0;
};
