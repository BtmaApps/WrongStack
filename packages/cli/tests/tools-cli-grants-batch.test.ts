import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolRegistry } from '@wrongstack/core/registry';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { builtinToolsPack } from '@wrongstack/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import { runToolsCli, type ToolsCliIo } from '../src/subcommands/handlers/tools-cli.js';
import { parseBatchLines, parseSchemaArgs } from '../src/subcommands/handlers/tools-cli-args.js';
import { parseCapabilityGrants } from '../src/tool-gateway.js';

/** The exit codes are the machine contract — pinned as literals, not imported. */
const EXIT = { ok: 0, toolFailed: 1, usage: 2, notExposed: 3, confirmRequired: 4 };

let root: string;
let outside: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tools-grant-root-')));
  outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tools-grant-outside-')));
  await fs.writeFile(path.join(root, 'hello.txt'), 'line one\nline two\nline three\n');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

function capture(stdin = ''): ToolsCliIo & { out: string; err: string } {
  const io = {
    out: '',
    err: '',
    stdout: (t: string) => {
      io.out += t;
    },
    stderr: (t: string) => {
      io.err += t;
    },
    readStdin: async () => stdin,
  };
  return io;
}

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.registerAllOrThrow([...(builtinToolsPack.tools ?? [])], builtinToolsPack.name);
  return r;
}

/** Run `wstack tools <argv…>` through the real top-level parser, as the dispatcher does. */
async function wstackTools(argv: string[], io: ToolsCliIo): Promise<number> {
  const parsed = parseArgs(['tools', ...argv]);
  const [verb = '', ...rest] = parsed.positional.slice(1);
  const deps = {
    config: { tools: {}, features: {} },
    toolRegistry: registry(),
    cwd: root,
    projectRoot: root,
    flags: parsed.flags,
    renderer: {},
  } as never;
  return runToolsCli(verb, rest, deps, io);
}

