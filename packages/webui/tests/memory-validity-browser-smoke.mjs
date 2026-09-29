import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { transform } from 'esbuild';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../../.reports/memory-validity');
await mkdir(output, { recursive: true });
const source = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { MemoryValidity } from '/src/components/MemoryManager/MemoryValidity.tsx';
import { MemoryValidityEditor } from '/src/components/MemoryManager/MemoryValidityEditor.tsx';
import { emptyDraft } from '/src/components/MemoryManager/shared.tsx';
import { useMemoryInjectorTraceStore } from '/src/stores/memory-injector-store.ts';
await i18n.changeLanguage('tr');
useMemoryInjectorTraceStore.getState().pushCompanionReview({memoryId:'probe',observedRevision:3,at:'2026-09-29T00:00:00Z',verdict:'supported',summary:'Kaynakta varsayılan kota üç. Oturum override ayarları bu kaynakla doğrulanamaz.',evidence:[{path:'src/transport/retry-policy.ts',quote:'export const retryQuota = 3;'}]});
const checks = [{type:'source_contains',path:'src/transport/retry-policy.ts',text:'export const retryQuota = 3;'}];
function App() {
 const [draft,setDraft] = useState({...emptyDraft(),validityStatement:'Varsayılan retry politikası kullanıldığında ve oturuma özel override bulunmadığında geçerlidir.',validityChecks:checks});
 return <main className="mx-auto max-w-3xl space-y-5 p-4"><h1 className="text-xl font-semibold">Memory geçerlilik kontrolü</h1><MemoryValidity memoryId="probe" validity={{statement:draft.validityStatement,checks:draft.validityChecks}} revision={3} review={{observedRevision:3,checkedAt:'2026-09-29T00:00:00Z',applicability:'unknown',checks:checks.map(c=>({...c,status:'satisfied'}))}}/><MemoryValidityEditor draft={draft} onChange={setDraft}/></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'memory-validity-smoke',
      resolveId(id) {
        if (id === 'virtual:memory-validity') return '\0memory-validity.tsx';
      },
      async load(id) {
        if (id === '\0memory-validity.tsx')
          return (await transform(source, { loader: 'tsx', jsx: 'automatic', format: 'esm' })).code;
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__memory_validity') return next();
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            await server.transformIndexHtml(
              req.url,
              '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/virtual:memory-validity"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${server.resolvedUrls.local[0]}__memory_validity`);
    await expect(page.getByText('Gözlem sırasında beklenen ifade bulundu')).toBeVisible();
    await expect(
      page.getByLabel('Geçerlilik şartı', { exact: true }).filter({ hasNot: page.locator('h3') }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Kaynak kontrolü ekle' }).click();
    await expect(page.getByLabel('Projeye göre dosya yolu')).toHaveCount(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) throw new Error('Horizontal overflow at ' + width);
    await page.screenshot({ path: path.join(output, `validity-${width}.png`), fullPage: true });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Memory validity browser smoke passed at 1280px and 390px:', output);
} finally {
  await browser.close();
  await server.close();
}
