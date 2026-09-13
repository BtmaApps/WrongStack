import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

/**
 * Filesystem types on which SQLite WAL shared memory (`sage.db-shm`) cannot
 * be opened from WSL. `drvfs`/`9p` are the WSL2 Windows-drive mounts and
 * `wslfs` is the WSL1 variant — 9p-family filesystems whose locking never
 * coordinates with the Windows side, so a store shared with a live native
 * Windows process fails `PRAGMA journal_mode = WAL` with SQLITE_IOERR_SHMOPEN
 * (observed 2026-09-13: errcode 4618).
 */
export const NINEP_STORE_MOUNT_FS_TYPES: ReadonlySet<string> = new Set([
  '9p',
  'drvfs',
  'wslfs',
]);

export const SELF_MOUNTS_PATH = '/proc/self/mounts';

export interface ProcMountEntry {
  device: string;
  mountPoint: string;
  fsType: string;
}

/**
 * Parse `/proc/self/mounts` content. Fields are whitespace-separated with
 * spaces/tabs/newlines/backslashes octal-escaped (`\040`, `\011`, `\012`,
 * `\134`); device and mountPoint are decoded, fstype never needs decoding.
 */
export function parseProcMounts(mountsText: string): ProcMountEntry[] {
  const entries: ProcMountEntry[] = [];
  for (const line of mountsText.split('\n')) {
    const fields = line.trim().split(/\s+/);
    const [device, mountPoint, fsType] = fields;
    if (!device || !mountPoint || !fsType) continue;
    entries.push({
      device: decodeMountField(device),
      mountPoint: decodeMountField(mountPoint),
      fsType,
    });
  }
  return entries;
}

function decodeMountField(field: string): string {
  return field.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

/**
 * Filesystem type of the mount point covering `targetPath` (longest
 * mount-point prefix wins), or null when no entry covers it.
 *
 * Matched with POSIX path semantics on every host: `/proc/self/mounts` is
 * Linux-only, and host `path.resolve` would rewrite the POSIX target on
 * Windows test hosts (`/mnt/d/...` → `D:\mnt\d\...`) so no fixture could
 * ever match. `posix.resolve` normalizes without host drive semantics.
 */
export function mountFsTypeFor(mountsText: string, targetPath: string): string | null {
  const target = posix.resolve(targetPath);
  let best: ProcMountEntry | undefined;
  for (const entry of parseProcMounts(mountsText)) {
    if (!coversMountPoint(entry.mountPoint, target)) continue;
    if (best === undefined || entry.mountPoint.length > best.mountPoint.length) best = entry;
  }
  return best?.fsType ?? null;
}

function coversMountPoint(mountPoint: string, target: string): boolean {
  if (mountPoint === target) return true;
  const prefix = mountPoint.endsWith('/') ? mountPoint : `${mountPoint}/`;
  return target.startsWith(prefix);
}

/**
 * `/proc/self/mounts` content, or null off Linux (win32/darwin) where the
 * mount-type question is moot — the guard built on this must be a no-op
 * there.
 */
export function readSelfMounts(): string | null {
  try {
    return readFileSync(SELF_MOUNTS_PATH, 'utf8');
  } catch {
    return null;
  }
}

/**
 * The 9p-family filesystem type mounting `storeRoot`, or null when the store
 * sits on a local filesystem (or the mount table is unavailable).
 */
export function detectNinepStoreMount(storeRoot: string, mountsText: string | null): string | null {
  if (mountsText === null) return null;
  const fsType = mountFsTypeFor(mountsText, storeRoot);
  if (fsType === null) return null;
  return NINEP_STORE_MOUNT_FS_TYPES.has(fsType.toLowerCase()) ? fsType : null;
}

/**
 * The daemon's pre-bind refusal. Must name the store, the detected mount
 * type, the SQLite failure it prevents, and both remedies — this line is the
 * only trace of a startup that previously died invisibly.
 */
export function ninepStoreRefusalMessage(storeRoot: string, fsType: string): string {
  return [
    `sage project server: refusing WAL store on a 9p-family mount (fs type "${fsType}") at ${storeRoot}.`,
    'SQLite WAL shared memory (sage.db-shm) cannot attach across the Windows/WSL boundary',
    '(SQLITE_IOERR_SHMOPEN), so the daemon would bind the socket and then die in store init.',
    'Run wrongstack from the Windows side for this project, or move the project to a WSL-native (ext4) path.',
  ].join(' ');
}
