import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectIndexServerMetadataPath } from '../src/codebase-index/project-server-endpoint.js';
import {
  forceKillKnownServer,
  forceKillServer,
  type ProjectServerLaunchHost,
} from '../src/codebase-index/project-server-launch.js';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function host(): ProjectServerLaunchHost {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'server-launch-'));
  roots.push(projectRoot);
  return {
    endpoint: path.join(projectRoot, 'server.sock'),
    projectRoot,
    indexDir: path.join(projectRoot, '.index'),
    info: null,
    forceKillServer: vi.fn(() => true),
  };
}

describe('project server launch ownership', () => {
  it('only delegates a known server PID', () => {
    const owner = host();
    expect(forceKillKnownServer(owner)).toBe(false);
    owner.info = { pid: 12345 } as ProjectServerLaunchHost['info'];
    expect(forceKillKnownServer(owner)).toBe(true);
    expect(owner.forceKillServer).toHaveBeenCalledWith(12345);
  });

  it('refuses to kill this process', () => {
    const kill = vi.spyOn(process, 'kill');
    expect(forceKillServer(host(), process.pid)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
  });

  it('removes metadata only when it still belongs to the killed PID', () => {
    const owner = host();
    const metadataPath = projectIndexServerMetadataPath(owner.projectRoot, owner.indexDir);
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    fs.writeFileSync(metadataPath, JSON.stringify({ pid: 456 }));
    expect(forceKillServer(owner, 123)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    fs.writeFileSync(metadataPath, JSON.stringify({ pid: 123 }));
    expect(forceKillServer(owner, 123)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(false);
    expect(kill).toHaveBeenCalledTimes(2);
  });
});
