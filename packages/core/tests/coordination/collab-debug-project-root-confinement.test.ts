import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CollabSession,
  resolveCollabTargetInsideRoot,
} from '../../src/coordination/collab-debug.js';
import { makeCollabDebugTool } from '../../src/coordination/director-collab-tools.js';
import { FleetBus } from '../../src/coordination/fleet-bus.js';
import { isSensitiveReadCall } from '../../src/security/permission-helpers.js';

/**
 * WS-2026-09-17-01 (security-check 2026-09-17).
 *
 * `collab_debug` read every expanded `targetPaths` entry and embedded the
 * contents in all three subagent prompts — i.e. straight out to the provider.
 * Its `execute(input)` signature never received `ctx`, so it could not consult
 * `allowOutsideProjectRoot`: a user who enabled `tools.restrictToProjectRoot`
 * got confinement on read/edit/grep/glob and none here.
 *
 * Traversal is exercised with a `..` segment rather than a symlink because
 * symlink creation needs elevation on Windows, which is where this repo is
 * primarily developed — a test that skips there would pin nothing. `realpath`
 * collapses both, so the same control is under assertion either way.
 */

const bareDirector = { id: 'd', sharedScratchpadPath: os.tmpdir() } as never;

describe('collab_debug honours project-root confinement', () => {
  let base: string;
  let root: string;
  let insideFile: string;
  let outsideFile: string;
  let traversalPath: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-confine-'));
    root = path.join(base, 'project');
    const outsideDir = path.join(base, 'elsewhere');
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    insideFile = path.join(root, 'in.ts');
    outsideFile = path.join(outsideDir, 'secret.txt');
    traversalPath = path.join(root, '..', 'elsewhere', 'secret.txt');
    await fs.writeFile(insideFile, 'export const a = 1;\n', 'utf8');
    await fs.writeFile(outsideFile, 'SUPER_SECRET=1\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true }).catch(() => undefined);
  });

  describe('resolveCollabTargetInsideRoot', () => {
    it('refuses a target outside the project root', async () => {
      expect(await resolveCollabTargetInsideRoot(outsideFile, root, false)).toBeNull();
    });

    it('refuses a target that escapes via a .. segment', async () => {
      expect(await resolveCollabTargetInsideRoot(traversalPath, root, false)).toBeNull();
    });

    it('allows a target inside the project root', async () => {
      expect(await resolveCollabTargetInsideRoot(insideFile, root, false)).not.toBeNull();
    });

    it('allows anything when allowOutsideProjectRoot is set (the shipped default)', async () => {
      expect(await resolveCollabTargetInsideRoot(outsideFile, root, true)).not.toBeNull();
    });

    it('enforces nothing when no project root is supplied', async () => {
      expect(await resolveCollabTargetInsideRoot(outsideFile, undefined, false)).not.toBeNull();
    });
  });

  describe('buildSnapshot — the read site', () => {
    it('refuses to read an out-of-root target', async () => {
      const session = new CollabSession(bareDirector, new FleetBus(), {
        targetPaths: [outsideFile],
        projectRoot: root,
        allowOutsideProjectRoot: false,
      });
      await expect(session.buildSnapshot()).rejects.toThrow(/refusing to read/);
    });

    it('never places out-of-root content in the snapshot it hands to subagents', async () => {
      const session = new CollabSession(bareDirector, new FleetBus(), {
        targetPaths: [outsideFile],
        projectRoot: root,
        allowOutsideProjectRoot: false,
      });
      await session.buildSnapshot().catch(() => undefined);
      const serialized = JSON.stringify(session.snapshot.files);
      expect(serialized).not.toContain('SUPER_SECRET');
    });

    it('still reads a target inside the project root', async () => {
      const session = new CollabSession(bareDirector, new FleetBus(), {
        targetPaths: [insideFile],
        projectRoot: root,
        allowOutsideProjectRoot: false,
      });
      const snapshot = await session.buildSnapshot();
      expect(snapshot.files).toHaveLength(1);
      expect(snapshot.files[0]?.content).toContain('export const a = 1;');
    });

    it('reads an out-of-root target when the session is unconfined', async () => {
      const session = new CollabSession(bareDirector, new FleetBus(), {
        targetPaths: [outsideFile],
        projectRoot: root,
        allowOutsideProjectRoot: true,
      });
      const snapshot = await session.buildSnapshot();
      expect(snapshot.files[0]?.content).toContain('SUPER_SECRET');
    });
  });

  describe('collab_debug tool', () => {
    const makeTool = () => {
      let spawned = false;
      const tool = makeCollabDebugTool({
        spawnCollab: async () => {
          spawned = true;
          throw new Error('spawnCollab must not run for a refused target');
        },
      } as never);
      return { tool, wasSpawned: () => spawned };
    };

    it('refuses an out-of-root target before spawning anything', async () => {
      const { tool, wasSpawned } = makeTool();
      const ctx = { projectRoot: root, allowOutsideProjectRoot: false } as never;
      await expect(
        tool.execute({ targetPaths: [outsideFile] }, ctx, undefined as never),
      ).rejects.toThrow(/outside the project root/);
      expect(wasSpawned()).toBe(false);
    });

    it('does not answer "does this out-of-root file exist?" differently per path', async () => {
      // Both the existing and the missing out-of-root path must produce the
      // same containment refusal; a divergence here is an existence oracle.
      const { tool } = makeTool();
      const ctx = { projectRoot: root, allowOutsideProjectRoot: false } as never;
      const missing = path.join(base, 'elsewhere', 'does-not-exist.txt');
      const errFor = async (p: string) =>
        await tool
          .execute({ targetPaths: [p] }, ctx, undefined as never)
          .then(() => 'resolved')
          .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

      const existing = await errFor(outsideFile);
      const absent = await errFor(missing);
      expect(existing).toMatch(/outside the project root/);
      expect(absent).toMatch(/outside the project root/);
    });

    it('declares fs.read so the sensitive-read gate can see it', () => {
      const { tool } = makeTool();
      expect(tool.capabilities).toContain('fs.read');
      // Composes with the plural-key fix: the gate now inspects `targetPaths`
      // AND recognises the tool as a reader, so a credential target prompts.
      expect(isSensitiveReadCall(tool, { targetPaths: ['/home/me/.aws/credentials'] })).toBe(true);
      expect(isSensitiveReadCall(tool, { targetPaths: ['src/index.ts'] })).toBe(false);
    });
  });
});
