import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const sourcePath = [
  resolve('src/components/ChatView/utils.ts'),
  resolve('packages/webui/src/components/ChatView/utils.ts'),
].find(existsSync);
if (!sourcePath) throw new Error('WebUI source was not found from package or repository cwd');
const source = pathToFileURL(sourcePath).href;
it.each([
  ['America/New_York', '2026-03-09T04:30:00Z', '2026-03-08T16:00:00Z'],
  ['America/New_York', '2026-11-02T04:30:00Z', '2026-10-31T16:00:00Z'],
  ['UTC', '2026-03-09T04:30:00Z', '2026-03-08T16:00:00Z'],
])('labels calendar yesterday in isolated %s at %s', (timezone, nowText, pastText) => {
  const code = `import { buildChatRows } from ${JSON.stringify(source)}; const now=Date.parse(${JSON.stringify(nowText)}); const label=timestamp=>buildChatRows([{id:'m',role:'user',content:'x',timestamp}],now).find(r=>r.kind==='day').label; console.log(JSON.stringify([label(Date.parse(${JSON.stringify(pastText)})),label(now),buildChatRows([],now)]));`;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', code],
    { env: { ...process.env, TZ: timezone }, encoding: 'utf8', windowsHide: true, timeout: 20000 },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(['Yesterday', 'Today', []]);
});
