import assert from 'node:assert/strict';
import { appendFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * More recorded prompts than one page: the journal says older entries exist and loads them page
 * by page through the engine's `until` bound until the oldest seeded prompt is visible.
 */
export async function exerciseNativeJournalPaging({ dialog, project, identity, waitFor }) {
  const count = 150;
  const day = join(project.root, '.wrongstack', 'prompts', '2026-01', '2026-01-15');
  const leaf = identity.sessionId.split(/[/]/u).pop();
  await mkdir(day, { recursive: true });
  const lines = Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      id: `native-paging-${index}`,
      timestamp: new Date(Date.UTC(2026, 0, 15, 0, 0, index)).toISOString(),
      sessionId: identity.sessionId,
      role: 'user',
      category: 'raw_user',
      content: `native-paging-${String(index).padStart(3, '0')}`,
      metadata: {},
    }),
  );
  await appendFile(join(day, `session-${leaf}.jsonl`), `${lines.join('\n')}\n`);
  try {
    await dialog.getByRole('textbox', { name: 'Search prompt journal', exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Refresh prompt journal', exact: true }).click();
    const footer = dialog.locator('.journal-limit');
    await footer.getByText(/older entries exist beyond what is loaded/).waitFor();
    const older = dialog.getByRole('button', { name: 'Load older entries', exact: true });
    const rows = dialog.locator('.prompt-journal-list details');
    let pages = 0;
    while (await older.isEnabled()) {
      const before = await rows.count();
      await older.click();
      pages++;
      await waitFor(
        async () =>
          (await rows.count()) > before ||
          (await footer.getByText(/older entries exist/).count()) === 0,
        'Older journal page loaded',
      );
      assert.ok(pages < 10, 'Paging terminates');
    }
    await dialog
      .getByRole('textbox', { name: 'Search prompt journal', exact: true })
      .fill('native-paging-000');
    await waitFor(
      async () => (await dialog.locator('.prompt-journal-list details').count()) === 1,
      'Oldest seeded prompt reached by paging',
    );
    assert.equal(await footer.getByText(/older entries exist/).count(), 0);
    console.log(
      `PASS: native prompt journal paging: ${count} seeded entries in ${pages} older pages`,
    );
  } finally {
    await rm(day, { recursive: true, force: true });
    await dialog.getByRole('textbox', { name: 'Search prompt journal', exact: true }).fill('');
  }
}
