import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { DefaultSecretVault } from '@wrongstack/core/security';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const surface = process.argv.includes('--webui') ? 'webui' : 'simpleui';
const refreshFixture = process.argv.includes('--refresh-fixture');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-auth-live-'));
const state = path.join(dir, 'state');
const profile = path.join(state, 'profiles/default/config.json');
await fs.mkdir(path.dirname(profile), { recursive: true });
await fs.writeFile(
  path.join(state, 'config.json'),
  JSON.stringify({ version: 1, activeProfile: 'default' }),
);
await fs.writeFile(
  profile,
  JSON.stringify({
    version: 1,
    provider: 'wrongstack-setup',
    model: 'setup',
    uiLocale: 'en',
    features: { modelsRegistry: false, memory: false, mcp: false, plugins: false, skills: false },
    providers: {
      personal: {
        type: 'openai',
        family: 'openai',
        apiKey: 'fixture-personal-key',
        models: ['same-model'],
      },
    },
    fallbackModels: ['personal/same-model', 'work-native/same-model'],
    favoriteModels: ['work-native/same-model'],
  }),
);
if (refreshFixture) {
  const fixture = JSON.parse(await fs.readFile(profile, 'utf8'));
  fixture.provider = 'refresh-profile';
  fixture.model = 'gpt-5.4';
  fixture.providers['refresh-profile'] = {
    type: 'openai-codex',
    family: 'openai-codex',
    activeKey: 'oauth',
    models: ['gpt-5.4'],
    apiKeys: [
      {
        label: 'oauth',
        apiKey: 'fixture-expired-access',
        refreshToken: 'fixture-old-refresh',
        expiresAt: new Date(0).toISOString(),
        createdAt: '',
      },
    ],
  };
  await fs.writeFile(profile, JSON.stringify(fixture));
}
const reservation = net.createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const source = `import { startWebUI } from ${JSON.stringify(pathToFileURL(path.join(repo, 'packages/webui-server/dist/index.js')).href)};
${
  refreshFixture
    ? `const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0]);
  if (url.startsWith('https://auth.openai.com/')) return Response.json({access_token:'fixture-rotated-access',refresh_token:'fixture-rotated-refresh',expires_in:3600});
  if (url.startsWith('https://chatgpt.com/') && url.includes('/models')) return Response.json({models:[{slug:'gpt-5.4',display_name:'Fixture',context_window:272000}]});
  if (url.startsWith('https://chatgpt.com/')) return new Response('data: {"type":"response.output_text.delta","delta":"fixture auth result"}\\n\\ndata: {"type":"response.completed","response":{"id":"r1","status":"completed","usage":{"input_tokens":5,"output_tokens":1}}}\\n\\n', {headers:{'content-type':'text/event-stream'}});
  return originalFetch(...args);
};`
    : ''
}
await startWebUI({httpPort:${port},wsHost:'127.0.0.1',accessToken:'fixture-live-token',distDir:${JSON.stringify(path.join(repo, `packages/${surface}/dist`))},surface:${JSON.stringify(surface)},open:false});`;
const server = spawn(process.execPath, ['--input-type=module', '-e', source], {
  cwd: dir,
  env: { ...process.env, WRONGSTACK_HOME: state, WEBUI_VERBOSE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
server.stdout.on('data', (chunk) => {
  output = (output + chunk).slice(-12000);
});
server.stderr.on('data', (chunk) => {
  output = (output + chunk).slice(-12000);
});
let browser;
let page;
try {
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Backend exited: ${output}`);
    try {
      ready = (await fetch(url)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(ready, `Backend did not become ready: ${output}`);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (refreshFixture) {
    await page.locator('textarea').first().fill('fixture auth verification');
    const send = page.getByRole('button', { name: /^Send(?: message| \(Enter\))?$/ });
    await expect(send).toBeEnabled();
    await send.click();
    const { loadSavedProviders } = await import(
      pathToFileURL(path.join(repo, 'packages/webui-server/dist/index.js')).href
    );
    const vault = new DefaultSecretVault({ keyFile: path.join(state, '.key') });
    await expect
      .poll(
        async () =>
          (await loadSavedProviders(profile, vault))['refresh-profile']?.apiKeys?.[0]?.refreshToken,
        { timeout: 15000 },
      )
      .toBe('fixture-rotated-refresh');
    const raw = await fs.readFile(profile, 'utf8');
    assert.ok(!raw.includes('fixture-rotated-access') && !raw.includes('fixture-rotated-refresh'));
    console.log(
      'Standalone expired-token refresh persisted through native provider and host wiring.',
    );
  }
  if (surface === 'webui') {
    const { loadSavedProviders } = await import(
      pathToFileURL(path.join(repo, 'packages/webui-server/dist/index.js')).href
    );
    const vault = new DefaultSecretVault({ keyFile: path.join(state, '.key') });
    const saved = () => loadSavedProviders(profile, vault);
    await page.locator('textarea').first().fill('/auth');
    await page.locator('textarea').first().press('Enter');
    await page.getByRole('button', { name: /^Saved \(/ }).click();
    const remove = page.getByRole('button', { name: 'Remove provider personal' });
    await expect(remove).toBeVisible();
    const card = remove.locator('xpath=../../..');
    await card.getByRole('button', { name: 'Add Key', exact: true }).click();
    await card.getByPlaceholder('Key label (e.g. default, production)').fill('backup');
    await card.getByPlaceholder('API key', { exact: true }).fill('fixture-webui-backup');
    await card.getByRole('button', { name: 'Save Key', exact: true }).click();
    await expect.poll(async () => (await saved()).personal?.apiKeys?.length).toBe(2);
    await expect(card.getByPlaceholder('API key', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Set Active', exact: true }).click();
    await expect.poll(async () => (await saved()).personal?.activeKey).toBe('backup');
    await card.getByRole('button', { name: 'Delete key backup' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await saved()).personal.apiKeys.length, 2);
    await card.getByRole('button', { name: 'Delete key backup' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await saved()).personal?.apiKeys?.length).toBe(1);
    assert.equal((await saved()).personal.activeKey, 'default');
    await remove.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(remove).toHaveCount(0);
    assert.deepEqual(JSON.parse(await fs.readFile(profile, 'utf8')).fallbackModels, [
      'work-native/same-model',
    ]);
    assert.deepEqual(errors, []);
    console.log('Live WebUI /auth/key/active/delete HTTP/WS/disk smoke passed.');
  } else {
    await page.getByRole('button', { name: 'Manage provider credentials' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'personal', exact: true })).toBeVisible();
    await dialog.getByLabel('Auth profile alias', { exact: true }).fill('work-native');
    await dialog.getByLabel('Account API key', { exact: true }).fill('fixture-work-key');
    await dialog.getByRole('button', { name: 'Save auth profile' }).click();
    const work = dialog
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'work-native', exact: true }) });
    await expect(work).toBeVisible();
    const { loadSavedProviders } = await import(
      pathToFileURL(path.join(repo, 'packages/webui-server/dist/index.js')).href
    );
    const vault = new DefaultSecretVault({ keyFile: path.join(state, '.key') });
    const saved = () => loadSavedProviders(profile, vault);
    await expect.poll(async () => (await saved())['work-native']?.type).toBe('openai');
    assert.equal((await saved()).personal.apiKey, 'fixture-personal-key');
    await dialog.getByLabel('Provider or saved alias').fill('work-native');
    await dialog.getByLabel('Key label').fill('backup');
    await dialog.getByLabel('API key', { exact: true }).fill('fixture-backup-key');
    await dialog.getByRole('button', { name: 'Save key' }).click();
    await expect.poll(async () => (await saved())['work-native']?.apiKeys?.length).toBe(2);
    await work.getByRole('button', { name: 'Use', exact: true }).nth(1).click();
    await expect.poll(async () => (await saved())['work-native']?.activeKey).toBe('backup');
    await work.getByRole('button', { name: 'Delete', exact: true }).nth(1).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await saved())['work-native'].apiKeys.length, 2);
    await work.getByRole('button', { name: 'Delete', exact: true }).nth(1).click();
    await dialog.getByRole('button', { name: 'Confirm deletion' }).click();
    await expect.poll(async () => (await saved())['work-native']?.apiKeys?.length).toBe(1);
    assert.equal((await saved())['work-native'].activeKey, 'default');
    const raw = await fs.readFile(profile, 'utf8');
    assert.ok(!raw.includes('fixture-work-key') && !raw.includes('fixture-personal-key'));
    await work.getByRole('button', { name: 'Remove provider' }).click();
    await dialog.getByRole('button', { name: 'Confirm deletion' }).click();
    await expect(work).toHaveCount(0);
    const removed = JSON.parse(await fs.readFile(profile, 'utf8'));
    assert.deepEqual(removed.fallbackModels, ['personal/same-model']);
    assert.ok(!removed.favoriteModels?.includes('work-native/same-model'));
    assert.ok((await saved()).personal);
    assert.deepEqual(errors, []);
    console.log('Live SimpleUI auth HTTP/WS/disk smoke passed.');
  }
} catch (error) {
  console.error(
    'Auth backend smoke failed:',
    error.message,
    output,
    await page
      ?.locator('body')
      .innerText()
      .catch(() => 'unavailable'),
  );
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise((resolve) =>
    server.exitCode !== null || server.signalCode !== null
      ? resolve()
      : server.once('exit', resolve),
  );
  if (process.platform === 'win32') {
    const literalDir = dir.replaceAll("'", "''");
    const ids = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${literalDir}') } | ForEach-Object { $_.ProcessId }`,
      ],
      { encoding: 'utf8', windowsHide: true },
    )
      .trim()
      .split(/\s+/)
      .filter((id) => /^\d+$/.test(id));
    for (const id of ids) {
      try {
        execFileSync('taskkill.exe', ['/PID', id, '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {}
    }
  }
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
