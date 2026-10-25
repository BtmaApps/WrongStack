// Real production components and styles, with a fixture automation API/WS transport.
// Live Docker and DOM inspection are exercised separately by the runtime/tools proofs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(root, '../..');
const output = path.join(repository, '.temp_files/competitive-ui');
const virtualId = 'virtual:competitive-improvements-smoke';
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { ThemeProvider } from '/src/components/ThemeProvider.tsx';
import { AutomationWorkspace } from '/src/components/AutomationView.tsx';
import { AutomationPullRequestPanel as WebPR } from '/src/components/AutomationPullRequestPanel.tsx';
import { AutomationEnvironmentRun as WebEnvironment } from '/src/components/AutomationEnvironment.tsx';
import { BrowserElementSelection } from '/src/components/BrowserElementSelection.tsx';
import { BrowserLivePane } from '/src/components/BrowserLivePane.tsx';
import { ChatInput } from '/src/components/ChatInput.tsx';
import { useConfigStore, useSessionStore, useUIStore } from '/src/stores/index.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
import { setActiveSessionLane } from '/src/stores/session-lanes.ts';
const mode = new URLSearchParams(location.search).get('mode');
await i18n.changeLanguage('en');
await i18n.loadNamespaces(['activity','chat','common','settings','setup']);
const sent=[];
window.__evidence = { sent, images: () => useUIStore.getState().draftImages };
const canvas=document.createElement('canvas'); canvas.width=120; canvas.height=40;
const context=canvas.getContext('2d'); context.fillStyle='#245ad2'; context.fillRect(0,0,120,40);
context.fillStyle='white'; context.font='14px sans-serif'; context.fillText('Save changes',12,25);
const selection={browserId:'browser-fixture',ownerId:'leader',url:'https://fixture.test/',title:'Fixture',capturedAt:'2026-10-21T12:00:00Z',selector:'#save-button',tag:'button',role:'button',text:'Save changes',styles:{color:'rgb(255, 255, 255)','background-color':'rgb(36, 90, 210)','font-size':'14px'},bounds:{x:256,y:280,width:120,height:40},viewport:{width:1280,height:800},image:{mimeType:'image/jpeg',data:canvas.toDataURL('image/jpeg').split(',')[1],width:120,height:40}};
const frameCanvas=document.createElement('canvas'); frameCanvas.width=1280; frameCanvas.height=800;
const frameContext=frameCanvas.getContext('2d'); frameContext.fillStyle='#fafafa'; frameContext.fillRect(0,0,1280,800); frameContext.drawImage(canvas,256,280);
const client=getWSClient(), listeners=new Map();
const originalOn=client.on.bind(client);
client.on=(type,handler)=>{
  if(!type.startsWith('browser.live.')) return originalOn(type,handler);
  const registered=listeners.get(type)||new Set(); registered.add(handler); listeners.set(type,registered);
  return ()=>registered.delete(handler);
};
const emit=(type,payload)=>{for(const handler of [...(listeners.get(type)||[])])handler({type,payload});};
Object.defineProperty(client,'isConnected',{get:()=>true});
client.send=(message)=>{
  sent.push(message);
  if(mode==='picker') queueMicrotask(()=>{
    if(message.type==='browser.live.list') emit(message.type,{sessionId:'fixture',sessions:[{id:'browser-fixture',url:selection.url,title:'Fixture'}]});
    if(message.type==='browser.live.watch') emit('browser.live.frame',{sessionId:'fixture',id:'browser-fixture',data:frameCanvas.toDataURL('image/jpeg').split(',')[1],width:1280,height:800});
    if(message.type==='browser.live.pick') emit('browser.live.selection',{sessionId:'fixture',id:'browser-fixture',requestId:message.payload.requestId,selection});
  });
  return true;
};
setActiveSessionLane('fixture'); useUIStore.getState().bindSessionChrome('fixture');
useSessionStore.getState().setEnv({projectName:'Fixture',cwd:'/fixture'});
useConfigStore.setState({provider:'WrongForge',model:'workspace-model',wsConnected:true,wsStatus:{state:'open'}});
createRoot(document.getElementById('root')).render(<ThemeProvider><main className="mx-auto max-w-4xl space-y-4 p-4">
{mode === 'env-web' ? <section className="automation-workspace"><WebEnvironment runId="fixture-run" sessionId="fixture" running/></section> : mode === 'pr-web' || mode === 'repair-web' ? <section className="automation-workspace"><article><WebPR runId="fixture-run" sessionId="fixture"/></article></section> : mode === 'picker' ? <><BrowserLivePane/><ChatInput/></> : mode === 'selection' ? <><BrowserElementSelection selection={selection}/><ChatInput/></> : <AutomationWorkspace sessionId="fixture"/>}
</main></ThemeProvider>);
`;
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, fs: { allow: [repository] } },
  plugins: [
    {
      name: 'competitive-improvements-smoke',
      resolveId: (id) => (id === virtualId ? `\0${virtualId}.tsx` : undefined),
      load: (id) =>
        id === `\0${virtualId}.tsx`
          ? new Bun.Transpiler({
              loader: 'tsx',
              tsconfig: { compilerOptions: { jsx: 'react' } },
            }).transformSync(source)
          : undefined,
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url === '/favicon.ico') {
            res.writeHead(204).end();
            return;
          }
          if (req.url?.split('?')[0] !== '/__competitive') return next();
          const html = await vite.transformIndexHtml(
            req.url,
            `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`,
          );
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        });
      },
    },
  ],
});
let browser;
const errors = [];
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const mode of ['web', 'selection', 'picker', 'pr-web', 'repair-web', 'env-web'])
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', (error) => errors.push(`${mode}/${width}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`${mode}/${width}: ${message.text()}`);
      });
      let job;
      const prRequests = [];
      const prView = { plan: null, receipt: null, ci: null };
      const environment = {
        version: 1,
        name: 'team',
        image: 'trusted:local',
        setupCommands: [['bun', 'install', '--frozen-lockfile']],
        setupTimeoutMs: 300000,
        services: [
          {
            name: 'db',
            image: 'redis:7-alpine',
            command: [],
            healthCommand: ['redis-cli', 'ping'],
            envNames: [],
          },
        ],
        caches: [{ name: 'bun', target: '/home/node/.bun/install/cache' }],
        ports: [{ name: 'preview', port: 3000, protocol: 'http' }],
      };
      const environmentReceipt = {
        version: 1,
        name: 'team',
        fingerprint: 'f'.repeat(64),
        phase: 'candidate',
        status: 'ready',
        network: 'wrongstack-env-fixture',
        services: [
          { name: 'db', imageId: `sha256:${'a'.repeat(64)}`, containerId: 'b'.repeat(64) },
        ],
        caches: [
          {
            name: 'bun',
            target: '/home/node/.bun/install/cache',
            volume: 'owned-cache',
            persistent: true,
          },
        ],
        ports: [{ name: 'preview', port: 3000, protocol: 'http', hostPort: 43123 }],
        setup: [
          {
            argv: ['bun', 'install', '--frozen-lockfile'],
            exitCode: 0,
            durationMs: 50,
            output: 'Setup complete',
            outputSha256: 'e'.repeat(64),
          },
        ],
      };
      await page.route('**/api/automation/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (
          url.pathname.includes('/runs/fixture-run/artifact') &&
          url.searchParams.get('name') === 'environment.json'
        ) {
          assert.equal(url.searchParams.get('sessionId'), 'fixture');
          await route.fulfill({ json: { content: JSON.stringify(environmentReceipt) } });
        } else if (url.pathname.includes('/runs/fixture-run/pr')) {
          prRequests.push(url.pathname);
          assert.equal(url.searchParams.get('sessionId'), 'fixture');
          if (mode.startsWith('repair-'))
            prView.suggestedTarget = {
              repository: 'owner/repo',
              base: 'main',
              title: 'Fix parser',
            };
          if (url.pathname.endsWith('/prepare'))
            prView.plan = {
              version: 1,
              runId: 'fixture-run',
              repository: 'owner/repo',
              base: 'main',
              branch: 'wrongstack/automation/fixture-run',
              baseCommit: 'a'.repeat(40),
              sourceTree: 'b'.repeat(40),
              candidateTree: 'c'.repeat(40),
              patchSha256: 'd'.repeat(64),
              verificationSha256: 'e'.repeat(64),
              title: 'Fix parser',
              body: 'Independent checks passed for the selected candidate.\nReview the changes and hosted CI before merging.',
              files: ['src/parser.ts'],
              createdAt: 1,
              fingerprint: 'f'.repeat(64),
              ...(mode.startsWith('repair-')
                ? { target: { sourceRunId: 'original-run', number: 7, headCommit: '1'.repeat(40) } }
                : {}),
            };
          if (url.pathname.endsWith('/publish')) {
            assert.equal(request.postDataJSON().fingerprint, prView.plan.fingerprint);
            prView.receipt = {
              fingerprint: prView.plan.fingerprint,
              commit: (mode.startsWith('repair-') ? '2' : '1').repeat(40),
              number: 7,
              url: 'https://github.com/owner/repo/pull/7',
              draft: true,
            };
          }
          if (url.pathname.endsWith('/check'))
            prView.ci = {
              commit: prView.receipt.commit,
              checkedAt: 2,
              status: mode.startsWith('repair-') ? 'passed' : 'failed',
              fingerprint: 'c'.repeat(64),
              checks: [
                {
                  name: 'tests',
                  status: 'completed',
                  conclusion: mode.startsWith('repair-') ? 'success' : 'failure',
                },
              ],
            };
          if (url.pathname.endsWith('/follow-up')) {
            assert.equal(request.postDataJSON().fingerprint, prView.ci.fingerprint);
            prView.followUpRunId = 'fixture-repair-run';
          }
          await route.fulfill({ json: prView });
        } else if (request.method() === 'POST' && url.pathname.endsWith('/jobs')) {
          job = {
            ...request.postDataJSON().spec,
            id: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12),
            projectRoot: '/fixture',
            revision: 1,
            createdAt: 0,
            nextRunAt: null,
          };
          await route.fulfill({ json: job });
        } else if (url.pathname.endsWith('/state'))
          await route.fulfill({ json: { jobs: job ? [job] : [], runs: [], workerOnline: false } });
        else await route.fulfill({ json: { nextRunTimes: [], missingReferences: [] } });
      });
      await page.goto(
        `http://127.0.0.1:${server.httpServer.address().port}/__competitive?mode=${mode}`,
      );
      if (mode.startsWith('env-')) {
        await page.getByText('Environment status', { exact: true }).click();
        await expect(
          page.getByRole('link', { name: 'Open local preview', exact: true }),
        ).toHaveAttribute('href', 'http://127.0.0.1:43123');
        await page.screenshot({
          path: path.join(output, `${mode}-active-${width}.png`),
          fullPage: true,
        });
        environmentReceipt.status = 'removed';
        await page.reload();
        await page.getByText('Environment status', { exact: true }).click();
        await expect(page.getByText('team · removed · candidate', { exact: true })).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'Open local preview', exact: true }),
        ).toHaveCount(0);
      } else if (mode.startsWith('pr-') || mode.startsWith('repair-')) {
        await page.getByRole('button', { name: 'Review draft PR', exact: true }).click();
        if (mode.startsWith('repair-'))
          await expect(page.getByLabel('PR repository', { exact: true })).toHaveValue('owner/repo');
        await page.getByLabel('PR repository', { exact: true }).fill('owner/repo');
        await page.getByLabel('PR title', { exact: true }).fill('Fix parser');
        await page.getByRole('button', { name: 'Prepare PR plan', exact: true }).click();
        await expect(page.getByText('src/parser.ts', { exact: true })).toBeVisible();
        assert.equal(
          prRequests.some((route) => route.endsWith('/publish')),
          false,
        );
        await page.getByText('Verification and publication plan', { exact: true }).click();
        await page
          .getByRole('button', {
            name: mode.startsWith('repair-')
              ? 'Publish verified update to the same PR'
              : 'Publish draft PR to GitHub',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('link', { name: 'Open draft PR #7', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Refresh CI', exact: true }).click();
        await expect(
          page.getByText(mode.startsWith('repair-') ? 'tests: success' : 'tests: failure', {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(
          prRequests.some((route) => route.endsWith('/follow-up')),
          false,
        );
        if (!mode.startsWith('repair-')) {
          await page.getByRole('button', { name: 'Queue CI repair', exact: true }).click();
          await expect(page.getByText('fixture-repair-run', { exact: true })).toBeVisible();
        }
      } else if (mode === 'selection' || mode === 'picker') {
        if (mode === 'picker') {
          const pick = page.getByRole('button', { name: 'Pick element', exact: true });
          await pick.click();
          const target = page.getByRole('button', {
            name: 'Select an element in the browser preview',
          });
          await expect(target).toBeVisible();
          await pick.press('Escape');
          await expect(target).toHaveCount(0);
          await pick.click();
          const bounds = await target.boundingBox();
          assert(bounds);
          await target.click({ position: { x: bounds.width * 0.25, y: bounds.height * 0.375 } });
          await expect(page.getByText('#save-button', { exact: true })).toBeVisible();
          const request = await page.evaluate(
            () =>
              window.__evidence.sent.findLast((message) => message.type === 'browser.live.pick')
                .payload,
          );
          assert(
            Math.abs(request.x - 0.25) < 0.005 && Math.abs(request.y - 0.375) < 0.005,
            'Preview coordinates must map to viewport fractions',
          );
          assert.equal(request.sessionId, 'fixture');
        }
        await page.getByRole('button', { name: 'Add to prompt' }).click();
        await expect(page.locator('textarea')).toContainText('');
        await expect.poll(() => page.locator('textarea').inputValue()).toContain('#save-button');
        await expect.poll(() => page.evaluate(() => window.__evidence.images().length)).toBe(1);
        await expect(page.locator('img[src^="data:image/jpeg"]')).toHaveCount(
          mode === 'picker' ? 3 : 2,
        );
        assert(
          !(await page.evaluate(() => window.__evidence.sent)).some((message) =>
            ['user_message', 'message', 'user.message'].includes(message.type),
          ),
          'Context review must not send a model request',
        );
      } else {
        await page.getByLabel('Name', { exact: true }).fill('Verified review');
        await page.getByLabel('Runtime image').fill('trusted:local');
        await page.getByLabel('Task', { exact: true }).fill('Fix the parser');
        await page.getByText('Import, edit or export environment JSON', { exact: true }).click();
        await page
          .getByLabel('Environment profile JSON', { exact: true })
          .fill(
            JSON.stringify({ type: 'wrongstack.environment', version: 1, profile: environment }),
          );
        await page
          .getByRole('button', { name: 'Load environment for review', exact: true })
          .click();
        await expect(
          page.getByRole('link', { name: 'Download environment JSON', exact: true }),
        ).toBeVisible();
        await page.getByText('Import, edit or export environment JSON', { exact: true }).click();
        await page.getByText('Credentials and execution limits', { exact: true }).click();
        await page
          .getByLabel('Verification commands')
          .fill('bun install --frozen-lockfile\nbun run test');
        await page.getByRole('button', { name: 'Create job', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
        assert.deepEqual(job.verification, {
          commands: [
            ['bun', 'install', '--frozen-lockfile'],
            ['bun', 'run', 'test'],
          ],
          timeoutMs: 300000,
        });
        assert.deepEqual(job.environment, environment);
      }
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${mode}/${width} horizontally overflows`,
      );
      await page.screenshot({ path: path.join(output, `${mode}-${width}.png`), fullPage: true });
      await page.close();
    }
  assert.deepEqual(errors, []);
  process.stdout.write(
    'PASS: 12 WebUI environment, verification, draft PR/CI and browser context scenarios at 1440px and 390px; no browser errors\n',
  );
} finally {
  await browser?.close();
  await server.close();
}
