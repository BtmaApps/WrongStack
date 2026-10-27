/**
 * Regression: close()/dispose() must leave the store in a coherent state.
 *
 * Historically `close()` released the SQLite handle but left
 * `initialized = true` and `db` pointing at the closed connection. The next
 * `initialize()` was a no-op, so `health()` reported `ready` for a disposed
 * port and the very next real call handed the closed handle to
 * `db.prepare()` ("database is not open") — a port that claims ready but is
 * unusable. A later `initialize()` must reopen instead of lying.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteMemoryPort } from '../src/memory-port.js';

let tempDir: string;
const ports: SqliteMemoryPort[] = [];

afterEach(async () => {
  for (const port of ports.splice(0)) {
    try {
      port.close();
    } catch {
      /* already closed */
    }
  }
  await new Promise((r) => setTimeout(r, 10));
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function makePort(): SqliteMemoryPort {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrongstack-sqlite-close-'));
  const port = new SqliteMemoryPort({ projectRoot: tempDir });
  ports.push(port);
  return port;
}

describe('SqliteSageStore close()/dispose()', () => {
  it('never reports ready while unusable after dispose()', async () => {
    const port = makePort();
    await port.initialize();
    await port.dispose();

    const health = await port.health();
    let usable = true;
    try {
      await port.listMemories({ limit: 1 });
    } catch {
      usable = false;
    }
    // A port may be closed (not ready) or reopened-and-usable; it must not
    // claim ready while every call throws.
    expect(health.status !== 'ready' || usable).toBe(true);
  });

  it('reopens on the next initialize-touching call instead of throwing', async () => {
    const port = makePort();
    await port.initialize();
    await port.dispose();

    await expect(port.listMemories({ limit: 5 })).resolves.toEqual(expect.any(Array));
    await expect(port.health()).resolves.toMatchObject({ status: 'ready' });
  });

  it('is idempotent across repeated dispose()/close()', async () => {
    const port = makePort();
    await port.initialize();
    await port.dispose();
    await port.dispose();
    port.close();

    await expect(port.health()).resolves.toMatchObject({ status: 'ready' });
    await expect(port.listMemories()).resolves.toEqual(expect.any(Array));
  });
});
