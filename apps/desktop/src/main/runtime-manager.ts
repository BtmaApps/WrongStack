import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TrustBoundary } from '@wrongstack/core/security';
import {
  atomicWrite,
  buildChildEnv,
  projectSlug,
  resolveWstackPaths,
  toErrorMessage,
} from '@wrongstack/core/utils';
import type {
  DesktopProjectEntry,
  DesktopRuntimeKind,
  DesktopRuntimeRecord,
  DesktopStateSnapshot,
  DesktopWindowState,
} from '../shared/types.js';
import {
  authorizeDesktopRuntimeStart,
  authorizeDesktopRuntimeStop,
  desktopCompatibilityTrustBoundary,
} from './desktop-privileged-actions.js';
import { resolveWebUiDistDir, resolveWebUiEntry } from './runtime-manager-paths.js';
import {
  appendRuntimeLog,
  type DesktopProjectSessionState,
  firstProjectRuntimeRoot,
  firstRunningRuntimeId,
  nextRuntimeName,
  normalizePathList,
  normalizeRuntimeId,
  normalizeSessionStateList,
  normalizeWindowState,
  publicRuntime,
  type RuntimeInternal,
  reclaimableRuntimeIds,
  runtimeToSessionState,
  usedPorts,
} from './runtime-manager-state.js';
import { findFreePort, terminateProcessTree, waitForHttpReady } from './runtime-process.js';
import {
  normalizeProjectEntries,
  pathKey,
  readGlobalProjectManifest,
  removeGlobalProjectManifest,
  samePath,
  touchGlobalProjectManifest,
} from './runtime-project-manifest.js';

export { reclaimableRuntimeIds, SNAPSHOT_LOG_LINES } from './runtime-manager-state.js';

interface DesktopStateFile {
  recentProjects?: DesktopProjectEntry[] | undefined;
  openProjects?: string[] | undefined;
  openProjectSessions?: DesktopProjectSessionState[] | undefined;
  activeRuntimeId?: string | null | undefined;
  activeProjectRoot?: string | null | undefined;
  window?: DesktopWindowState | undefined;
}

interface OpenProjectOptions {
  name?: string | undefined;
  kind?: DesktopRuntimeKind | undefined;
  touchRecent?: boolean | undefined;
  forceNew?: boolean | undefined;
  runtimeId?: string | undefined;
}

const HTTP_PORT_START = 34560;
const START_TIMEOUT_MS = 30_000;

/**
 * How long a project may sit untouched before its server process is reclaimed.
 *
 * Every open project holds a `webui-server` child (Electron's Node, via
 * ELECTRON_RUN_AS_NODE). Ten open projects are ten Node processes, and until
 * now they lived until the app quit or the user closed the project by hand.
 *
 * Reclaiming one is safe because a session's state is on disk, not in that
 * process: the project reappears in the sidebar as a stopped row and clicking
 * it starts a fresh runtime. Set `WRONGSTACK_DESKTOP_IDLE_MINUTES=0` to keep
 * every project running for the whole session.
 */
const DEFAULT_IDLE_MINUTES = 15;
const IDLE_SWEEP_INTERVAL_MS = 60_000;

export function resolveIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseFloat(env.WRONGSTACK_DESKTOP_IDLE_MINUTES ?? '');
  if (Number.isFinite(raw)) return raw > 0 ? raw * 60_000 : 0;
  return DEFAULT_IDLE_MINUTES * 60_000;
}

export class DesktopRuntimeManager extends EventEmitter {
  private readonly runtimes = new Map<string, RuntimeInternal>();
  private readonly stateFile = path.join(
    resolveWstackPaths({ projectRoot: process.cwd() }).configDir,
    'desktop.json',
  );
  private recentProjects: DesktopProjectEntry[] = [];
  private registeredProjects: DesktopProjectEntry[] = [];
  private restoreProjectSessions: DesktopProjectSessionState[] = [];
  private restoreActiveRuntimeId: string | null = null;
  private restoreActiveProjectRoot: string | null = null;
  private lastActiveProjectRoot: string | null = null;
  private windowState: DesktopWindowState | null = null;
  private activeRuntimeId: string | null = null;
  private restoring = false;
  private workspaceRestoreCompleted = false;
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimeoutMs = 0;

  constructor(private readonly trustBoundary: TrustBoundary = desktopCompatibilityTrustBoundary) {
    super();
  }

