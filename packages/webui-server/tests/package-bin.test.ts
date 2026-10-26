import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('@wrongstack/webui package bin', () => {
  it('no longer publishes a bin — the standalone server moved to @wrongstack/webui-server (PR-018b)', () => {
    const webuiPkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages/webui/package.json'), 'utf8'),
    ) as { bin?: Record<string, string> };

    // The HTTP/WebSocket server was extracted to @wrongstack/webui-server, so the
    // frontend-only @wrongstack/webui package no longer ships an executable.
    expect(webuiPkg.bin).toBeUndefined();
  });

  it('@wrongstack/webui-server ships no standalone bin — the WebUI is launched via `wstack --webui`', () => {
    const serverPkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages/webui-server/package.json'), 'utf8'),
    ) as { bin?: Record<string, string> };

    // The server module is consumed by the CLI (`wstack --webui`); it no longer
    // publishes a direct executable of its own.
    expect(serverPkg.bin).toBeUndefined();
  });
});
