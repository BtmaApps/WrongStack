/**
 * The profile `config.json` holds MCP server credentials — `env` (GITHUB_TOKEN,
 * `*_API_KEY`, …) and `bearerTokenEnv` — so it is created owner-only.
 *
 * `writeConfig` publishes through a temp file and a rename, which is the right
 * shape for atomicity, but the temp file was written with no `mode`. On POSIX
 * that takes the process umask default (0644 on a typical host), and the rename
 * then published THOSE bits over the target's 0600 — widening a credential file
 * to every local user on each `mcp add` / `update` / `remove` / `enable` /
 * `disable`, with nothing in the config that shows it.
 *
 * POSIX-only, and deliberately so: on Windows `fs.stat().mode` does not report
 * POSIX permission bits (it reads 0o666/0o444), and `fs.chmod` only toggles the
 * read-only attribute, so the downgrade is both invisible and inapplicable
 * there. This suite is therefore skipped on win32 and demonstrated on Linux CI.
 * `process.umask` is pinned to 022 so the downgrade is deterministic regardless
 * of the host's own umask — without it, a host running 077 would make the
 * unfixed code coincidentally produce 0600 and the test would pass for the wrong
 * reason.
 */
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMcp, updateMcp } from '../src/manage.js';

let dir: string;
let configPath: string;
let previousUmask: number | undefined;

const modeOf = async (file: string): Promise<number> => (await stat(file)).mode & 0o777;

/** Seed a `demo` server at `mode`, which is what a prior write would leave. */
async function seed(mode: number): Promise<void> {
  await writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        demo: { name: 'demo', transport: 'stdio', command: 'node', enabled: false },
      },
    }),
  );
  // `writeFile` applies the process umask, so this lands at 0644 under the
  // pinned 022 no matter what `mode` asks for. Establish the precondition
  // explicitly — otherwise the assertion below fails in setup and every case
  // reports red for a reason that is not the behaviour under test.
  await chmod(configPath, mode);
  expect(await modeOf(configPath)).toBe(mode);
}

/** The servers are seeded `enabled: false`, so update takes the disabled path. */
const deps = () =>
  ({
    configPath,
    registry: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockReturnValue([]),
      markDisabled: vi.fn(),
    },
  }) as never;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mcp-config-mode-'));
  configPath = join(dir, 'config.json');
  // Pin the umask so the unfixed write lands on 0644 deterministically.
  previousUmask = process.umask(0o022);
});

afterEach(async () => {
  if (previousUmask !== undefined) process.umask(previousUmask);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

describe.skipIf(process.platform === 'win32')('MCP config write preserves permission bits', () => {
  it('keeps an owner-only config owner-only across an update', async () => {
    await seed(0o600);
    const result = await updateMcp({ name: 'demo', description: 'edited' } as never, deps());
    expect(result.ok).toBe(true);
    // The regression: before the fix this was 0644.
    expect(await modeOf(configPath)).toBe(0o600);
  });

  it('preserves the target’s own bits rather than forcing 0600', async () => {
    // A deliberately group-readable config must stay group-readable: the rule
    // is "preserve", not "always tighten". (A stricter target is still never
    // widened — that is `commitTemp`'s bitwise-AND rule in
    // @wrongstack/persistence, which this package cannot reuse.)
    await seed(0o640);
    const result = await updateMcp({ name: 'demo', description: 'edited' } as never, deps());
    expect(result.ok).toBe(true);
    expect(await modeOf(configPath)).toBe(0o640);
  });

  it('creates a missing config owner-only instead of at the umask default', async () => {
    // No target to preserve, so the secure default applies. `config.json` does
    // not exist yet in this temp dir.
    const result = await addMcp(
      { name: 'fresh', transport: 'stdio', command: 'node', enabled: false } as never,
      deps(),
    );
    expect(result.ok).toBe(true);
    expect(await modeOf(configPath)).toBe(0o600);
  });

  it('still writes the config correctly', async () => {
    // Control: a permission fix must not cost the write itself. Guards against
    // a "fix" that preserves the mode by skipping the swap entirely.
    await seed(0o600);
    await updateMcp({ name: 'demo', description: 'edited' } as never, deps());
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, { description?: string }>;
    };
    expect(raw.mcpServers['demo']?.description).toBe('edited');
  });
});
