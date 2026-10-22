import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { MCPClient } from '../src/client.js';

it('polls, answers and cancels modern tasks through a real stdio process', async () => {
  const tempBase = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(tempBase, 'wrongstack-tasks-stdio-'));
  if (
    path.dirname(path.resolve(directory)) !== tempBase ||
    !path.basename(directory).startsWith('wrongstack-tasks-stdio-')
  )
    throw new Error('Refusing fixture outside temporary base');
  const file = path.join(directory, 'peer.mjs');
  await writeFile(
    file,
    `
import readline from 'node:readline';
const task = {taskId:'stdio-task',status:'working',createdAt:new Date().toISOString(),lastUpdatedAt:new Date().toISOString(),ttlMs:null,pollIntervalMs:1};
let tools=0, answer;
readline.createInterface({input:process.stdin}).on('line',(line)=>{
 const m=JSON.parse(line);
 if(m.method.startsWith('notifications/')) throw new Error('No legacy notification allowed');
 let result;
 if(m.method==='server/discover') result={resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{},extensions:{'io.modelcontextprotocol/tasks':{}}}};
 else if(m.method==='tools/list') result={resultType:'complete',tools:[{name:'build',inputSchema:{type:'object'}}]};
 else {
  if(!m.params._meta['io.modelcontextprotocol/clientCapabilities'].extensions?.['io.modelcontextprotocol/tasks']) throw new Error('Missing Tasks opt-in');
  if(m.method==='tools/call') {tools++; result={resultType:'task',...task};}
  else if(m.params.taskId!=='stdio-task') throw new Error('Wrong task routing');
  else if(m.method==='tasks/cancel') result={resultType:'complete'};
  else if(m.method==='tasks/update') {answer=m.params.inputResponses.branch.content.branch;result={resultType:'complete'};}
  else result=answer ? {resultType:'complete',...task,status:'completed',result:{content:[{type:'text',text:answer+':'+tools}]}} : {resultType:'complete',...task,status:'input_required',inputRequests:{branch:{method:'elicitation/create',params:{message:'Choose',requestedSchema:{type:'object',properties:{branch:{type:'string'}},required:['branch']}}}}};
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});
`,
  );
  const client = new MCPClient({
    name: 'stdio-task',
    transport: 'stdio',
    command: process.execPath,
    args: [file],
    elicitation: async () => ({ action: 'accept', content: { branch: 'main' } }),
  });
  try {
    await client.connect();
    expect(await client.callTool('build', {})).toMatchObject({ content: [{ text: 'main:1' }] });
    const abort = new AbortController();
    await expect(
      client.callTool(
        'build',
        {},
        { signal: abort.signal, tasks: { onStatus: () => abort.abort() } },
      ),
    ).rejects.toMatchObject({ name: 'AbortError', taskId: 'stdio-task' });
    expect((await client.getTask('stdio-task')).status).toBe('completed');
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
