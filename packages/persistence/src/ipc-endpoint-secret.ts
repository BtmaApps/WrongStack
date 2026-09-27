/**
 * A per-OS-user secret mixed into every project daemon's IPC endpoint name.
 *
 * The endpoint names were `sha256(project path)` — fully predictable. On
 * Windows a named pipe lives in one machine-wide namespace, so another local
 * user who knew (or guessed) a project path could create the pipe first with a
 * permissive DACL; this user's WrongStack clients then connected to *their*
 * server and exchanged mailbox, index, chronicle and kanban traffic with it —
 * crafted replies included (H-9, security-check 2026-09-26). On Unix the
 * `0o700` directory protects a server's bind (G1), but a client still connected
 * into a directory someone else created first.
 *
 * With the secret in the name, nobody else can compute it: a squatter can
 * still create a directory (the owner then refuses to bind — a denial of
 * service, as before) but can no longer be the thing this user connects to.
 *
 * Invariant this must keep: every process of one OS user derives the SAME
 * name for a project, or the single-owner election splits into two daemons.
 * So the secret is located through `os.userInfo().homedir` — the passwd entry /
 * Windows profile — not `$HOME`, `%USERPROFILE%` or `WRONGSTACK_HOME`, which
 * tests and hosts override per process and `buildChildEnv` filters.
 *
 * @module ipc-endpoint-secret
 */
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SECRET_RE = /^[0-9a-f]{64}$/;

/** Test seam: where the secret lives. */
export const _ipcEndpointSecretOps = {
  file: (): string => path.join(os.userInfo().homedir, '.wrongstack', 'ipc-endpoint.secret'),
};

let cached: { file: string; secret: string | null } | undefined;

/**
 * The secret in `file`; `null` when there is none (absent or not a secret);
 * `undefined` when it could not be read right now (EMFILE, EBUSY from a
 * scanner). Only the first two are answers worth remembering: caching a
 * transient failure as "no secret" pinned this process to the public name
 * while every other process used the private one.
 */
function readSecret(file: string): string | null | undefined {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return SECRET_RE.test(text) ? text : null;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : undefined;
  }
}

/**
 * Create the secret once, race-free across processes: write a private temp
 * file, then hard-link it into place. `link` fails with EEXIST when another
 * process won, and everyone reads the winner's file — a plain write or rename
 * could leave two processes holding different secrets for a moment, which is
 * exactly a split election.
 */
function createSecret(file: string): string | null | undefined {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
    try {
      fs.linkSync(tmp, file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  } catch {
    // Unwritable home (sandbox, read-only profile): fall through to a read,
    // which returns null when nothing is there.
  }
  return readSecret(file);
}

/** The secret, or `null` when the home directory cannot hold one. */
export function ipcEndpointSecret(): string | null {
  let file: string;
  try {
    file = _ipcEndpointSecretOps.file();
  } catch {
    // `os.userInfo()` throws for a uid with no passwd entry (some containers).
    return null;
  }
  if (cached?.file === file) return cached.secret;
  const secret = readSecret(file) ?? createSecret(file);
  if (secret !== undefined) cached = { file, secret };
  return secret ?? null;
}

/**
 * The name component for a project daemon endpoint: `publicKey` (the existing
 * 24-hex per-project key) keyed by this user's secret, same length and
 * alphabet. Without a secret it returns `publicKey` unchanged — the previous
 * naming — so a process that cannot write its home still finds a daemon
 * started the same way.
 */
export function privateEndpointKey(publicKey: string): string {
  const secret = ipcEndpointSecret();
  if (secret === null) return publicKey;
  return createHash('sha256').update(`${secret}\0${publicKey}`).digest('hex').slice(0, 24);
}

/**
 * Tests only: run the create step against `file` directly. A process that
 * lost the race reaches it with the winner's file already in place, and must
 * come back with the winner's secret — not overwrite it with its own.
 */
export function __createIpcEndpointSecretForTests(file: string): string | null {
  return createSecret(file) ?? null;
}

/** Tests only: forget the cached secret. */
export function __resetIpcEndpointSecretForTests(): void {
  cached = undefined;
}
