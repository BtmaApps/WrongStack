// `/tuneup fix` rewrites the whole profile config, so it must hold the same
// file lock as every other writer. The fs seam intercepts tuneup's own read of
// config.json (the second one; the config-issue scan reads first): with the lock
// held the concurrent locked writer queues behind tuneup, otherwise it is
// awaited before tuneup gets its now-stale bytes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({
  armed: false,
  skip: 0,
  file: '',
  pending: undefined as Promise<unknown> | undefined,
  write: undefined as undefined | (() => Promise<unknown>),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    readFile: (async (file: unknown, ...rest: unknown[]) => {
      const out = await (real.readFile as (...a: unknown[]) => Promise<unknown>)(file, ...rest);
      if (gate.armed && String(file) === gate.file && gate.skip-- <= 0) {
        gate.armed = false;
        const lock = path.join(path.dirname(gate.file), `.${path.basename(gate.file)}.lock`);
        gate.pending = gate.write!();
        // Lock held by tuneup → the writer queues behind it; else let it land now.
        if (!existsSync(lock)) await gate.pending;
      }
      return out;
    }) as typeof real.readFile,
  };
});

const { updateJsonObjectFile } = await import('@wrongstack/core/utils');
const { buildTuneupCommand } = await import('../src/slash-commands/tuneup.js');

const updateCache = path.join(homedir(), '.wrongstack', 'update-cache.json');
let savedCache: string | null = null;
const dirs: string[] = [];
beforeEach(() => {
  savedCache = existsSync(updateCache) ? readFileSync(updateCache, 'utf8') : null;
  mkdirSync(path.dirname(updateCache), { recursive: true });
  writeFileSync(updateCache, JSON.stringify({ timestamp: Date.now(), latestVersion: '0.0.0' }));
});
afterEach(() => {
  if (savedCache !== null) writeFileSync(updateCache, savedCache);
  else if (existsSync(updateCache)) rmSync(updateCache);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function tuneupFix(concurrent: boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wstack-tuneup-lock-'));
  dirs.push(dir);
  const wsDir = path.join(dir, '.wrongstack');
  mkdirSync(wsDir, { recursive: true });
  const file = path.join(wsDir, 'config.json');
  const cfg = {
    autonomy: { defaultMode: 'off' },
    providers: { anthropic: { apiKey: 'sk-ant-OLD' } },
  };
  writeFileSync(file, JSON.stringify(cfg));
  const ctx = {
    projectRoot: dir,
    configStore: { get: () => cfg, update: () => undefined },
    paths: {
      globalConfig: file,
      profileConfig: () => file,
      globalMemory: path.join(wsDir, 'memory.md'),
      inProjectAgentsFile: path.join(dir, 'project', '.wrongstack', 'AGENTS.md'),
      projectTrust: path.join(wsDir, 'trust.json'),
    },
  };
  gate.file = file;
  gate.skip = 1;
  gate.pending = undefined;
  gate.write = () =>
    updateJsonObjectFile(file, (c) => {
      (c.providers as Record<string, unknown>).openai = { apiKey: 'sk-NEW-FROM-WEBUI' };
    });
  gate.armed = concurrent;
  await buildTuneupCommand(ctx as never).run!('fix');
  gate.armed = false;
  await gate.pending;
  const after = JSON.parse(readFileSync(file, 'utf8'));
  return {
    fixed: after.adaptiveConcurrency?.enabled === true,
    openai: after.providers?.openai?.apiKey as string | undefined,
  };
}

it('/tuneup fix keeps a locked config write that lands after its read', async () => {
  const control = await tuneupFix(false);
  expect(control.fixed).toBe(true);
  const raced = await tuneupFix(true);
  expect(raced.openai).toBe('sk-NEW-FROM-WEBUI');
  expect(raced.fixed).toBe(true);
});