  async init(): Promise<void> {
    const state = await this.loadDesktopState();
    this.recentProjects = state.recentProjects;
    this.registeredProjects = await readGlobalProjectManifest();
    this.restoreProjectSessions = state.openProjectSessions;
    this.restoreActiveRuntimeId = state.activeRuntimeId;
    this.restoreActiveProjectRoot = state.activeProjectRoot;
    this.lastActiveProjectRoot = state.activeProjectRoot;
    this.windowState = state.window;
  }

  snapshot(): DesktopStateSnapshot {
    const activeId = this.activeRuntimeId;
    return {
      activeRuntimeId: activeId,
      runtimes: Array.from(this.runtimes.values()).map((runtime) =>
        publicRuntime(runtime, runtime.id === activeId),
      ),
      recentProjects: [...this.recentProjects],
      registeredProjects: [...this.registeredProjects],
      restoring: this.restoring,
    };
  }

  getWindowState(): DesktopWindowState | null {
    return this.windowState ? { ...this.windowState } : null;
  }

  async saveWindowState(window: DesktopWindowState): Promise<void> {
    this.windowState = { ...window };
    await this.saveDesktopState();
  }

  async restoreLastWorkspace(): Promise<void> {
    const sessions = this.restoreProjectSessions.filter(
      (session) => typeof session.root === 'string' && session.root.trim(),
    );
    if (sessions.length === 0 || this.restoring || this.runtimes.size > 0) {
      this.workspaceRestoreCompleted = true;
      return;
    }
    this.restoring = true;
    this.emitChanged();
    try {
      const seen = new Map<string, number>();
      for (const session of sessions) {
        const key = pathKey(session.root);
        const seenCount = seen.get(key) ?? 0;
        seen.set(key, seenCount + 1);
        await this.openProject(session.root, {
          forceNew: seenCount > 0,
          name: session.name,
          runtimeId: session.runtimeId,
        }).catch((err) => {
          process.stderr.write(
            `[desktop:restore] Failed to restore ${session.root}: ${toErrorMessage(err)}\n`,
          );
        });
      }
      let restoredActive = false;
      if (this.restoreActiveRuntimeId) {
        const active = this.runtimes.get(this.restoreActiveRuntimeId);
        if (active) {
          await this.activateRuntime(active.id);
          restoredActive = true;
        }
      }
      if (!restoredActive && this.restoreActiveProjectRoot) {
        const active = Array.from(this.runtimes.values()).find((runtime) =>
          samePath(runtime.root, this.restoreActiveProjectRoot ?? ''),
        );
        if (active) await this.activateRuntime(active.id);
      }
    } finally {
      this.restoring = false;
      this.workspaceRestoreCompleted = true;
      this.emitChanged();
      await this.saveDesktopState();
    }
  }

  getRuntime(id: string): DesktopRuntimeRecord | undefined {
    const runtime = this.runtimes.get(id);
    // Single record by id: including logs costs one runtime's worth, not N.
    return runtime ? publicRuntime(runtime, true) : undefined;
  }

  getRuntimeUrlWithToken(id: string): string | undefined {
    const runtime = this.runtimes.get(id);
    if (!runtime) return undefined;
    const url = new URL(runtime.url);
    url.searchParams.set('token', runtime.token);
    url.searchParams.set('shell', 'desktop');
    return url.toString();
  }

  getRuntimeWsUrlWithToken(id: string): string | undefined {
    const runtime = this.runtimes.get(id);
    if (!runtime) return undefined;
    const url = new URL(`ws://127.0.0.1:${runtime.wsPort}`);
    url.searchParams.set('token', runtime.token);
    return url.toString();
  }

