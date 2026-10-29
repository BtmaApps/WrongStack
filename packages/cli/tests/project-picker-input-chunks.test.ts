/**
 * The raw-mode project picker (`/project switch` without arguments) receives
 * keys as stdin chunks. A terminal delivers pasted or fast-typed text as ONE
 * multi-character chunk; the old handler only understood one-character chunks
 * and escape sequences, kept any other chunk in its buffer forever, and from
 * then on ignored every key — Enter, Esc and Ctrl+C included — leaving the
 * terminal stuck in raw mode.
 */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runProjectPicker } from '../src/project-picker.js';

class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setRawMode(value: boolean) {
    this.isRaw = value;
    return this;
  }
  isPaused() {
    return false;
  }
  resume() {
    return this;
  }
  pause() {
    return this;
  }
}

let dir: string;
let cfg: string;
let stdin: FakeStdin;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'picker-chunks-'));
  cfg = path.join(dir, 'config.json');
  await fs.writeFile(
    path.join(dir, 'projects.json'),
    JSON.stringify({
      projects: [
        {
          name: 'alpha',
          root: path.join(dir, 'alpha'),
          slug: 'alpha-111111',
          lastSeen: '2026-01-02',
        },
        { name: 'beta', root: path.join(dir, 'beta'), slug: 'beta-222222', lastSeen: '2026-01-01' },
      ],
    }),
  );
  stdin = new FakeStdin();
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as never);
  vi.spyOn(process, 'stdout', 'get').mockReturnValue({
    isTTY: true,
    columns: 80,
    rows: 24,
    write: () => true,
  } as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

/** Start the picker, feed the chunks, and report whether it settled in time. */
async function drive(chunks: string[]) {
  const pending = runProjectPicker({ globalConfigPath: cfg });
  await new Promise((resolve) => setTimeout(resolve, 20));
  for (const chunk of chunks) stdin.emit('data', Buffer.from(chunk));
  return Promise.race([
    pending.then((value) => ({ settled: true as const, value })),
    new Promise<{ settled: false }>((resolve) =>
      setTimeout(() => resolve({ settled: false }), 300),
    ),
  ]);
}

describe('project picker input chunks', () => {
  it('selects a filtered project when keys arrive one per chunk', async () => {
    await expect(drive(['b', 'e', '\r'])).resolves.toEqual({
      settled: true,
      value: { kind: 'project', key: 'beta-222222' },
    });
  });

  it('applies a pasted multi-character filter and still accepts Enter', async () => {
    await expect(drive(['be', '\r'])).resolves.toEqual({
      settled: true,
      value: { kind: 'project', key: 'beta-222222' },
    });
  });

  it('handles a whole "filter + Enter" burst delivered in one chunk', async () => {
    await expect(drive(['be\r'])).resolves.toEqual({
      settled: true,
      value: { kind: 'project', key: 'beta-222222' },
    });
  });

  it('still quits on Ctrl+C after a multi-character chunk', async () => {
    await expect(drive(['xy', '\x03'])).resolves.toEqual({ settled: true, value: undefined });
  });

  it('keeps arrow-key escape sequences and a lone Escape working', async () => {
    await expect(drive(['\x1b[B', '\r'])).resolves.toEqual({
      settled: true,
      value: { kind: 'project', key: 'beta-222222' },
    });
    await expect(drive(['\x1b'])).resolves.toEqual({ settled: true, value: undefined });
  });
});