describe('--allow capability grants', () => {
  it('rejects unknown and empty grants instead of granting nothing (or everything)', () => {
    expect(() => parseCapabilityGrants('fs.wirte')).toThrow(/unknown capability "fs.wirte"/);
    expect(() => parseCapabilityGrants(true)).toThrow(/needs a comma-separated/);
    expect(parseCapabilityGrants(undefined)).toEqual([]);
    expect(parseCapabilityGrants('fs.write, fs.write')).toEqual(['fs.write']);
  });

  it('a withheld tool names the capability it needs', async () => {
    const io = capture();
    expect(await wstackTools(['describe', 'write'], io)).toBe(EXIT.notExposed);
    expect(io.err).toContain('--allow fs.write');
  });

  it('--allow fs.write exposes write for in-project files only', async () => {
    const inside = capture();
    const code = await wstackTools(
      ['run', 'write', '--allow', 'fs.write', '--input', '{"path":"new.txt","content":"made"}'],
      inside,
    );
    expect(code, inside.err).toBe(EXIT.ok);
    expect(await fs.readFile(path.join(root, 'new.txt'), 'utf8')).toBe('made');

    const outsideIo = capture();
    const target = path.join(outside, 'escaped.txt');
    await wstackTools(
      [
        'run',
        'write',
        '--allow',
        'fs.write',
        `--input=${JSON.stringify({ path: target, content: 'x' })}`,
      ],
      outsideIo,
    );
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it('a grant does not widen past itself: fs.write still withholds bash', async () => {
    const io = capture();
    const code = await wstackTools(
      ['run', 'bash', '--allow', 'fs.write', '--input', '{"command":"echo hi"}'],
      io,
    );
    expect(code).toBe(EXIT.notExposed);
  });

  it('a typo in --allow is a usage error, not a silent read-only run', async () => {
    const io = capture();
    expect(await wstackTools(['list', '--allow', 'fs.wirte'], io)).toBe(EXIT.usage);
  });

  it("the user's deny rules bind gateway calls, even under --yolo", async () => {
    const trust = resolveWstackPaths({ projectRoot: root }).projectTrust;
    await fs.mkdir(path.dirname(trust), { recursive: true });
    await fs.writeFile(trust, JSON.stringify({ bash: { deny: ['echo *'] } }));
    try {
      const io = capture();
      const code = await wstackTools(
        ['run', 'bash', '--yolo', '--input', '{"command":"echo forbidden"}', '--json'],
        io,
      );
      expect(code).toBe(EXIT.notExposed);
      expect(JSON.parse(io.out)).toMatchObject({ ok: false, settlement: 'denied_by_policy' });
    } finally {
      await fs.rm(trust, { force: true });
    }
  });
});

describe('schema fields after --', () => {
  it('maps --field value onto the input schema, coercing numbers', async () => {
    const io = capture();
    const code = await wstackTools(
      ['run', 'read', '--', '--path', 'hello.txt', '--offset', '2', '--limit', '1'],
      io,
    );
    expect(code, io.err).toBe(EXIT.ok);
    expect(io.out).toContain('line two');
    expect(io.out).not.toContain('line three');
  });

  it('fields override the same keys from --input', async () => {
    const io = capture();
    const code = await wstackTools(
      ['run', 'read', '--input', '{"path":"missing.txt"}', '--', '--path', 'hello.txt'],
      io,
    );
    expect(code, io.err).toBe(EXIT.ok);
    expect(io.out).toContain('line one');
  });

  it('unknown fields, bad numbers and stray words are usage errors', async () => {
    for (const fields of [
      ['--nope', 'x'],
      ['--path', 'hello.txt', '--limit', 'abc'],
      ['hello.txt'],
      ['--path'],
    ]) {
      const io = capture();
      expect(await wstackTools(['run', 'read', '--', ...fields], io), fields.join(' ')).toBe(
        EXIT.usage,
      );
      expect(io.out).toBe('');
    }
  });

  it('coerces by declared type: booleans, negation, kebab names, arrays and objects', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        maxResults: { type: 'integer' as const },
        include_hidden: { type: 'boolean' as const },
        recursive: { type: 'boolean' as const },
        files: { type: 'array' as const, items: { type: 'string' as const } },
        options: { type: 'object' as const },
        ratio: { type: ['number', 'null'] as never },
      },
    };
    expect(
      parseSchemaArgs(
        [
          '--max-results',
          '5',
          '--include-hidden',
          '--no-recursive',
          '--files',
          'a.ts',
          '--files',
          'b.ts',
          '--options',
          '{"x":1}',
          '--ratio=0.5',
        ],
        schema,
      ),
    ).toEqual({
      maxResults: 5,
      include_hidden: true,
      recursive: false,
      files: ['a.ts', 'b.ts'],
      options: { x: 1 },
      ratio: 0.5,
    });
    expect(parseSchemaArgs(['--files', '["x","y"]'], schema)).toEqual({ files: ['x', 'y'] });
    expect(() => parseSchemaArgs(['--max-results', '1.5'], schema)).toThrow(/integer/);
    expect(() => parseSchemaArgs(['--recursive=maybe'], schema)).toThrow(/true or false/);
  });
});

describe('wstack tools batch', () => {
  it('runs every line in order in one process, echoing ids, and exits with the first failure', async () => {
    const io = capture(
      [
        '{"id":"a","tool":"read","input":{"path":"hello.txt","limit":1}}',
        '',
        '{"id":"b","tool":"write","input":{"path":"x.txt","content":"x"}}',
        '{not json',
        '{"id":"d","tool":"glob","input":{"pattern":"*.txt"}}',
      ].join('\n'),
    );
    const code = await wstackTools(['batch'], io);
    const lines = io.out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => l['line'])).toEqual([1, 3, 4, 5]);
    expect(lines[0]).toMatchObject({ id: 'a', ok: true, tool: 'read', settlement: 'completed' });
    expect(lines[1]).toMatchObject({ id: 'b', ok: false, error: 'not_exposed' });
    expect(lines[2]).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(lines[3]).toMatchObject({ id: 'd', ok: true, tool: 'glob' });
    expect(code).toBe(EXIT.notExposed);
    await expect(fs.stat(path.join(root, 'x.txt'))).rejects.toThrow();
  });

  it('reads calls from an @file and exits 0 when all pass', async () => {
    await fs.writeFile(
      path.join(root, 'calls.jsonl'),
      '{"tool":"tree"}\n{"tool":"read","input":{"path":"hello.txt"}}\n',
    );
    const io = capture();
    expect(await wstackTools(['batch', '--input', '@calls.jsonl'], io)).toBe(EXIT.ok);
    expect(io.out.trim().split('\n')).toHaveLength(2);
  });

  it('refuses a batch over 500 calls as a whole', () => {
    const many = Array.from({ length: 501 }, () => '{"tool":"tree"}');
    expect(() => parseBatchLines(many.join('\n'))).toThrow(/more than/);
  });
});