  async openProject(
    projectRoot: string,
    options: OpenProjectOptions = {},
  ): Promise<DesktopRuntimeRecord> {
    const resolved = path.resolve(projectRoot);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Not a directory: ${resolved}`);
    const kind = options.kind ?? 'project';
    const touchRecent = options.touchRecent ?? kind === 'project';
    const forceNew = options.forceNew === true;

    const authorization = await authorizeDesktopRuntimeStart(this.trustBoundary, resolved, kind);
    if (!authorization.allowed) {
      throw new Error(`Desktop runtime start denied: ${authorization.reason}`);
    }

    if (!forceNew) {
      const existing = Array.from(this.runtimes.values()).find(
        (runtime) =>
          samePath(runtime.root, resolved) &&
          runtime.kind === kind &&
          (runtime.status === 'starting' || runtime.status === 'running'),
      );
      if (existing) {
        this.activeRuntimeId = existing.id;
        if (existing.kind === 'project') this.lastActiveProjectRoot = existing.root;
        if (touchRecent) {
          await this.touchProject(existing.root);
        } else {
          await this.persistWorkspaceState();
        }
        this.emitChanged();
        return publicRuntime(existing, true);
      }
      const staleSameRoot = Array.from(this.runtimes.values()).filter(
        (runtime) => samePath(runtime.root, resolved) && runtime.kind === kind,
      );
      for (const stale of staleSameRoot) {
        await this.closeRuntimeInternal(stale.id, { persistWorkspace: false });
      }
    }

    const slug = projectSlug(resolved);
    const requestedRuntimeId = normalizeRuntimeId(options.runtimeId);
    const runtimeId =
      requestedRuntimeId && !this.runtimes.has(requestedRuntimeId)
        ? requestedRuntimeId
        : `${slug}-${randomBytes(3).toString('hex')}`;
    const name = options.name ?? nextRuntimeName(this.runtimes, resolved, kind);
    const httpPort = await findFreePort(HTTP_PORT_START, usedPorts(this.runtimes));
    const wsPort = httpPort;
    const token = randomBytes(24).toString('hex');
    const runtime: RuntimeInternal = {
      id: runtimeId,
      name,
      root: resolved,
      slug,
      kind,
      status: 'starting',
      httpPort,
      wsPort,
      url: `http://127.0.0.1:${httpPort}`,
      startedAt: new Date().toISOString(),
      token,
      child: null,
      logs: [],
      logNotifyTimer: null,
      lastActivityAt: Date.now(),
    };
    this.runtimes.set(runtimeId, runtime);
    this.activeRuntimeId = runtimeId;
    if (kind === 'project') this.lastActiveProjectRoot = resolved;
    if (touchRecent) {
      await this.touchProject(resolved);
    } else {
      await this.persistWorkspaceState();
    }
    this.emitChanged();

    try {
      const entry = resolveWebUiEntry();
      const distDir = resolveWebUiDistDir();
      const child = spawn(
        process.execPath,
        [
          entry,
          '--host',
          '127.0.0.1',
          '--port',
          String(httpPort),
          '--dist-dir',
          distDir,
          '--require-token',
        ],
        {
          cwd: resolved,
          env: {
            ...buildChildEnv(),
            ELECTRON_RUN_AS_NODE: '1',
            WEBUI_STRICT_PORT: '1',
            WRONGSTACK_DESKTOP: '1',
            // Passed by environment, not argv. A process command line is
            // world-readable on every platform this ships to — `ps -ef` on
            // POSIX, Task Manager's command-line column or a plain WMI query on
            // Windows — so `--token <secret>` handed the WebUI access token to
            // any local process that cared to look. The token grants full agent
            // control, so that is a credential disclosure, not a nuisance.
            // entry.ts already reads WEBUI_TOKEN; argv only took precedence
            // over it (WS-087).
            WEBUI_TOKEN: token,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      runtime.child = child;
      runtime.pid = child.pid;
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        appendRuntimeLog(runtime, 'stdout', text);
        runtime.lastActivityAt = Date.now();
        this.scheduleLogChanged(runtime);
        process.stdout.write(`[desktop:${runtime.id}] ${text}`);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        appendRuntimeLog(runtime, 'stderr', text);
        runtime.lastActivityAt = Date.now();
        this.scheduleLogChanged(runtime);
        process.stderr.write(`[desktop:${runtime.id}] ${text}`);
      });
      child.once('error', (err) => {
        runtime.status = 'error';
        runtime.error = toErrorMessage(err);
        runtime.child = null;
        if (this.activeRuntimeId === runtime.id) {
          this.activeRuntimeId = firstRunningRuntimeId(this.runtimes);
        }
        this.emitChanged();
      });
      child.once('exit', (code, signal) => {
        if (runtime.status === 'error') return;
        runtime.status = 'stopped';
        runtime.error =
          code === 0 ? undefined : `Exited with ${signal ?? `code ${code ?? 'unknown'}`}`;
        runtime.child = null;
        if (this.activeRuntimeId === runtime.id) {
          this.activeRuntimeId = firstRunningRuntimeId(this.runtimes);
        }
        this.emitChanged();
      });

      await waitForHttpReady(runtime.url, token, START_TIMEOUT_MS);
      if (runtime.status !== 'starting') {
        // The child exited or hit a spawn error while we were waiting.
        throw new Error(runtime.error ?? 'WebUI process exited during startup');
      }
      runtime.status = 'running';
      await this.persistWorkspaceState();
      this.emitChanged();
      return publicRuntime(runtime, true);
    } catch (err) {
      if (runtime.status !== 'stopped' && runtime.status !== 'error') {
        runtime.status = 'error';
      }
      if (runtime.error === undefined) {
        runtime.error = toErrorMessage(err);
      }
      await terminateProcessTree(runtime.child);
      runtime.child = null;
      if (this.activeRuntimeId === runtime.id) {
        this.activeRuntimeId = firstRunningRuntimeId(this.runtimes);
      }
      this.emitChanged();
      throw err;
    }
  }

