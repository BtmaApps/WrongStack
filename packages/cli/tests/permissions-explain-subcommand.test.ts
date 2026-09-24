import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { permissionsCmd } from '../src/subcommands/handlers/permissions.js';

/**
 * `wstack permissions explain` must explain the policy the agent runs under.
 * It used to build a bare trust-file policy: no directory rules, YOLO only
 * from its own flag. With YOLO on in the config it called a write "confirm"
 * that the agent performed unasked, and it never mentioned a directory rule.
 */

const writeTool = {
  name: 'write',
  description: 'write',
  inputSchema: { type: 'object' },
  permission: 'confirm',
  mutating: true,
  async execute() {
    return 'ok';
  },
};
const bashTool = {
  ...writeTool,
  name: 'bash',
  capabilities: ['shell.arbitrary'],
  subjectKey: 'command',
};
const tools = [writeTool, bashTool];

describe('wstack permissions explain', () => {
  let root: string;
  let home: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'perm-explain-root-'));
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'perm-explain-home-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  async function explain(
    input: unknown,
    options: {
      yolo?: boolean;
      flags?: Record<string, string | boolean>;
      rules?: string;
      tool?: string;
      trust?: unknown;
    } = {},
  ) {
    if (options.trust !== undefined) {
      const trustFile = resolveWstackPaths({ projectRoot: root, userHome: home }).projectTrust;
      await fs.mkdir(path.dirname(trustFile), { recursive: true });
      await fs.writeFile(trustFile, JSON.stringify(options.trust));
    }
    if (options.rules !== undefined) {
      await fs.mkdir(path.join(root, '.wrongstack'), { recursive: true });
      await fs.writeFile(path.join(root, '.wrongstack', 'directory-rules.json'), options.rules);
    }
    let out = '';
    let err = '';
    const code = await permissionsCmd(['explain', options.tool ?? 'write'], {
      config: { provider: 'p', yolo: options.yolo } as never,
      renderer: {
        write: (s: string) => {
          out += s;
        },
        writeLine: (s: string) => {
          out += `${s}\n`;
        },
        writeError: (s: string) => {
          err += s;
        },
      } as never,
      toolRegistry: {
        get: (n: string) => tools.find((t) => t.name === n),
        list: () => tools,
      } as never,
      projectRoot: root,
      cwd: root,
      userHome: home,
      flags: { input: JSON.stringify(input), ...options.flags },
    } as never);
    return { code, out, err };
  }

  const rule = JSON.stringify({
    schemaVersion: 1,
    rules: [{ directory: 'secret', denyTools: ['write'] }],
  });

  it('takes YOLO from the config, as the agent does', async () => {
    const { code, out } = await explain({ path: 'notes.txt', content: 'x' }, { yolo: true });
    expect(code).toBe(0);
    expect(out).toContain('YOLO: on (config)');
    expect(out).toContain('Effective: auto (source: yolo)');
  });

  it('lets --yolo override the config', async () => {
    const { out } = await explain(
      { path: 'notes.txt', content: 'x' },
      { yolo: true, flags: { yolo: false } },
    );
    expect(out).toContain('YOLO: off (--yolo)');
    expect(out).toContain('Effective: confirm');
  });

  it('applies the project directory rules', async () => {
    const { out } = await explain(
      { path: 'secret/key.pem', content: 'x' },
      { yolo: true, rules: rule },
    );
    expect(out).toContain('Effective: deny (source: directory_rules)');
    expect(out).toMatch(/denyTools ← WINNER/);
    expect(out).toContain('Rule: #1 deny write → secret (directory-rules)');
  });

  it('shows the confirmation the executor adds to a trust-only allow', async () => {
    const { out } = await explain(
      { command: 'pnpm test' },
      { tool: 'bash', trust: { bash: { allow: ['pnpm *'] } } },
    );
    expect(out).toContain('Effective: confirm');
    expect(out).toMatch(/dangerous capability ← WINNER/);
    expect(out).toMatch(
      /Rule: #\d+ ask a tool with a dangerous capability → any input \(executor\)/,
    );
  });

  it('refuses to explain against a rule file the agent would refuse to start with', async () => {
    const { code, err } = await explain(
      { path: 'a.txt' },
      { rules: '{"schemaVersion":1,"rules":[{}]}' },
    );
    expect(code).toBe(1);
    expect(err).toContain('Invalid directory permission policy');
  });
});

describe('wstack permissions rules', () => {
  let root: string;
  let home: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'perm-rules-root-'));
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'perm-rules-home-'));
    const trustFile = resolveWstackPaths({ projectRoot: root, userHome: home }).projectTrust;
    await fs.mkdir(path.dirname(trustFile), { recursive: true });
    await fs.writeFile(trustFile, JSON.stringify({ bash: { allow: ['pnpm *'], deny: ['rm *'] } }));
    await fs.mkdir(path.join(root, '.wrongstack'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.wrongstack', 'directory-rules.json'),
      JSON.stringify({ schemaVersion: 1, rules: [{ directory: 'secret', denyTools: ['write'] }] }),
    );
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  async function rules(flags: Record<string, string | boolean> = {}) {
    let out = '';
    const code = await permissionsCmd(['rules'], {
      config: { provider: 'p' } as never,
      renderer: {
        write: (s: string) => {
          out += s;
        },
        writeLine: (s: string) => {
          out += `${s}\n`;
        },
        writeError: () => undefined,
      } as never,
      toolRegistry: { get: () => undefined, list: () => [] } as never,
      projectRoot: root,
      cwd: root,
      userHome: home,
      flags,
    } as never);
    return { code, out };
  }

  it('lists every rule in the order it is checked, the first match deciding', async () => {
    const { code, out } = await rules();
    expect(code).toBe(0);
    const at = (text: string) => out.indexOf(text);
    expect(at('deny  directory-rules write → secret')).toBeGreaterThan(-1);
    expect(at('deny  directory-rules')).toBeLessThan(at('deny  trust-file      bash → rm *'));
    expect(at('bash → rm *')).toBeLessThan(at('allow trust-file      bash → pnpm *'));
    expect(at('allow trust-file      bash → pnpm *')).toBeLessThan(
      at('ask   built-in        any tool → any input'),
    );
  });

  it('gives the numbered list as JSON', async () => {
    const { out } = await rules({ json: true });
    const list = JSON.parse(out) as Array<{ n: number; step: string }>;
    expect(list.map((r) => r.n)).toEqual(list.map((_, i) => i + 1));
    expect(list[0]).toMatchObject({ step: 'denyTools', source: 'directory-rules' });
  });
});
