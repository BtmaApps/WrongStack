import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import type {
  DesktopRuntimeKind,
  DesktopRuntimeRecord,
  DesktopWindowState,
} from '../shared/types.js';
import { samePath } from './runtime-project-manifest.js';

export interface DesktopProjectSessionState {
  runtimeId?: string | undefined;
  name?: string | undefined;
  root: string;
  startedAt?: string | undefined;
}

export interface RuntimeInternal extends DesktopRuntimeRecord {
  child: ChildProcess | null;
  token: string;
  logs: string[];
  logNotifyTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Epoch ms of the last sign of life: activation, or output from the child.
   *
   * Output is the load-bearing half. A background project whose agent is
   * mid-task writes to stdout continuously, and that is exactly the runtime
   * that must never be reclaimed — the idle sweep reads this to tell "nobody
   * has looked at this in a while" apart from "nothing is happening here".
   */
  lastActivityAt: number;
}

export const MIN_WINDOW_WIDTH = 760;

export const MIN_WINDOW_HEIGHT = 520;

/**
 * Which runtimes the idle sweep may reclaim.
 *
 * Three guards, and the second is the one that matters. A background project
 * running an agent writes to stdout the whole time; `lastActivityAt` tracks
 * that, so a busy project is never idle no matter how long since the user last
 * looked at it. Reclaiming one mid-task would kill work in progress, which is
 * a far worse outcome than holding a process.
 *
 * Exported for tests: the decision is pure, the killing is not.
 */
export function reclaimableRuntimeIds(
  runtimes: ReadonlyMap<string, { status: string; lastActivityAt: number }>,
  options: { activeRuntimeId: string | null; idleTimeoutMs: number; now: number },
): string[] {
  if (options.idleTimeoutMs <= 0) return [];
  const out: string[] = [];
  for (const [id, runtime] of runtimes) {
    if (id === options.activeRuntimeId) continue;
    if (runtime.status !== 'running') continue;
    if (options.now - runtime.lastActivityAt < options.idleTimeoutMs) continue;
    out.push(id);
  }
  return out;
}

/** Log lines carried in a snapshot, for the one runtime that can display them. */
export const SNAPSHOT_LOG_LINES = 40;

/**
 * Project a runtime for the renderer.
 *
 * `recentLogs` is attached ONLY for the runtime the shell is currently
 * showing. Exactly one place renders them — the active project's collapsed
 * "WebUI output" panel (`renderRuntimeLogs`) — but they used to be attached to
 * every record in every snapshot. With N projects that meant every state
 * change serialised N x 40 log lines to display 40 of them, so the cost of one
 * project writing to stdout grew with how many other projects were open.
 *
 * Background runtimes keep accumulating their logs in memory (bounded at 120
 * by `appendRuntimeLog`); they are simply not shipped until that runtime
 * becomes active, at which point the activation itself emits a change.
 */
export function publicRuntime(
  runtime: RuntimeInternal,
  includeLogs: boolean,
): DesktopRuntimeRecord {
  const {
    child: _child,
    token: _token,
    logs,
    logNotifyTimer: _logNotifyTimer,
    ...record
  } = runtime;
  void _child;
  void _token;
  void _logNotifyTimer;
  if (!includeLogs) return record;
  return {
    ...record,
    recentLogs: logs.slice(-SNAPSHOT_LOG_LINES),
  };
}

export function runtimeToSessionState(runtime: RuntimeInternal): DesktopProjectSessionState {
  return {
    runtimeId: runtime.id,
    name: runtime.name,
    root: runtime.root,
    startedAt: runtime.startedAt,
  };
}

export function appendRuntimeLog(
  runtime: RuntimeInternal,
  stream: 'stdout' | 'stderr',
  text: string,
): void {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    runtime.logs.push(`[${stream}] ${line}`);
  }
  if (runtime.logs.length > 120) {
    runtime.logs.splice(0, runtime.logs.length - 120);
  }
}

export function normalizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const roots: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const resolved = path.resolve(item);
    roots.push(resolved);
  }
  return roots.slice(0, 12);
}

export function normalizeSessionStateList(
  value: unknown,
  fallbackRoots: string[],
): DesktopProjectSessionState[] {
  if (!Array.isArray(value)) {
    return fallbackRoots.map((root) => ({ root })).slice(0, 12);
  }
  const sessions: DesktopProjectSessionState[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<DesktopProjectSessionState>;
    if (typeof candidate.root !== 'string' || !candidate.root.trim()) continue;
    const session: DesktopProjectSessionState = {
      root: path.resolve(candidate.root),
    };
    const runtimeId = normalizeRuntimeId(candidate.runtimeId);
    if (runtimeId) session.runtimeId = runtimeId;
    if (typeof candidate.name === 'string' && candidate.name.trim()) {
      session.name = candidate.name.trim().slice(0, 120);
    }
    if (typeof candidate.startedAt === 'string' && candidate.startedAt.trim()) {
      session.startedAt = candidate.startedAt.trim();
    }
    sessions.push(session);
  }
  return sessions.slice(0, 12);
}

export function normalizeRuntimeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._:-]{3,120}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function normalizeWindowState(value: unknown): DesktopWindowState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DesktopWindowState>;
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return null;
  const state: DesktopWindowState = {
    width: Math.round(width),
    height: Math.round(height),
    maximized: Boolean(candidate.maximized),
  };
  if (Number.isFinite(Number(candidate.x))) state.x = Math.round(Number(candidate.x));
  if (Number.isFinite(Number(candidate.y))) state.y = Math.round(Number(candidate.y));
  return state;
}

export function firstRunningRuntimeId(runtimes: Map<string, RuntimeInternal>): string | null {
  return Array.from(runtimes.values()).find((runtime) => runtime.status === 'running')?.id ?? null;
}

export function firstProjectRuntimeRoot(runtimes: Map<string, RuntimeInternal>): string | null {
  return (
    Array.from(runtimes.values()).find(
      (runtime) => runtime.status === 'running' && runtime.kind === 'project',
    )?.root ?? null
  );
}

export function usedPorts(runtimes: Map<string, RuntimeInternal>): Set<number> {
  const ports = new Set<number>();
  for (const runtime of runtimes.values()) {
    ports.add(runtime.httpPort);
    ports.add(runtime.wsPort);
  }
  return ports;
}

export function nextRuntimeName(
  runtimes: Map<string, RuntimeInternal>,
  root: string,
  kind: DesktopRuntimeKind,
): string {
  const baseName = path.basename(root) || root;
  if (kind !== 'project') return baseName;
  const liveSameRoot = Array.from(runtimes.values()).filter(
    (runtime) =>
      runtime.kind === 'project' && samePath(runtime.root, root) && runtime.status !== 'stopped',
  ).length;
  return liveSameRoot === 0 ? baseName : `${baseName} #${liveSameRoot + 1}`;
}
