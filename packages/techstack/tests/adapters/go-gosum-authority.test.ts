import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoAdapter } from '../../src/adapters/go.js';
import type { DependencyObservation, Workspace } from '../../src/types.js';

/**
 * CHARACTERIZATION (no defect found — this pins verified-correct behavior).
 *
 * `parseGoSum` IS name-keyed and first-occurrence-wins, which is the same shape
 * that caused real instance loss in the pnpm path (fixed in round r8). Here it
 * is harmless, and this suite is what proves it stays harmless:
 *
 *  - `locked`/`requested` come from go.mod's `require` line, never from go.sum
 *    (GoAdapter#inventory computes `locked` from `req.version`).
 *  - `parseGoSum`'s map is consulted ONLY via `.has()` for lockfile evidence
 *    presence, so its stored value can never alter a reported version.
 *  - Go's MVS build list holds exactly ONE version per module path, so unlike
 *    npm/rust there is no second instance to lose.
 *
 * The decisive case is an ORDER swap: go.sum lists a non-selected version FIRST.
 * If the first-wins value were ever load-bearing, `locked` would become it.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

const GO_MOD = [
  'module github.com/example/demo',
  '',
  'go 1.21',
  '',
  'require (',
  '\tgithub.com/gorilla/mux v1.8.1',
  '\tgolang.org/x/net v0.30.0',
  ')',
  '',
].join('\n');

// Two instances of ONE module: a non-selected version first, then the
// go.mod-selected one. first-occurrence-wins would yield v1.7.4 here.
const NON_SELECTED_FIRST = [
  'github.com/gorilla/mux v1.7.4 h1:nonSelected=',
  'github.com/gorilla/mux v1.7.4/go.mod h1:nonSelectedMod=',
  'github.com/gorilla/mux v1.8.1 h1:selected=',
  'github.com/gorilla/mux v1.8.1/go.mod h1:selectedMod=',
  'golang.org/x/net v0.30.0 h1:net=',
  'golang.org/x/net v0.30.0/go.mod h1:netMod=',
  '',
].join('\n');

const SELECTED_FIRST = [
  'github.com/gorilla/mux v1.8.1 h1:selected=',
  'github.com/gorilla/mux v1.8.1/go.mod h1:selectedMod=',
  'github.com/gorilla/mux v1.7.4 h1:nonSelected=',
  'github.com/gorilla/mux v1.7.4/go.mod h1:nonSelectedMod=',
  'golang.org/x/net v0.30.0 h1:net=',
  'golang.org/x/net v0.30.0/go.mod h1:netMod=',
  '',
].join('\n');

async function inventory(goSum?: string): Promise<readonly DependencyObservation[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-authority-'));
  temps.push(dir);
  const goModPath = path.join(dir, 'go.mod'); // ABSOLUTE — relative yields []
  await fs.writeFile(goModPath, GO_MOD, 'utf8');
  if (goSum !== undefined) await fs.writeFile(path.join(dir, 'go.sum'), goSum, 'utf8');
  const workspace: Workspace = {
    id: 'ws-test',
    relativeRoot: dir,
    ecosystem: 'go',
    manifests: [goModPath],
    lockfiles: [],
    confidence: 0.9,
    coverage: 'full',
  };
  return new GoAdapter().inventory(workspace, {});
}

const row = (rows: readonly DependencyObservation[], name: string) =>
  rows.find((r) => r.name === name);

describe('go: go.mod is authoritative over go.sum entry order', () => {
  it('reports the go.mod-selected version when go.sum lists another first', async () => {
    const rows = await inventory(NON_SELECTED_FIRST);
    const mux = row(rows, 'github.com/gorilla/mux');

    expect(mux).toBeDefined();
    expect(mux?.locked).toBe('1.8.1');
    expect(mux?.requested).toBe('1.8.1');
    expect(mux?.purl).toBe('pkg:golang/github.com/gorilla/mux@1.8.1');
  });

  it('produces identical observations for either go.sum ordering', async () => {
    const shape = (rows: readonly DependencyObservation[]) =>
      rows.map(
        (r) =>
          `${r.name}@${r.locked} requested=${r.requested} purl=${r.purl} evid=${r.evidence
            .map((e) => e.kind)
            .join('|')}`,
      );

    expect(shape(await inventory(NON_SELECTED_FIRST))).toEqual(
      shape(await inventory(SELECTED_FIRST)),
    );
  });

  it('emits exactly one row per required module', async () => {
    const rows = await inventory(NON_SELECTED_FIRST);
    expect(rows.filter((r) => r.name === 'github.com/gorilla/mux')).toHaveLength(1);
    expect(rows.filter((r) => r.name === 'golang.org/x/net')).toHaveLength(1);
  });

  // CONTROL: go.sum presence still attaches lockfile evidence.
  it('CONTROL: go.sum contributes lockfile evidence', async () => {
    const mux = row(await inventory(NON_SELECTED_FIRST), 'github.com/gorilla/mux');
    expect(mux?.evidence.some((e) => e.kind === 'lockfile')).toBe(true);
  });

  // CONTROL: with no go.sum the manifest alone still resolves, unchanged.
  it('CONTROL: resolves without a go.sum', async () => {
    const rows = await inventory();
    const mux = row(rows, 'github.com/gorilla/mux');
    expect(mux?.locked).toBe('1.8.1');
    expect(mux?.evidence.some((e) => e.kind === 'lockfile')).toBe(false);
  });
});
