import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chronicleProjectServerEndpoint } from '@wrongstack/core/chronicle';
import { mailboxProjectServerEndpoint } from '@wrongstack/core/coordination';
import { sessionCatalogProjectServerEndpoint } from '@wrongstack/core/session-catalog';
import { governanceProjectServerEndpoint } from '@wrongstack/governance';
import { kanbanProjectServerEndpoint } from '@wrongstack/kanban';
import { __resetIpcEndpointSecretForTests, _ipcEndpointSecretOps } from '@wrongstack/persistence';
import { sageProjectServerEndpoint } from '@wrongstack/sage';
import { projectIndexServerEndpoint } from '@wrongstack/tools/codebase-index';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * H-9 (security-check 2026-09-26): every project daemon's endpoint name must
 * carry the per-user secret. Endpoints named from the project path alone were
 * computable by any other local user, who could create the Windows pipe first
 * and be what this user's clients connected to.
 *
 * Swapping the secret must move EVERY endpoint. A daemon that skipped
 * `privateEndpointKey` — or bundled a private copy of it — stays put.
 */
const endpoints = (root: string): Record<string, string> => ({
  kanban: kanbanProjectServerEndpoint(root),
  sage: sageProjectServerEndpoint(root),
  chronicle: chronicleProjectServerEndpoint(root),
  mailbox: mailboxProjectServerEndpoint(root),
  sessionCatalog: sessionCatalogProjectServerEndpoint(root),
  governance: governanceProjectServerEndpoint(root),
  codebaseIndex: projectIndexServerEndpoint(root),
});

const realFile = _ipcEndpointSecretOps.file;
const dirs: string[] = [];
afterEach(() => {
  _ipcEndpointSecretOps.file = realFile;
  __resetIpcEndpointSecretForTests();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function withSecret(secret: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-daemon-secret-'));
  dirs.push(dir);
  const file = path.join(dir, 'ipc-endpoint.secret');
  fs.writeFileSync(file, `${secret}\n`);
  _ipcEndpointSecretOps.file = () => file;
  __resetIpcEndpointSecretForTests();
}

describe('project daemon endpoints carry the per-user secret', () => {
  it('every one of the seven moves when the secret changes', () => {
    const root = path.resolve('/work/app');
    withSecret('1'.repeat(64));
    const first = endpoints(root);
    withSecret('2'.repeat(64));
    const second = endpoints(root);
    const unchanged = Object.keys(first).filter((name) => first[name] === second[name]);
    expect(unchanged).toEqual([]);
    // And a secret is stable: the same one gives the same names (one daemon).
    withSecret('1'.repeat(64));
    expect(endpoints(root)).toEqual(first);
  });
});
