/**
 * Writers that name their output with an option or rewrite in place — curl -o,
 * wget -O/-o, sort -o, perl -pi, rsync — named no target, so path-guard let them
 * overwrite .env and lockfiles.
 */
import { describe, expect, it, vi } from 'vitest';

const plugin = (await import('../src/path-guard/index.js')).default;

function hook() {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
  plugin.setup(api as never);
  const h = (api.registerHook.mock.calls[0] as unknown[])[2] as (
    i: unknown,
  ) => Promise<{ decision?: string } | undefined>;
  return async (command: string) =>
    (
      await h({
        toolName: 'bash',
        toolInput: { command },
        cwd: process.cwd(),
        toolMutating: true,
        toolCapabilities: ['shell.arbitrary'],
      })
    )?.decision;
}

describe('path-guard: option-named and in-place writers', () => {
  it('blocks every output spelling', async () => {
    const run = hook();
    for (const command of [
      'curl -o .env https://x.test',
      'curl -sSo .env https://x.test',
      'curl -o.env https://x.test',
      'curl --output=.env https://x.test',
      'curl https://x.test --output yarn.lock',
      'wget -O .env https://x.test',
      'wget -q -O- https://x.test; wget --output-document=.env https://x.test',
      'wget -o .env https://x.test',
      'sort -o .env a',
      'sort --output=.env a',
      'perl -pi -e s/a/b/ .env',
      'perl -i.bak -pe s/a/b/ .env',
      'perl -lpi -e s/a/b/ src/x .env',
      'rsync -a x .env',
      'rsync -e ssh x .git/config',
      'cd sub && curl -o ../.env https://x.test',
    ]) {
      expect(await run(command), command).toBe('block');
    }
  });

  it('leaves reads and unprotected outputs alone', async () => {
    const run = hook();
    for (const command of [
      'curl https://x.test',
      'curl -O https://x.test/file.txt',
      'curl -o out.txt https://x.test',
      'wget -O - https://x.test',
      'sort .env',
      'perl -ne print .env',
      'perl -MList::Util -e 1 .env',
      'rsync -a .env backup/',
      'echo "curl -o .env"',
    ]) {
      expect(await run(command), command).not.toBe('block');
    }
  });
});
