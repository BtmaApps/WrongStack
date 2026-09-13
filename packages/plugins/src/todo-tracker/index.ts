/**
 * todo-tracker plugin — Persistent, project-scoped todo backlog that
 * survives across sessions.
 *
 * Why a separate plugin from the built-in `todo` tool?
 *   - The built-in `todo` tool mutates `ctx.todos`, which is
 *     session-scoped and auto-clears when all items complete.
 *   - todo-tracker writes to disk (`~/.wrongstack/projects/<slug>/todo-tracker.json`)
 *     and survives across sessions. Items are explicit add/complete;
 *     no auto-clear.
 *
 * Use cases:
 *   - Backlog of work the user wants to track over days/weeks
 *   - Items the LLM noticed but didn't finish — pull them into a fresh
 *     session via `todo_tracker_pull` (the LLM then registers them with
 *     the session's `ctx.todos` via the built-in `todo` tool)
 *   - Per-project scratchpad that survives `wstack resume <id>`
 *
 * Tools registered:
 *   - todo_tracker_list     : List items, filterable by status/tag/priority
 *   - todo_tracker_add      : Append a new item
 *   - todo_tracker_complete : Mark an item completed (idempotent)
 *   - todo_tracker_drop     : Mark an item dropped (idempotent)
 *   - todo_tracker_remove   : Permanently delete by id
 *   - todo_tracker_pull     : Return pending items for LLM to promote
 *                             into the session's ctx.todos via the
 *                             built-in `todo` tool
 *   - todo_tracker_status   : Counters + last update timestamp
 *
 * Durability contract (the file is the source of truth, memory is a cache):
 *   - A file that cannot be parsed or validated is QUARANTINED (renamed to
 *     `<file>.corrupt-<timestamp>`), never silently overwritten. If the
 *     rename fails the store goes read-only.
 *   - A file written by a newer format version is never written to.
 *   - Every mutation runs under the shared file lock, re-reads the file,
 *     applies the change to a clone, writes atomically, and only then
 *     updates memory. Two sessions on one project therefore merge instead of
 *     erasing each other, and a failed write leaves memory and disk unchanged.
 *   - Read tools re-read the file so another process's changes are visible.
 */

import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import { type Plugin, type PluginAPI, ToolValidationError } from '@wrongstack/core/types';
import { atomicWrite, ensureDir, withFileLock } from '@wrongstack/core/utils';
import { nowIso } from '@wrongstack/primitives';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = 'pending' | 'in_progress' | 'completed' | 'dropped';
type Priority = 'low' | 'normal' | 'high';

const STATUSES: readonly Status[] = ['pending', 'in_progress', 'completed', 'dropped'];
const PRIORITIES: readonly Priority[] = ['low', 'normal', 'high'];

interface TrackedItem {
  id: string;
  content: string;
  status: Status;
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Session that first created the item (if known). */
  sourceSessionId: string | null;
  /** Optional free-form note attached to the item. */
  notes: string | null;
}

interface TodoTrackerFile {
  version: 1;
  projectSlug: string;
  updatedAt: string;
  items: TrackedItem[];
}

/**
 * Filesystem/persistence seam. Production uses the real primitives; tests
 * inject faults here instead of module-mocking `@wrongstack/core/utils`
 * (which is flaky under parallel vitest — see context-pins-extra.test.ts).
 */