  async activateRuntime(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Runtime not found: ${id}`);
    this.activeRuntimeId = id;
    runtime.lastActivityAt = Date.now();
    if (runtime.kind === 'project') this.lastActiveProjectRoot = runtime.root;
    if (runtime.kind === 'project') {
      await this.touchProject(runtime.root);
    } else {
      await this.persistWorkspaceState();
    }
    this.emitChanged();
  }

  async closeRuntime(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (runtime) {
      const authorization = await authorizeDesktopRuntimeStop(this.trustBoundary, runtime);
      if (!authorization.allowed) {
        throw new Error(`Desktop runtime stop denied: ${authorization.reason}`);
      }
    }
    await this.closeRuntimeInternal(id, { persistWorkspace: true });
  }

  async closeAll(options: { persistWorkspace?: boolean } = {}): Promise<void> {
    const persistWorkspace = options.persistWorkspace ?? true;
    await Promise.all(
      Array.from(this.runtimes.keys()).map((id) =>
        this.closeRuntimeInternal(id, { persistWorkspace }),
      ),
    );
  }

  async registerProject(projectRoot: string): Promise<void> {
    const resolved = path.resolve(projectRoot);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Not a directory: ${resolved}`);
    const now = new Date().toISOString();
    const entry: DesktopProjectEntry = {
      name: path.basename(resolved) || resolved,
      root: resolved,
      slug: projectSlug(resolved),
      lastSeen: now,
      lastWorkingDir: resolved,
    };
    this.registeredProjects = await touchGlobalProjectManifest(entry);
    this.emitChanged();
  }

  async unregisterProject(projectRoot: string): Promise<void> {
    const resolved = path.resolve(projectRoot);
    this.registeredProjects = await removeGlobalProjectManifest(resolved);
    await this.saveDesktopState();
    this.emitChanged();
  }

  private async closeRuntimeInternal(
    id: string,
    options: { persistWorkspace: boolean },
  ): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.status = 'stopped';
    const child = runtime.child;
    runtime.child = null;
    await terminateProcessTree(child);
    if (runtime.logNotifyTimer) {
      clearTimeout(runtime.logNotifyTimer);
      runtime.logNotifyTimer = null;
    }
    this.runtimes.delete(id);
    if (this.activeRuntimeId === id) this.activeRuntimeId = firstRunningRuntimeId(this.runtimes);
    if (this.lastActiveProjectRoot && samePath(this.lastActiveProjectRoot, runtime.root)) {
      this.lastActiveProjectRoot = firstProjectRuntimeRoot(this.runtimes);
    }
    if (options.persistWorkspace) {
      await this.persistWorkspaceState();
    }
    this.emitChanged();
  }

  private async touchProject(projectRoot: string): Promise<void> {
    const resolved = path.resolve(projectRoot);
    const now = new Date().toISOString();
    const entry: DesktopProjectEntry = {
      name: path.basename(resolved) || resolved,
      root: resolved,
      slug: projectSlug(resolved),
      lastSeen: now,
      lastWorkingDir: resolved,
    };
    this.recentProjects = [
      entry,
      ...this.recentProjects.filter((p) => !samePath(p.root, resolved)),
    ].slice(0, 24);
    const [, registeredProjects] = await Promise.all([
      this.saveDesktopState(),
      touchGlobalProjectManifest(entry),
    ]);
    this.registeredProjects = registeredProjects;
  }

  private async persistWorkspaceState(): Promise<void> {
    await this.saveDesktopState();
  }

  private async loadDesktopState(): Promise<{
    recentProjects: DesktopProjectEntry[];
    openProjects: string[];
    openProjectSessions: DesktopProjectSessionState[];
    activeRuntimeId: string | null;
    activeProjectRoot: string | null;
    window: DesktopWindowState | null;
  }> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as DesktopStateFile;
      const openProjects = normalizePathList(parsed.openProjects);
      const openProjectSessions = normalizeSessionStateList(
        parsed.openProjectSessions,
        openProjects,
      );
      return {
        recentProjects: normalizeProjectEntries(parsed.recentProjects),
        openProjects,
        openProjectSessions,
        activeRuntimeId: normalizeRuntimeId(parsed.activeRuntimeId) ?? null,
        activeProjectRoot:
          typeof parsed.activeProjectRoot === 'string' && parsed.activeProjectRoot.trim()
            ? path.resolve(parsed.activeProjectRoot)
            : null,
        window: normalizeWindowState(parsed.window),
      };
    } catch {
      return {
        recentProjects: [],
        openProjects: [],
        openProjectSessions: [],
        activeRuntimeId: null,
        activeProjectRoot: null,
        window: null,
      };
    }
  }

  private async saveDesktopState(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    const liveProjectSessions = Array.from(this.runtimes.values())
      .filter((runtime) => runtime.status !== 'stopped' && runtime.kind === 'project')
      .map((runtime) => runtimeToSessionState(runtime));
    const openProjectSessions =
      liveProjectSessions.length === 0 && !this.workspaceRestoreCompleted
        ? [...this.restoreProjectSessions]
        : liveProjectSessions;
    const openProjects = openProjectSessions.map((session) => session.root);
    const activeRuntime = this.activeRuntimeId ? this.runtimes.get(this.activeRuntimeId) : null;
    const lastActiveProjectRoot = this.lastActiveProjectRoot;
    const fallbackSession = lastActiveProjectRoot
      ? openProjectSessions.find((session) => samePath(session.root, lastActiveProjectRoot))
      : undefined;
    const activeSession =
      activeRuntime?.kind === 'project'
        ? runtimeToSessionState(activeRuntime)
        : (fallbackSession ?? openProjectSessions[0]);
    const activeRoot = activeSession?.root;
    const activeRuntimeId = activeSession?.runtimeId ?? null;
    await atomicWrite(
      this.stateFile,
      `${JSON.stringify(
        {
          recentProjects: this.recentProjects,
          openProjects,
          openProjectSessions,
          activeRuntimeId,
          activeProjectRoot: activeRoot ?? null,
          window: this.windowState,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
  }

  private emitChanged(): void {
    this.emit('changed');
  }

  /**
   * Notify the shell that a runtime produced output.
   *
   * Only the ACTIVE runtime's logs reach the renderer (see `publicRuntime`), so
   * output from a background project has nothing to show and must not cost a
   * broadcast. Before this guard, every project writing to stdout scheduled its
   * own 250 ms timer, and each one fired a FULL snapshot: N chatty projects
   * produced 4N broadcasts per second carrying N x 40 log lines each, for a
   * panel that displays one runtime's output.
   *
   * The 250 ms debounce is per-runtime by construction (the timer lives on the
   * runtime record) but only one runtime can be active, so at most one such
   * timer is ever armed now.
   */
  /**
   * Begin reclaiming idle project servers.
   *
   * Idempotent, and a no-op when the timeout is disabled. The interval is
   * unref'd so a pending sweep never holds the process open during quit.
   */
  startIdleSweep(options: { idleTimeoutMs?: number } = {}): void {
    if (this.idleSweepTimer) return;
    this.idleTimeoutMs = options.idleTimeoutMs ?? resolveIdleTimeoutMs();
    if (this.idleTimeoutMs <= 0) return;
    this.idleSweepTimer = setInterval(() => {
      void this.sweepIdleRuntimes();
    }, IDLE_SWEEP_INTERVAL_MS);
    this.idleSweepTimer.unref?.();
  }

  stopIdleSweep(): void {
    if (!this.idleSweepTimer) return;
    clearInterval(this.idleSweepTimer);
    this.idleSweepTimer = null;
  }

  /** One pass. Exposed so a test can drive it without waiting on the interval. */
  async sweepIdleRuntimes(now = Date.now()): Promise<string[]> {
    const ids = reclaimableRuntimeIds(this.runtimes, {
      activeRuntimeId: this.activeRuntimeId,
      idleTimeoutMs: this.idleTimeoutMs,
      now,
    });
    for (const id of ids) {
      // The workspace record is left alone on purpose: the project should come
      // back on the next launch, and it is only the process being reclaimed.
      await this.closeRuntimeInternal(id, { persistWorkspace: false });
    }
    return ids;
  }

  private scheduleLogChanged(runtime: RuntimeInternal): void {
    if (runtime.id !== this.activeRuntimeId) return;
    if (runtime.logNotifyTimer) return;
    runtime.logNotifyTimer = setTimeout(() => {
      runtime.logNotifyTimer = null;
      if (this.runtimes.get(runtime.id) === runtime && runtime.id === this.activeRuntimeId) {
        this.emitChanged();
      }
    }, 250);
  }
}

export {
  desktopSettingsWorkspaceRoot,
  preloadPath,
  rendererIndexPath,
  webuiPreloadPath,
} from './runtime-manager-paths.js';
export { waitForChildExit } from './runtime-process.js';
export { normalizeProjectManifest } from './runtime-project-manifest.js';
