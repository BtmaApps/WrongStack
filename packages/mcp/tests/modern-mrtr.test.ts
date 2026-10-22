import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    const base = await realpath(os.tmpdir());
    if (
      path.dirname(directory) !== base ||
      !path.basename(directory).startsWith('wrongstack-mrtr-')
    )
      throw new Error('Refusing fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});
const form = {
  method: 'elicitation/create',
  params: {
    message: 'Choose a branch',
    requestedSchema: {
      type: 'object',
      properties: { branch: { type: 'string' } },
      required: ['branch'],
    },
  },
};
describe('modern MCP multi round-trip calls', () => {
  it('retries HTTP tool calls with validated user answers and exact opaque state', async () => {
    const calls: Array<{ id: number; method: string; params: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const message = JSON.parse(String(init?.body));
      calls.push(message);
      let result: unknown;
      if (message.method === 'server/discover')
        result = {
          resultType: 'complete',
          supportedVersions: ['2026-07-28'],
          capabilities: { tools: {} },
        };
      else if (message.method === 'tools/list')
        result = {
          resultType: 'complete',
          tools: [{ name: 'choose', inputSchema: { type: 'object' } }],
        };
      else if (!message.params.inputResponses)
        result = {
          resultType: 'input_required',
          inputRequests: { choose: form },
          requestState: '\u0000opaque.not-json\u2603',
        };
      else
        result = {
          resultType: 'complete',
          content: [{ type: 'text', text: message.params.inputResponses.choose.content.branch }],
        };
      return Response.json({ jsonrpc: '2.0', id: message.id, result });
    });
    const elicitation = vi.fn(async () => ({
      action: 'accept' as const,
      content: { branch: 'main' },
    }));
    const client = new MCPClient({
      name: 'http-mrtr',
      transport: 'streamable-http',
      url: 'http://127.0.0.1:3123/mcp',
      elicitation,
    });
    try {
      await client.connect();
      expect(await client.callTool('choose', { preserve: 'original' })).toMatchObject({
        content: [{ type: 'text', text: 'main' }],
        isError: false,
      });
      const attempts = calls.filter((call) => call.method === 'tools/call');
      expect(attempts).toHaveLength(2);
      expect(attempts[0]!.id).not.toBe(attempts[1]!.id);
      expect(attempts[1]!.params.requestState).toBe('\u0000opaque.not-json\u2603');
      expect(attempts[1]!.params.arguments).toEqual({ preserve: 'original' });
      expect(
        (attempts[1]!.params._meta as Record<string, unknown>)[
          'io.modelcontextprotocol/clientCapabilities'
        ],
      ).toEqual({
        elicitation: { form: {}, url: {} },
      });
      expect(elicitation).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
    }
  });
  it('completes a real stdio exchange without legacy server-initiated requests', async () => {
    const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'wrongstack-mrtr-'));
    directories.push(directory);
    const file = path.join(directory, 'peer.mjs');
    await writeFile(
      file,
      `import readline from 'node:readline';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); if(m.id===undefined)return;
 let result;
 if(m.method==='server/discover') result={resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
 else if(m.method==='tools/list')result={resultType:'complete',tools:[{name:'choose',inputSchema:{type:'object'}}]};
 else if(!m.params.inputResponses)result={resultType:'input_required',inputRequests:{choose:${JSON.stringify(form)}},requestState:'sealed-state'};
 else { if(m.params.requestState!=='sealed-state'||m.params.inputResponses.choose.content.branch!=='main')throw Error('Bad MRTR retry');result={resultType:'complete',content:[{type:'text',text:'chosen main'}]}; }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});`,
    );
    const client = new MCPClient({
      name: 'stdio-mrtr',
      transport: 'stdio',
      command: process.execPath,
      args: [file],
      elicitation: async () => ({ action: 'accept', content: { branch: 'main' } }),
    });
    try {
      await client.connect();
      expect(await client.callTool('choose', {})).toMatchObject({
        content: [{ type: 'text', text: 'chosen main' }],
      });
    } finally {
      await client.close();
    }
  });
});
