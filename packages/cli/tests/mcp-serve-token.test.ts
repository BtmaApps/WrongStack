// `mcp serve --http` must never bind without the token the user asked for
// (F493). The env and `--token=` forms and the no-token default are unchanged.
import { ToolRegistry } from '@wrongstack/core/registry';
import { afterEach, expect, it, vi } from 'vitest';

const captured: Array<{ token?: string | undefined }> = [];
vi.mock('@wrongstack/mcp', async (importOriginal) => {
  const real = await importOriginal<typeof import('@wrongstack/mcp')>();
  return {
    ...real,
    serveHttp: vi.fn(async (_server: unknown, opts: { token?: string }) => {
      captured.push({ token: opts.token });
      setImmediate(() => process.emit('SIGINT'));
      return { url: 'http://127.0.0.1:0', close: async () => {} };
    }),
  };
});

const { parseArgs } = await import('../src/arg-parser.js');
const { serveMcpStdio } = await import('../src/mcp-serve.js');

const savedEnv = process.env.WRONGSTACK_MCP_TOKEN;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.WRONGSTACK_MCP_TOKEN;
  else process.env.WRONGSTACK_MCP_TOKEN = savedEnv;
});

async function serve(argv: string[], env?: string) {
  if (env === undefined) delete process.env.WRONGSTACK_MCP_TOKEN;
  else process.env.WRONGSTACK_MCP_TOKEN = env;
  captured.length = 0;
  const parsed = parseArgs(['mcp', 'serve', ...argv]);
  const code = await serveMcpStdio(
    {
      flags: parsed.flags,
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      config: { features: {} },
      toolRegistry: new ToolRegistry(),
    } as never,
    parsed.positional.slice(2),
  );
  return { code, bound: captured.length > 0, token: captured[0]?.token };
}

it('dash-prefixed --token: refused, no bind', async () => {
  expect(await serve(['--http', '--token', '-Qx7_secretTok3n'])).toEqual({
    code: 1,
    bound: false,
    token: undefined,
  });
});
it('bare --token at the end: refused even with an env token', async () => {
  expect(await serve(['--http', '--token'], 'env-tok')).toMatchObject({ code: 1, bound: false });
});
it('--token=<dash value> binds with that token', async () => {
  expect(await serve(['--http', '--token=-Qx7_secretTok3n'])).toEqual({
    code: 0,
    bound: true,
    token: '-Qx7_secretTok3n',
  });
});
it('plain --token and env fallback unchanged', async () => {
  expect((await serve(['--http', '--token', 'plain'])).token).toBe('plain');
  expect((await serve(['--http'], 'env-tok')).token).toBe('env-tok');
});
it('no token at all still binds loopback without one (unchanged default)', async () => {
  expect(await serve(['--http'])).toEqual({ code: 0, bound: true, token: undefined });
});
