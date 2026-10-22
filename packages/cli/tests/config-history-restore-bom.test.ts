/**
 * Regression (F526): restoreFromHistory revives a snapshot's masked secrets
 * from the live config. A config.json saved with a UTF-8 BOM (the runtime
 * loader accepts it) used to read as `{}`, so the restore wrote a config with
 * every API key deleted while reporting success. An unreadable config must be
 * refused instead, and `restoreLast` must read a BOM'd `.last`.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendHistory,
  backupCurrent,
  restoreFromHistory,
  restoreLast,
} from '../src/config-history.js';

const KEY = 'sk-ant-api03-REALKEYREALKEYREALKEY';
const older = { provider: 'anthropic', model: 'a', providers: { anthropic: { apiKey: KEY } } };
const newer = { ...older, model: 'b' };

let home: string;
let cfg: string;
const homeFn = () => home;
const readCfg = async () =>
  JSON.parse((await fs.readFile(cfg, 'utf8')).replace(/^﻿/, '')) as typeof older;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-ch-bom-'));
  cfg = path.join(home, 'config.json');
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe('config history restore with a BOM-saved config', () => {
  it('keeps the live API key when config.json has a BOM', async () => {
    const id = await appendHistory(newer, older, 'switch', homeFn, cfg);
    await fs.writeFile(cfg, `﻿${JSON.stringify(newer)}`);
    expect((await restoreFromHistory(id, homeFn, cfg)).ok).toBe(true);
    const restored = await readCfg();
    expect(restored.model).toBe('a');
    expect(restored.providers.anthropic.apiKey).toBe(KEY);
  });

  it('refuses, and leaves the file alone, when the live config is unreadable', async () => {
    const id = await appendHistory(newer, older, 'switch', homeFn, cfg);
    await fs.writeFile(cfg, '{ "provider": ');
    const result = await restoreFromHistory(id, homeFn, cfg);
    expect(result.ok).toBe(false);
    expect(await fs.readFile(cfg, 'utf8')).toBe('{ "provider": ');
  });

  it('restoreLast reads a .last copied from a BOM-saved config', async () => {
    await fs.writeFile(cfg, `﻿${JSON.stringify(older)}`);
    await backupCurrent(homeFn, cfg);
    await fs.writeFile(cfg, JSON.stringify(newer));
    expect((await restoreLast(homeFn, cfg)).ok).toBe(true);
    expect((await readCfg()).model).toBe('a');
  });
});
