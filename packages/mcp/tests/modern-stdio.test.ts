import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';

it('uses modern stdio wire metadata and refuses unadvertised server interactions', async () => {
  const base = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(base, 'wrongstack-modern-stdio-'));
  if (
    path.dirname(path.resolve(directory)) !== base ||
    !path.basename(directory).startsWith('wrongstack-modern-stdio-')
  )
    throw new Error('Refusing fixture outside the temporary base');
  const file = path.join(directory, 'peer.mjs');
  await writeFile(
    file,
    `
import readline from 'node:readline';
const send = (value) => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  if (message.method === 'initialize') throw new Error('Modern peer must not receive initialize');
  const meta = message.params?._meta;
  if (meta?.['io.modelcontextprotocol/protocolVersion'] !== '2026-07-28' ||
      meta?.['io.modelcontextprotocol/clientInfo']?.name !== 'wrongstack' ||
      JSON.stringify(meta?.['io.modelcontextprotocol/clientCapabilities']) !== '{}')
    throw new Error('Required modern metadata missing');
  let result;
  if (message.method === 'server/discover') result = { resultType:'complete', supportedVersions:['2026-07-28'], capabilities:{tools:{}} };
  else if (message.method === 'tools/list') result = { resultType:'complete', tools:[{name:'ask',inputSchema:{type:'object'}}] };
  else if (message.params.name === 'url') {
    send({jsonrpc:'2.0',id:message.id,error:{code:-32042,message:'Authorization required',data:{elicitations:[{mode:'url',elicitationId:'auth',url:'https://example.test/auth',message:'Must not open'}]}}});
    return;
  }
  else {
    send({jsonrpc:'2.0', id:9001, method:'elicitation/create', params:{message:'Must not prompt',requestedSchema:{type:'object',properties:{}}}});
    result = {resultType:'input_required',inputRequests:[]};
  }
  send({jsonrpc:'2.0',id:message.id,result});
});
`,
  );
  const elicitation = vi.fn();
  const client = new MCPClient({
    name: 'wire-fixture',
    transport: 'stdio',
    command: process.execPath,
    args: [file],
    elicitation,
  });
  try {
    await client.connect();
    expect(client.getServerMetadata()?.protocolVersion).toBe('2026-07-28');
    expect(client.listTools().map((tool) => tool.name)).toEqual(['ask']);
    await expect(client.callTool('ask', {})).rejects.toThrow('unsupported multi-round-trip');
    expect((await client.callTool('url', {})).urlElicitations).toBeUndefined();
    expect(elicitation).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
