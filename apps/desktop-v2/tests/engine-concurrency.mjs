import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { portableDirectory } from '../scripts/portable.ts';
import { fixtureKey, fixtureModel, startLocalProvider } from './local-provider.mjs';

const directory = await mkdtemp(join(tmpdir(), 'wrongstack-engine-concurrency-'));
const children = [];
const sockets = [];
const outputLogs = [];
const provider = await startLocalProvider();
const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = resolve(root, '.temp_files/desktop-v2-native');
await mkdir(artifacts, { recursive: true });
const home = join(directory, 'wrongstack');
const project = join(directory, 'project');
await mkdir(join(home, 'profiles/default'), { recursive: true });
await mkdir(project);
await mkdir(join(directory, 'empty'));
await writeFile(join(home, 'config.json'), JSON.stringify({ activeProfile: 'default' }));
await writeFile(
  join(home, 'profiles/default/config.json'),
  JSON.stringify({
    provider: 'desktop-local',
    model: fixtureModel,
    providers: {
      'desktop-local': {
        type: 'openai-compatible',
        family: 'openai-compatible',
        baseUrl: provider.baseUrl,
        models: [fixtureModel],
        customModels: {
          [fixtureModel]: { name: fixtureModel, capabilities: { streaming: true, tools: true } },
        },
        apiKeys: [{ label: 'default', apiKey: fixtureKey }],
        activeKey: 'default',
      },
    },
  }),
);
const environment = {
  ...process.env,
  WRONGSTACK_HOME: home,
  WRONGSTACK_DESKTOP_EMPTY_DIST: join(directory, 'empty'),
  WRONGSTACK_DESKTOP: '1',
  WEBUI_TOKEN: 'isolated-native-concurrency-fixture',
  WEBUI_STRICT_PORT: '1',
};
for (const name of Object.keys(environment))
  if (/(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(name) && name !== 'WEBUI_TOKEN')
    delete environment[name];
const start = async (index) => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(
    join(portableDirectory(resolve(root, 'apps/desktop-v2')), 'wrongstack-engine.exe'),
    ['--port', String(port)],
    { cwd: project, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(child);
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  outputLogs.push(() => output);
  const deadline = Date.now() + 45000;
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw new Error(`Engine ${index} exited ${child.exitCode}: ${output}`);
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${environment.WEBUI_TOKEN}`);
        const identity = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error('Session handshake timeout'));
          }, 10000);
          ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Not ready'));
          };
          ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'session.start') {
              clearTimeout(timer);
              resolve(message.payload);
            }
          };
        });
        sockets.push(ws);
        assert.equal(identity.provider, 'desktop-local');
        assert.notEqual(identity.needsSetup, true);
        console.log(`PASS: engine ${index} ready with saved provider`);
        return identity;
      } catch (error) {
        if (error.code === 'ERR_ASSERTION') throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(`Engine ${index} never became ready: ${output}`);
  } finally {
    await writeFile(join(artifacts, `concurrency-engine-${index}.log`), output);
  }
};
async function chat(index, sessionId) {
  const ws = sockets[index - 1];
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      ws.removeEventListener('message', receive);
      children[index - 1].removeListener('exit', exited);
      error ? reject(error) : resolve();
    };
    const exited = (code) => finish(new Error(`Engine ${index} exited ${code}`));
    const receive = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'run.result') finish();
    };
    const timer = setTimeout(() => finish(new Error(`Engine ${index} chat timed out`)), 30000);
    children[index - 1].once('exit', exited);
    ws.addEventListener('message', receive);
    ws.send(
      JSON.stringify({
        type: 'user_message',
        payload: {
          sessionId,
          id: crypto.randomUUID(),
          content: 'Confirm the saved native provider connection. Do not call tools.',
          timestamp: Date.now(),
        },
      }),
    );
  });
  assert.ok(provider.calls.length >= index);
  console.log(`PASS: engine ${index} completed a real local provider turn`);
}
try {
  const first = await start(1);
  await chat(1, first.sessionId);
  const second = await start(2);
  await chat(2, second.sessionId);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.ok(children.every((child) => child.exitCode === null));
  console.log('PASS: two concurrent standalone engines in the same project');
} finally {
  for (const [index, output] of outputLogs.entries())
    await writeFile(join(artifacts, `concurrency-engine-${index + 1}.log`), output());
  for (const ws of sockets) ws.close();
  for (const child of children) child.kill();
  await provider.close();
  const cleanup = spawn(
    join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$pattern=[regex]::Escape($env:WRONGSTACK_CONCURRENCY_DIR); Get-CimInstance Win32_Process -Filter "Name=\'wrongstack-engine.exe\'" | Where-Object { $_.CommandLine -match $pattern } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ],
    {
      env: { ...process.env, WRONGSTACK_CONCURRENCY_DIR: directory },
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  await new Promise((resolve) => cleanup.once('exit', resolve));
  await rm(directory, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
}
