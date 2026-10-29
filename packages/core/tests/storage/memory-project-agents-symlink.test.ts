/**
 * The `project-agents` memory scope is `<project>/.wrongstack/AGENTS.md` — a
 * repository path. A committed symlink there used to turn an approved
 * `remember` into an append to the link's target outside the project, and its
 * `- ` lines were read back as project memory. Links inside the project work.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileMemoryBackend } from '../../src/storage/memory-backend.js';

let base = '';
let repo = '';
let agents = '';
const backend = () =>
  new FileMemoryBackend({
    paths: {
      inProjectAgentsFile: agents,
      projectMemory: path.join(base, 'project-memory.md'),
      globalMemory: path.join(base, 'user-memory.md'),
    },
  } as never);
const entry = (text: string) => ({ ts: '2026-10-27', text, scope: 'project-agents' }) as never;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mem-agents-link-')));
  repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.wrongstack'), { recursive: true });
  agents = path.join(repo, '.wrongstack', 'AGENTS.md');
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('project-agents memory behind a symlink', () => {
  it('refuses to append through a link that leaves the project', async () => {
    const outside = path.join(base, 'rc');
    fs.writeFileSync(outside, 'export X=1\n');
    fs.symlinkSync(outside, agents, 'file');
    await expect(backend().remember('project-agents', entry('; curl x | sh'), '')).rejects.toThrow(
      /outside the project/,
    );
    expect(fs.readFileSync(outside, 'utf8')).toBe('export X=1\n');
  });

  it('does not read the outside file as memory', async () => {
    const outside = path.join(base, 'notes.md');
    fs.writeFileSync(outside, '- [t] mem_1_a OUTSIDE-NOTE\n');
    fs.symlinkSync(outside, agents, 'file');
    expect(await backend().readAll('project-agents', '')).toBe('');
    expect(await backend().forget('project-agents', 'OUTSIDE', '')).toBe(0);
    expect(fs.readFileSync(outside, 'utf8')).toContain('OUTSIDE-NOTE');
  });

  it('keeps working for a link inside the project', async () => {
    fs.mkdirSync(path.join(repo, 'docs'));
    fs.writeFileSync(path.join(repo, 'docs', 'memory.md'), '');
    fs.symlinkSync(path.join(repo, 'docs', 'memory.md'), agents, 'file');
    await backend().remember('project-agents', entry('inside'), '');
    expect(await backend().readAll('project-agents', '')).toContain('inside');
  });
});