export interface TodoTrackerDeps {
  readFile(path: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  atomicWrite(path: string, content: string, opts?: { mode?: number }): Promise<void>;
  withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T>;
  ensureDir(dir: string): Promise<void>;
}

const defaultDeps: TodoTrackerDeps = {
  readFile: (p) => fsp.readFile(p, 'utf8'),
  rename: (from, to) => fsp.rename(from, to),
  atomicWrite: (p, content, opts) => atomicWrite(p, content, opts),
  withFileLock: (p, fn) => withFileLock(p, fn),
  ensureDir: (dir) => ensureDir(dir),
};

// ---------------------------------------------------------------------------
// File location
// ---------------------------------------------------------------------------
//
// Per-project: `~/.wrongstack/projects/<slug>/todo-tracker.json`.
// The plugin receives the project path via `PluginAPI.config.extensions`
// (config field `filePath`) or falls back to `paths.projectDir` from
// the wiring layer. If neither is set, the plugin no-ops with a
// warning — there is no sensible default for a per-project file.

/** Basename without its extension; dotfiles like `.todos` keep their name. */
export function deriveProjectSlug(filePath: string): string {
  const base = basename(filePath.replace(/[\\/]+$/, '').replace(/\\/g, '/'));
  const ext = extname(base);
  const stem = ext && ext !== base ? base.slice(0, -ext.length) : base;
  return stem || 'tracker';
}

function deriveFilePath(api: { config: { extensions?: Record<string, unknown> } }): {
  filePath: string | null;
  projectSlug: string | null;
} {
  const raw = api.config.extensions?.['todo-tracker'] as Record<string, unknown> | undefined;
  const rawPath =
    raw?.['filePath'] ??
    raw?.['file_path'] ??
    raw?.['path'] ??
    raw?.['file'] ??
    raw?.['targetFile'];
  const explicit = typeof rawPath === 'string' && rawPath.trim().length > 0 ? rawPath.trim() : null;
  if (explicit) {
    return { filePath: explicit, projectSlug: deriveProjectSlug(explicit) };
  }
  return { filePath: null, projectSlug: null };
}

// ---------------------------------------------------------------------------
// Persistence (file I/O + validation)
// ---------------------------------------------------------------------------

const FILE_VERSION = 1 as const;

type LoadResult =
  | { kind: 'missing' }
  | { kind: 'ok'; file: TodoTrackerFile }
  | { kind: 'corrupt'; reason: string }
  | { kind: 'unsupportedVersion'; version: unknown }
  | { kind: 'invalidItems'; reason: string };

const isStr = (v: unknown): v is string => typeof v === 'string';
const isOptStr = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || typeof v === 'string';

function validateItem(raw: unknown, index: number): TrackedItem | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return `items[${index}] is not an object`;
  }
  const it = raw as Record<string, unknown>;
  if (!isStr(it['id']) || it['id'].length === 0) return `items[${index}].id is not a string`;
  if (!isStr(it['content'])) return `items[${index}].content is not a string`;
  if (!STATUSES.includes(it['status'] as Status)) {
    return `items[${index}].status is not one of ${STATUSES.join('|')}`;
  }
  if (!PRIORITIES.includes(it['priority'] as Priority)) {
    return `items[${index}].priority is not one of ${PRIORITIES.join('|')}`;
  }
  if (!Array.isArray(it['tags']) || !(it['tags'] as unknown[]).every(isStr)) {
    return `items[${index}].tags is not a string[]`;
  }
  if (!isStr(it['createdAt']) || !isStr(it['updatedAt'])) {
    return `items[${index}] timestamps are not strings`;
  }
  if (!isOptStr(it['completedAt']) || !isOptStr(it['sourceSessionId']) || !isOptStr(it['notes'])) {
    return `items[${index}] optional fields are not string|null`;
  }
  return {
    id: it['id'],
    content: it['content'],
    status: it['status'] as Status,
    priority: it['priority'] as Priority,
    tags: [...(it['tags'] as string[])],
    createdAt: it['createdAt'],
    updatedAt: it['updatedAt'],
    completedAt: (it['completedAt'] as string | null | undefined) ?? null,
    sourceSessionId: (it['sourceSessionId'] as string | null | undefined) ?? null,
    notes: (it['notes'] as string | null | undefined) ?? null,
  };
}

