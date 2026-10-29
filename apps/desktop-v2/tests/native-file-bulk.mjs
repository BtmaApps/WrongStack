import assert from 'node:assert/strict';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Picked folder-listing items are moved and deleted on disk, one engine operation each. */
export async function exerciseNativeFileBulk({ page, project, tool, waitFor }) {
  const source = join(project.root, 'bulk-ops'),
    target = join(project.root, 'bulk-dest');
  await mkdir(source, { recursive: true });
  await mkdir(target, { recursive: true });
  for (const name of ['a.txt', 'b.txt', 'c.txt']) await writeFile(join(source, name), `${name}\n`);
  try {
    await tool('Files').click();
    await page.getByRole('button', { name: 'Refresh file manager', exact: true }).click();
    const tree = page.getByRole('tree', { name: 'Project directory tree', exact: true });
    await tree.getByRole('treeitem', { name: 'bulk-ops', exact: true }).click();
    await page.getByRole('button', { name: 'Open bulk-ops/a.txt', exact: true }).waitFor();

    await page.getByRole('button', { name: 'Select items', exact: true }).click();
    await page.getByRole('button', { name: 'Select bulk-ops/a.txt', exact: true }).click();
    await page.getByRole('button', { name: 'Select bulk-ops/b.txt', exact: true }).click();
    const bar = page.getByRole('toolbar', { name: 'Selected items', exact: true });
    await bar.getByText('2 selected', { exact: true }).waitFor();
    await bar.getByRole('button', { name: 'Move selected…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Move 2 selected items', exact: true });
    await dialog.getByLabel('Bulk move destination', { exact: true }).fill('bulk-dest');
    await dialog.getByRole('button', { name: 'Move 2 to bulk-dest', exact: true }).click();
    await page.getByText('Moved 2 of 2 items.', { exact: true }).waitFor();
    for (const name of ['a.txt', 'b.txt']) {
      assert.equal(await exists(join(target, name)), true, `${name} moved into bulk-dest`);
      assert.equal(await exists(join(source, name)), false, `${name} left bulk-ops`);
    }
    assert.equal(await bar.count(), 0, 'Moved items leave the selection');

    // Ctrl-click picks an item outside selection mode.
    await page.getByRole('button', { name: 'Done selecting', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open bulk-ops/c.txt', exact: true })
      .click({ modifiers: ['Control'] });
    await bar.getByText('1 selected', { exact: true }).waitFor();
    await bar.getByRole('button', { name: 'Delete selected…', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete 1 selected item', exact: true })
      .getByRole('button', { name: 'Delete 1', exact: true })
      .click();
    await page.getByText('Deleted 1 of 1 items.', { exact: true }).waitFor();
    await waitFor(async () => !(await exists(join(source, 'c.txt'))), 'Selected file deleted');
    console.log('PASS: native bulk file actions: move two picked files, Ctrl-click delete');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await page.getByRole('button', { name: 'Refresh file manager', exact: true }).click();
  }
}
