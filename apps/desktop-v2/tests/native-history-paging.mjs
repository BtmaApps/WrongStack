import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DefaultSessionStore } from '../../../packages/core/dist/storage/index.js';
import { exerciseNativeHistoryView } from './native-history-view.mjs';

export async function exerciseNativeHistoryPaging({
  page,
  rpc,
  call,
  open,
  paths,
  projectRoot,
  project,
  otherProject,
  waitFor,
  artifactDir,
}) {
  const countBefore = (await rpc('snapshot')).sessions.length;
  const store = new DefaultSessionStore({ dir: paths.projectSessions, projectRoot });
  const needle = 'native-paged-history-needle-only';
  let oldest = '';
  try {
    for (let index = 0; index < 1105; index++) {
      const writer = await store.create({
        id: '2026-01-01/sess_native_paging_' + String(index).padStart(4, '0'),
        title: '',
        provider: 'paging-fixture',
        model: 'paging-fixture',
      });
      if (!index) oldest = writer.id;
      try {
        await writer.append({
          type: 'message_appended',
          version: 1,
          ts: new Date().toISOString(),
          message: { role: 'user', content: index ? 'Retained paging fixture ' + index : needle },
        });
      } finally {
        await writer.close();
      }
      if (index && index % 200 === 0)
        console.log('History fixture: ' + index + ' closed records seeded');
    }
    const legacy = await call('sessions.list', { limit: 5000 });
    assert.equal(
      legacy.sessions.length,
      1000,
      'The legacy catalog RPC still has its documented cap',
    );
    const first = await call('sessions.list', { catalogPage: { limit: 200 } });
    assert.ok(first.catalogPage.total >= 1105);
    assert.equal(first.sessions.length, 200);
    assert.equal(first.catalogPage.truncated, false);
    assert.ok(first.sessions.every((row) => row.id !== first.sessionId));
    const seen = new Set(first.sessions.map((row) => row.id));
    let next = first.catalogPage.nextOffset,
      olderOffset = -1;
    while (next !== null) {
      const result = await call('sessions.list', {
        catalogPage: { limit: 200, offset: next, expectedRevision: first.catalogPage.revision },
      });
      if (result.sessions.some((row) => row.id === oldest)) olderOffset = result.catalogPage.offset;
      for (const row of result.sessions) {
        assert.ok(!seen.has(row.id), 'Catalog pages must not duplicate records');
        seen.add(row.id);
      }
      next = result.catalogPage.nextOffset;
    }
    assert.equal(seen.size, first.catalogPage.total);
    assert.ok(olderOffset >= 1000);
    await open();
    const screen = page.getByRole('region', { name: 'Project session history', exact: true });
    await screen.getByLabel('History page size', { exact: true }).selectOption('200');
    await screen.getByRole('button', { name: 'Refresh session history', exact: true }).click();
    const status = screen.locator('.history-catalog-status > span');
    await waitFor(
      async () => (await status.innerText()).includes('1–200 of'),
      'First bounded history page',
    );
    for (let offset = 200; offset <= olderOffset; offset += 200) {
      await screen.getByRole('button', { name: 'Next history page', exact: true }).click();
      await waitFor(
        async () => (await status.innerText()).includes(offset + 1 + '–'),
        'History page beyond legacy window ' + offset,
        90000,
      );
    }
    await screen.getByRole('button', { name: 'Open history ' + oldest, exact: true }).click();
    await screen
      .getByRole('region', { name: 'Recorded session transcript', exact: true })
      .getByText(needle, { exact: true })
      .waitFor();
    assert.ok(
      await screen.getByRole('button', { name: 'Previous history page', exact: true }).isEnabled(),
    );
    await page.screenshot({
      path: join(artifactDir, 'native-history-beyond-1000.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 800, height: 640 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: join(artifactDir, 'native-history-paging-compact.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1480, height: 960 });
    await screen.getByRole('button', { name: 'Rename recorded session', exact: true }).click();
    const rename = page.getByRole('dialog');
    await rename.getByLabel('Recorded session name', { exact: true }).fill('Paged archive renamed');
    await rename.getByRole('button', { name: 'Save recorded name', exact: true }).click();
    await screen.getByRole('heading', { name: 'Paged archive renamed', exact: true }).waitFor();
    const anchored = await call('sessions.list', { catalogPage: { limit: 200, anchorId: oldest } });
    assert.equal(anchored.sessions.find((row) => row.id === oldest).name, 'Paged archive renamed');
    const stale = await call('sessions.list', { catalogPage: { limit: 200 } });
    const added = await store.create({
      id: '2026-01-01/sess_native_paging_new_member',
      title: '',
      provider: 'paging-fixture',
      model: 'paging-fixture',
    });
    try {
      await added.append({
        type: 'message_appended',
        version: 1,
        ts: new Date().toISOString(),
        message: { role: 'user', content: 'New catalog membership' },
      });
    } finally {
      await added.close();
    }
    await assert.rejects(
      call('sessions.list', {
        catalogPage: { limit: 200, offset: 200, expectedRevision: stale.catalogPage.revision },
      }),
      /catalog changed/,
    );
    await screen.getByRole('button', { name: 'Previous history page', exact: true }).click();
    await screen.getByRole('alert').filter({ hasText: 'catalog changed' }).waitFor();
    await screen.getByRole('button', { name: 'Refresh session history', exact: true }).click();
    await waitFor(
      async () => (await status.innerText()).includes('1–200 of'),
      'Explicit catalog refresh after stale continuation',
    );
    const disclosure = screen.locator('.history-search-disclosure');
    if (!(await disclosure.evaluate((element) => element.open)))
      await disclosure.locator('summary').click();
    const search = screen.getByRole('region', {
      name: 'Search across project conversations',
      exact: true,
    });
    await search.getByLabel('Search conversation content', { exact: true }).fill(needle);
    await search.getByRole('button', { name: 'Search conversations', exact: true }).click();
    await search
      .getByRole('status')
      .filter({ hasText: 'Search complete.' })
      .waitFor({ timeout: 240000 });
    const progress = /([0-9]+) of ([0-9]+) records checked/.exec(
      await search.getByRole('status').innerText(),
    );
    assert.ok(progress);
    assert.equal(progress[1], progress[2]);
    assert.ok(Number(progress[2]) > 1000);
    await search
      .getByRole('button', { name: 'Read search match ' + oldest + ' message 1', exact: true })
      .click();
    const currentAnchor = await call('sessions.list', {
      catalogPage: { limit: 200, anchorId: oldest },
    });
    await waitFor(
      async () => (await status.innerText()).includes(currentAnchor.catalogPage.offset + 1 + '–'),
      'Search hit anchors to its actual older catalog page',
      90000,
    );
    await screen.getByRole('button', { name: 'Open history ' + oldest, exact: true }).waitFor();
    assert.ok((await screen.locator('.history-catalog > button').count()) <= 200);
    await screen
      .getByRole('region', { name: 'Recorded session transcript', exact: true })
      .getByText(needle, { exact: true })
      .waitFor();
    await page.screenshot({
      path: join(artifactDir, 'native-history-full-catalog-search.png'),
      fullPage: true,
    });
    await exerciseNativeHistoryView({
      page,
      open,
      project,
      otherProject,
      store,
      call,
      oldest,
      needle,
      waitFor,
      artifactDir,
    });
    assert.equal(
      (await rpc('snapshot')).sessions.length,
      countBefore,
      'Paged library reads and closed fixtures create no desktop conversations',
    );
    console.log(
      'PASS: real catalog >1000 with no duplicate pages, native deep-page read/rename, stale continuation refusal, full-catalog text search and exact-ID anchor navigation without new desktop sessions',
    );
  } finally {
    await store.dispose();
  }
}
