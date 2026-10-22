import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MCPClient } from '../../src/client.js';
import type { MCPTaskContext } from '../../src/task-identity.js';
import { MCPTaskRecovery } from '../../src/task-recovery.js';

export async function taskBindingFence(mode: 'control' | 'dispose' | 'owner' | 'abort') {
  const base = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(base, 'wrongstack-binding-fence-'));
  if (
    path.dirname(directory) !== base ||
    !path.basename(directory).startsWith('wrongstack-binding-fence-')
  )
    throw new Error('Unsafe fixture directory');
  const callsFile = path.join(directory, 'calls.jsonl');
  await writeFile(callsFile, '');
  const peer = path.join(directory, 'peer.mjs');
  await writeFile(
    peer,
    `
import readline from 'node:readline';
import {appendFileSync} from 'node:fs';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 appendFileSync(process.argv[2],JSON.stringify(m.method)+'\\n');
 const result=m.method==='server/discover'
  ? {resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{},extensions:{'io.modelcontextprotocol/tasks':{}}}}
  : m.method==='tools/list'
  ? {resultType:'complete',tools:[{name:'build',inputSchema:{type:'object'}}]}
  : {resultType:'complete',content:[{type:'text',text:'done'}]};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});
`,
  );
  const entered = Promise.withResolvers<void>();
  const grant = Promise.withResolvers<string>();
  const abort = new AbortController();
  let sessionId = 'session-a';
  const context = {
    session: { id: sessionId },
    eventSessionId: () => sessionId,
    agentId: 'leader',
    signal: abort.signal,
  } as MCPTaskContext;
  const client = new MCPClient({
    name: 'binding-fence',
    transport: 'stdio',
    command: process.execPath,
    args: [peer, callsFile],
    cwd: directory,
    authorizationProvider: {
      getAccessToken: async () => undefined,
      getTaskIdentity: () => {
        entered.resolve();
        return grant.promise;
      },
    },
  });
  const recovery = new MCPTaskRecovery(path.join(directory, 'tasks'), {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    withClient: async () => {
      throw new Error('Unexpected recovery');
    },
  } as never);
  try {
    await client.connect();
    const pending = recovery
      .execute(client, { name: 'build', inputSchema: {} }, {}, context, abort.signal)
      .then(
        () => 'completed',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    await entered.promise;
    if (mode === 'dispose') recovery.dispose();
    if (mode === 'owner') sessionId = 'session-b';
    if (mode === 'abort') abort.abort();
    grant.resolve('grant-a');
    const outcome = await pending;
    const calls = (await readFile(callsFile, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string);
    return { calls: calls.filter((method) => method === 'tools/call').length, outcome };
  } finally {
    grant.resolve('grant-a');
    recovery.dispose();
    await recovery.drain();
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
}