/** Pure classification of raw file bytes. Exported for tests. */
export function parseTrackerFile(rawText: string): LoadResult {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { kind: 'corrupt', reason: `invalid JSON: ${(err as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'corrupt', reason: 'top-level value is not an object' };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['version'] !== 'number') {
    return { kind: 'corrupt', reason: 'missing or non-numeric version' };
  }
  if (obj['version'] !== FILE_VERSION) {
    return { kind: 'unsupportedVersion', version: obj['version'] };
  }
  if (!Array.isArray(obj['items'])) {
    return { kind: 'invalidItems', reason: 'items is not an array' };
  }
  const items: TrackedItem[] = [];
  for (const [i, rawItem] of (obj['items'] as unknown[]).entries()) {
    const v = validateItem(rawItem, i);
    if (typeof v === 'string') return { kind: 'invalidItems', reason: v };
    items.push(v);
  }
  return {
    kind: 'ok',
    file: {
      version: FILE_VERSION,
      // Any stored slug is accepted (older versions stored the basename
      // including the extension); the current slug is written on next save.
      projectSlug: isStr(obj['projectSlug']) ? obj['projectSlug'] : '',
      updatedAt: isStr(obj['updatedAt']) ? obj['updatedAt'] : '',
      items,
    },
  };
}

async function loadFile(deps: TodoTrackerDeps, filePath: string): Promise<LoadResult> {
  let raw: string;
  try {
    raw = await deps.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    throw err;
  }
  return parseTrackerFile(raw);
}

/** Windows-safe ISO timestamp for quarantine file names. */
function quarantineSuffix(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

// ---------------------------------------------------------------------------
// Per-instance state (one per PluginAPI; no module-level mutable state)
// ---------------------------------------------------------------------------

type MutationOp = 'add' | 'complete' | 'drop' | 'remove';

interface TrackerInstance {
  api: PluginAPI;
  filePath: string;
  projectSlug: string;
  /** Last snapshot successfully read from or written to disk. */
  file: TodoTrackerFile;
  /** Set when the file must never be written (unsupported version / failed quarantine). */
  readOnlyReason: string | null;
  /** Set after a successful quarantine — the store works but health is not ok. */
  degradedReason: string | null;
  /** In-process serialization so parallel calls don't thrash the file lock. */
  queue: Promise<unknown>;
  registeredTools: string[];
  addCount: number;
  completeCount: number;
  dropCount: number;
  removeCount: number;
  pullCount: number;
  lastMutation: null | { op: MutationOp; itemId: string; when: string };
}

function emptyFile(slug: string): TodoTrackerFile {
  return { version: FILE_VERSION, projectSlug: slug, updatedAt: nowIso(), items: [] };
}

// Failures throw: the executor only flags a call as failed when execute rejects.
// (Tools are only registered once a file path is configured, so there is no
// "not configured" path inside execute.)
function requireItemId(input: Record<string, unknown>): string {
  const rawId = input['id'] ?? input['itemId'] ?? input['taskId'] ?? input['todoId'];
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) throw new ToolValidationError({ message: 'id is required', field: 'id' });
  return id;
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Exact lookup; the error lists up to 5 open ids (closest prefix first). */
function requireItemIndex(file: TodoTrackerFile, id: string): number {
  const idx = file.items.findIndex((it) => it.id === id);
  if (idx !== -1) return idx;
  const open = file.items.filter((it) => it.status === 'pending' || it.status === 'in_progress');
  const pool = open.length > 0 ? open : file.items;
  const candidates = [...pool]
    .sort((a, b) => commonPrefixLength(b.id, id) - commonPrefixLength(a.id, id))
    .slice(0, 5)
    .map((it) => `${it.id} ("${it.content.slice(0, 40)}")`);
  const hint =
    candidates.length > 0
      ? ` Known ${open.length > 0 ? 'open ' : ''}ids: ${candidates.join(', ')}`
      : ' The tracker is empty.';
  throw new ToolValidationError({ message: `no item with id ${id}.${hint}`, field: 'id' });
}

export function createTodoTrackerPlugin(overrides: Partial<TodoTrackerDeps> = {}): Plugin {
  const deps: TodoTrackerDeps = { ...defaultDeps, ...overrides };
  const instances = new WeakMap<object, TrackerInstance>();
  /** health() receives no api; it reports the most recently set-up instance. */
  let latest: TrackerInstance | null = null;

  function unregisterTools(inst: TrackerInstance): void {
    const unregister = (inst.api.tools as { unregister?: (name: string) => unknown }).unregister;
    for (const name of inst.registeredTools.splice(0)) {
      if (typeof unregister !== 'function') continue;
      try {
        unregister.call(inst.api.tools, name);
      } catch (err) {
        inst.api.log.warn('todo-tracker: failed to unregister tool', { name, err });
      }
    }
  }

  function assertWritable(inst: TrackerInstance): void {
    if (inst.readOnlyReason !== null) {
      throw new Error(`todo-tracker: store is read-only — ${inst.readOnlyReason}`);
    }
  }

  function serialize<T>(inst: TrackerInstance, fn: () => Promise<T>): Promise<T> {
    const run = inst.queue.then(fn, fn);
    inst.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Quarantine a corrupt file. Caller MUST hold the file lock. Returns true
   * when the file was moved aside; on rename failure the instance goes
   * read-only and false is returned.
   */
  async function quarantineLocked(inst: TrackerInstance, reason: string): Promise<boolean> {
    const target = `${inst.filePath}.corrupt-${quarantineSuffix()}`;
    try {
      await deps.rename(inst.filePath, target);
    } catch (err) {
      inst.readOnlyReason =
        `${inst.filePath} is unreadable (${reason}) and could not be moved aside ` +
        `(${(err as Error).message}); fix or remove the file, then reload the plugin`;
      inst.api.log.error(
        'todo-tracker: corrupt file could not be quarantined; store is read-only',
        {
          filePath: inst.filePath,
          reason,
          err,
        },
      );
      return false;
    }
    inst.degradedReason = `${inst.filePath} was unreadable (${reason}); original moved to ${target}`;
    inst.api.log.error(`todo-tracker: corrupt file quarantined to ${target}`, {
      filePath: inst.filePath,
      quarantinedTo: target,
      reason,
    });
    return true;
  }

  /**
   * Resolve a LoadResult into a usable snapshot. `locked` tells whether the
   * caller holds the file lock (quarantine needs it). Throws when the store
   * is (or becomes) read-only and `strict` is set (mutation path).
   */
  async function resolveLoad(
    inst: TrackerInstance,
    res: LoadResult,
    opts: { locked: boolean; strict: boolean },
  ): Promise<TodoTrackerFile> {
    switch (res.kind) {
      case 'ok':
        return res.file;
      case 'missing':
        return emptyFile(inst.projectSlug);
      case 'unsupportedVersion': {
        inst.readOnlyReason =
          `${inst.filePath} has format version ${JSON.stringify(res.version)}, ` +
          `this plugin only writes version ${FILE_VERSION}; refusing to modify it`;
        inst.api.log.error('todo-tracker: unsupported file version; store is read-only', {
          filePath: inst.filePath,
          version: res.version,
        });
        if (opts.strict) assertWritable(inst);
        return emptyFile(inst.projectSlug);
      }
      case 'corrupt':
      case 'invalidItems': {
        const quarantine = async (): Promise<TodoTrackerFile> => {
          // Re-check under the lock: another process may have fixed or
          // quarantined the file in the meantime.
          const again = opts.locked ? res : await loadFile(deps, inst.filePath);
          if (again.kind === 'ok') return again.file;
          if (again.kind === 'missing') return emptyFile(inst.projectSlug);
          if (again.kind === 'unsupportedVersion') {
            return resolveLoad(inst, again, { locked: true, strict: opts.strict });
          }
          const moved = await quarantineLocked(inst, again.reason);
          if (!moved && opts.strict) assertWritable(inst);
          return emptyFile(inst.projectSlug);
        };
        return opts.locked ? quarantine() : deps.withFileLock(inst.filePath, quarantine);
      }
    }
  }

  /** Fresh read for read tools. Never writes except to quarantine. */
  async function refresh(inst: TrackerInstance): Promise<TodoTrackerFile> {
    if (inst.readOnlyReason !== null) return inst.file;
    const res = await loadFile(deps, inst.filePath);
    const file = await resolveLoad(inst, res, { locked: false, strict: false });
    inst.file = file;
    return file;
  }

  /**
   * lock → strict re-read → apply to clone → atomic write → swap memory.
   * `apply` returns `changed: false` for idempotent no-ops (no write).
   */
  function mutate<T>(
    inst: TrackerInstance,
    apply: (draft: TodoTrackerFile, now: string) => { changed: boolean; result: T },
  ): Promise<T> {
    return serialize(inst, () =>
      deps.withFileLock(inst.filePath, async () => {
        assertWritable(inst);
        const res = await loadFile(deps, inst.filePath);
        const current = await resolveLoad(inst, res, { locked: true, strict: true });
        const draft = structuredClone(current);
        const now = nowIso();
        const { changed, result } = apply(draft, now);
        if (changed) {
          draft.version = FILE_VERSION;
          draft.projectSlug = inst.projectSlug;
          draft.updatedAt = now;
          await deps.ensureDir(dirname(inst.filePath));
          // Atomic temp+rename via the shared primitive (Windows EPERM/EBUSY
          // retries). Memory is only replaced after this resolves.
          await deps.atomicWrite(inst.filePath, JSON.stringify(draft, null, 2), { mode: 0o600 });
          inst.file = draft;
        } else {
          inst.file = current;
        }
        return result;
      }),
    );
  }

  function recordMutation(inst: TrackerInstance, op: MutationOp, itemId: string): void {
    inst.lastMutation = { op, itemId, when: nowIso() };
    if (op === 'add') inst.addCount += 1;
    else if (op === 'complete') inst.completeCount += 1;
    else if (op === 'drop') inst.dropCount += 1;
    else if (op === 'remove') inst.removeCount += 1;
  }

  function sessionCounts(inst: TrackerInstance) {
    return {
      add: inst.addCount,
      complete: inst.completeCount,
      drop: inst.dropCount,
      remove: inst.removeCount,
      pull: inst.pullCount,
    };
  }

  function disposeInstance(api: PluginAPI): TrackerInstance | undefined {
    const inst = instances.get(api);
    if (!inst) return undefined;
    unregisterTools(inst);
    instances.delete(api);
    if (latest === inst) latest = null;
    return inst;
  }

  const plugin: Plugin = {
    name: 'todo-tracker',
    version: '0.1.0',
    description: 'Persistent, project-scoped todo backlog that survives across sessions',
    apiVersion: '^0.1.10',
    capabilities: { tools: true },
    defaultConfig: {
      filePath: '',
    },
    configSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description:
            'Override the auto-derived per-project path. Defaults to <projectDir>/todo-tracker.json when `paths.projectDir` is provided by the host.',
        },
      },
    },

    async setup(api) {
      // Idempotent re-init: a second setup on the same api (reload without
      // teardown) releases the previous instance's tools first so a real
      // ToolRegistry does not throw REGISTRY_DUPLICATE.
      disposeInstance(api);

      const derived = deriveFilePath(api);
      if (derived.filePath === null) {
        latest = null;
        api.log.warn(
          'todo-tracker: no file path configured (set `config.extensions["todo-tracker"].filePath` or wire `paths.projectDir` through PluginAPI) — tools will report a clear error',
        );
        return;
      }

      const inst: TrackerInstance = {
        api,
        filePath: derived.filePath,
        projectSlug: derived.projectSlug ?? 'tracker',
        file: emptyFile(derived.projectSlug ?? 'tracker'),
        readOnlyReason: null,
        degradedReason: null,
        queue: Promise.resolve(),
        registeredTools: [],
        addCount: 0,
        completeCount: 0,
        dropCount: 0,
        removeCount: 0,
        pullCount: 0,
        lastMutation: null,
      };
      instances.set(api, inst);
      latest = inst;

      // Initial load: quarantines corrupt files, flags unsupported versions.
      await refresh(inst);

      const register = (tool: Parameters<PluginAPI['tools']['register']>[0]): void => {
        api.tools.register(tool);
        inst.registeredTools.push(tool.name);
      };

      // --- todo_tracker_list ---
      register({
        name: 'todo_tracker_list',
        description:
          'List persistent todo-tracker items. Filterable by status, priority, and tag. By default only pending + in_progress items are shown.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'dropped', 'all'],
              description:
                "Filter by status. 'all' returns every item; default is pending+in_progress.",
            },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] },
            tag: { type: 'string', description: 'Filter by exact tag match' },
            limit: { type: 'number', description: 'Max items to return (default 50, max 200)' },
          },
        },
        permission: 'auto',
        mutating: false,
        async execute(input: Record<string, unknown>) {
          const rawStatus =
            typeof input['status'] === 'string' ? input['status'].trim().toLowerCase() : undefined;
          const status = rawStatus ?? 'active';
          const priority =
            typeof input['priority'] === 'string'
              ? input['priority'].trim().toLowerCase()
              : undefined;
          const tag = typeof input['tag'] === 'string' ? input['tag'] : undefined;
          const limit = Math.min(Math.max(Number(input['limit'] ?? 50) || 50, 1), 200);
          const file = await refresh(inst);
          let items = file.items;
          if (status !== 'all') {
            if (status === 'active') {
              items = items.filter((it) => it.status === 'pending' || it.status === 'in_progress');
            } else {
              items = items.filter((it) => it.status === status);
            }
          }
          if (priority) items = items.filter((it) => it.priority === priority);
          if (tag) items = items.filter((it) => it.tags.includes(tag));
          const total = items.length;
          const truncated = items.slice(0, limit);
          return {
            ok: true,
            total,
            returned: truncated.length,
            truncated: total > truncated.length,
            items: truncated,
            ...(inst.readOnlyReason ? { readOnly: inst.readOnlyReason } : {}),
          };
        },
      });

      // --- todo_tracker_add ---
      register({
        name: 'todo_tracker_add',
        description: 'Append a new item to the persistent todo-tracker backlog.',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'What needs doing (required)' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for filtering',
            },
            sourceSessionId: { type: 'string', description: 'Session that created this item' },
            notes: { type: 'string', description: 'Optional free-form notes' },
          },
          required: ['content'],
        },
        permission: 'auto',
        mutating: true,
        async execute(input: Record<string, unknown>) {
          const rawContent =
            input['content'] ??
            input['text'] ??
            input['task'] ??
            input['title'] ??
            input['todo'] ??
            input['message'] ??
            input['item'];
          const content = typeof rawContent === 'string' ? rawContent.trim() : '';
          if (!content) {
            throw new ToolValidationError({
              message: 'content is required and must be a non-empty string',
              field: 'content',
            });
          }
          const rawPri =
            typeof input['priority'] === 'string' ? input['priority'].trim().toLowerCase() : '';
          const priority: Priority =
            rawPri === 'low' || rawPri === 'high' ? (rawPri as Priority) : 'normal';
          const tags = Array.isArray(input['tags'])
            ? (input['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
            : [];
          const sourceSessionId =
            typeof input['sourceSessionId'] === 'string'
              ? (input['sourceSessionId'] as string)
              : null;
          const notes = typeof input['notes'] === 'string' ? (input['notes'] as string) : null;

          const item = await mutate(inst, (draft, now) => {
            const created: TrackedItem = {
              id: randomUUID(),
              content,
              status: 'pending',
              priority,
              tags,
              createdAt: now,
              updatedAt: now,
              completedAt: null,
              sourceSessionId,
              notes,
            };
            draft.items.push(created);
            return { changed: true, result: created };
          });
          recordMutation(inst, 'add', item.id);
          api.log.info('todo-tracker: added item', { id: item.id, content });
          try {
            await api.session?.append?.({
              type: 'todo-tracker:add',
              ts: item.createdAt,
              id: item.id,
              content,
              priority,
              tags,
            });
          } catch (err) {
            // session.append is best-effort, but a silent failure hides a
            // broken session writer.
            api.log.warn('todo-tracker: session.append failed (item was saved)', {
              id: item.id,
              err,
            });
          }
          return { ok: true, item };
        },
      });

      type TerminalResult = { ok: true; item: TrackedItem; message?: string };
      const setTerminalStatus = async (
        input: Record<string, unknown>,
        target: 'completed' | 'dropped',
      ): Promise<TerminalResult> => {
        const id = requireItemId(input);
        return mutate<TerminalResult>(inst, (draft, now) => {
          const item = draft.items[requireItemIndex(draft, id)]!;
          if (item.status === target) {
            return {
              changed: false,
              result: { ok: true, item, message: `already ${target} (idempotent)` },
            };
          }
          item.status = target;
          item.updatedAt = now;
          item.completedAt = now;
          return { changed: true, result: { ok: true, item } };
        });
      };

      // --- todo_tracker_complete ---
      register({
        name: 'todo_tracker_complete',
        description: 'Mark a tracked item as completed. Idempotent.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item id' },
          },
          required: ['id'],
        },
        permission: 'auto',
        mutating: true,
        async execute(input: Record<string, unknown>) {
          const result = await setTerminalStatus(input, 'completed');
          if (!result.message) {
            recordMutation(inst, 'complete', result.item.id);
            api.log.info('todo-tracker: completed item', { id: result.item.id });
          }
          return result;
        },
      });

      // --- todo_tracker_drop ---
      register({
        name: 'todo_tracker_drop',
        description:
          'Mark a tracked item as dropped (skipped/obsolete). The row is kept for audit. Idempotent.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item id' },
          },
          required: ['id'],
        },
        permission: 'auto',
        mutating: true,
        async execute(input: Record<string, unknown>) {
          const result = await setTerminalStatus(input, 'dropped');
          if (!result.message) recordMutation(inst, 'drop', result.item.id);
          return result;
        },
      });

      // --- todo_tracker_remove ---
      register({
        name: 'todo_tracker_remove',
        description:
          'Permanently delete a tracked item by id. Use todo_tracker_drop instead if you want to keep the audit row.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item id' },
          },
          required: ['id'],
        },
        permission: 'confirm',
        mutating: true,
        async execute(input: Record<string, unknown>) {
          const id = requireItemId(input);
          const removed = await mutate(inst, (draft) => {
            const [gone] = draft.items.splice(requireItemIndex(draft, id), 1);
            return { changed: true, result: gone! };
          });
          recordMutation(inst, 'remove', id);
          return { ok: true, removed };
        },
      });

      // --- todo_tracker_pull ---
      register({
        name: 'todo_tracker_pull',
        description:
          'Return all pending + in_progress items. The LLM is expected to take this list and re-register each entry with the session-local `todo` tool (which mutates ctx.todos). After pull, the LLM may also choose to call todo_tracker_complete on items it finishes mid-session.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max items to return (default 50, max 200)' },
          },
        },
        permission: 'auto',
        mutating: false,
        async execute(input: Record<string, unknown>) {
          const limit = Math.min(Math.max(Number(input['limit'] ?? 50) || 50, 1), 200);
          const file = await refresh(inst);
          const open = file.items.filter(
            (it) => it.status === 'pending' || it.status === 'in_progress',
          );
          const items = open.slice(0, limit);
          // A pull is a read: it bumps the pull counter but is not a mutation.
          if (items.length > 0) inst.pullCount += 1;
          return {
            ok: true,
            total: open.length,
            returned: items.length,
            truncated: open.length > items.length,
            items,
            hint:
              'These are persistent items. To work on them this session, ' +
              'register each one with the built-in `todo` tool. Mark them ' +
              '`completed` via todo_tracker_complete when done.',
          };
        },
      });

      // --- todo_tracker_status ---
      register({
        name: 'todo_tracker_status',
        description:
          'Report todo-tracker counters (per-status totals) + the file path + last update timestamp.',
        inputSchema: { type: 'object', properties: {} },
        permission: 'auto',
        mutating: false,
        async execute() {
          const file = await refresh(inst);
          const byStatus: Record<Status, number> = {
            pending: 0,
            in_progress: 0,
            completed: 0,
            dropped: 0,
          };
          for (const it of file.items) {
            if (STATUSES.includes(it.status)) byStatus[it.status] += 1;
          }
          return {
            ok: true,
            filePath: inst.filePath,
            projectSlug: inst.projectSlug,
            updatedAt: file.updatedAt,
            counters: byStatus,
            total: file.items.length,
            session: sessionCounts(inst),
            lastMutation: inst.lastMutation,
            readOnly: inst.readOnlyReason,
            degraded: inst.degradedReason,
          };
        },
      });

      api.log.info('todo-tracker plugin loaded', {
        filePath: inst.filePath,
        projectSlug: inst.projectSlug,
        initialItemCount: inst.file.items.length,
        readOnly: inst.readOnlyReason,
        degraded: inst.degradedReason,
      });
    },

    teardown(api) {
      // The on-disk file is the source of truth — do NOT delete it on
      // teardown (the user may be back in a moment to read it).
      const inst = disposeInstance(api);
      if (!inst) return;
      api.log.info('todo-tracker: teardown complete', { sessionCounts: sessionCounts(inst) });
    },

    async health() {
      const inst = latest;
      if (inst === null) {
        return {
          ok: false,
          message: 'todo-tracker: no file path configured — tools will error',
        };
      }
      const reason = inst.readOnlyReason ?? inst.degradedReason;
      return {
        ok: reason === null,
        message:
          reason === null
            ? `todo-tracker: ${inst.file.items.length} item(s) at ${inst.filePath}`
            : `todo-tracker: ${inst.readOnlyReason ? 'read-only' : 'degraded'} — ${reason}`,
        filePath: inst.filePath,
        projectSlug: inst.projectSlug,
        total: inst.file.items.length,
        readOnly: inst.readOnlyReason,
        degraded: inst.degradedReason,
        sessionCounts: sessionCounts(inst),
        lastMutation: inst.lastMutation,
      };
    },
  };
  return plugin;
}

const plugin: Plugin = createTodoTrackerPlugin();

export default plugin;
