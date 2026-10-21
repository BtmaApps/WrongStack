// F496: `wstack hq --password -x…` left the password in positional, where hqCmd
// echoed it as "Unknown hq subcommand". It must be refused and never printed.
import { expect, it } from 'vitest';

const { parseArgs } = await import('../src/arg-parser.js');
const { hqCmd } = await import('../src/subcommands/handlers/hq.js');

async function run(argv: string[]) {
  const parsed = parseArgs(argv);
  const out: string[] = [];
  const renderer = {
    write: (s: string) => out.push(s),
    writeError: (s: string) => out.push(s),
    writeLine: (s: string) => out.push(s),
  };
  const code = await hqCmd(parsed.positional.slice(1), {
    renderer,
    flags: parsed.flags,
  } as never);
  return { code, text: out.join('') };
}

it('hq --password <dash>: refused, not echoed', async () => {
  const r = await run(['hq', '--password', '-Secret123x']);
  expect(r.code).toBe(1);
  expect(r.text).not.toContain('Secret123x');
  expect(r.text).toContain('--password requires a value');
});
it('hq token --password <dash> (deeper subcommand): refused, not echoed', async () => {
  const r = await run(['hq', 'token', 'list', '--password', '-Secret123x']);
  expect(r.code).toBe(1);
  expect(r.text).not.toContain('Secret123x');
});
it('bare trailing --password: refused', async () => {
  expect((await run(['hq', 'bogus', '--password'])).code).toBe(1);
});
it('unknown non-secret subcommand still reported; help unchanged', async () => {
  const unknown = await run(['hq', 'bogus-sub']);
  expect(unknown.code).toBe(1);
  expect(unknown.text).toContain('Unknown hq subcommand: bogus-sub');
  expect((await run(['hq', 'help'])).code).toBe(0);
});
