/**
 * Boot notices of the standalone executable's background update. The
 * staging directory lives under WRONGSTACK_HOME, which vitest.setup points at
 * a temporary directory.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written: string[] = [];
vi.mock('@wrongstack/core/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/core/utils')>()),
  isStandaloneBinary: () => true,
  writeErr: (text: string) => {
    written.push(text);
  },
}));

const { printUpdateNotice } = await import('../src/cli-update-notice.js');
const { wstackGlobalRoot } = await import('@wrongstack/core/utils');
const updatesDir = () => path.join(wstackGlobalRoot(), 'updates');

const outdated = { current: '1.0.0', latest: '1.0.1', outdated: true, checkFailed: false };

function stagePending(version: string) {
  const dir = updatesDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${version}-wstack-windows-x64.exe`);
  fs.writeFileSync(file, 'build');
  fs.writeFileSync(
    path.join(dir, 'pending.json'),
    JSON.stringify({
      version,
      file,
      sha256: createHash('sha256').update('build').digest('hex'),
      target: 'bun-windows-x64',
      executable: fs.realpathSync(process.execPath),
      stagedAt: '',
    }),
  );
}

beforeEach(() => {
  written.length = 0;
});
afterEach(() => {
  fs.rmSync(updatesDir(), { recursive: true, force: true });
});

describe('printUpdateNotice for the standalone executable', () => {
  it('says a downloaded update replaces the executable when the session exits', async () => {
    stagePending('1.0.1');
    await printUpdateNotice(outdated);
    const text = written.join('');
    expect(text).toContain('v1.0.1 is downloaded');
    expect(text).toContain('when this session exits');
    expect(text).not.toContain('Update available');
  });

  it('points at `wstack update` when the background update is switched off', async () => {
    stagePending('1.0.1');
    await printUpdateNotice(outdated, { update: { autoDownload: false } } as never);
    expect(written.join('')).toContain('Run `wrongstack update` to install it');
  });

  it('keeps the plain notice while nothing is downloaded', async () => {
    await printUpdateNotice(outdated);
    expect(written.join('')).toContain('Update available: v1.0.0 → v1.0.1');
  });

  it('reports the swap a previous session made, once', async () => {
    fs.mkdirSync(updatesDir(), { recursive: true });
    fs.writeFileSync(
      path.join(updatesDir(), 'last-applied.json'),
      JSON.stringify({ from: '1.0.0', to: '1.0.1', at: '' }),
    );
    const current = { current: '1.0.1', latest: '1.0.1', outdated: false, checkFailed: false };
    await printUpdateNotice(current);
    await printUpdateNotice(current);
    expect(written.join('').match(/Updated wrongstack v1\.0\.0 → v1\.0\.1/g)).toHaveLength(1);
  });
});
