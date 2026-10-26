import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function exerciseNativeFiles({ page, waitFor, artifactDir, project, rpc }) {
  const tool = (name) =>
    page
      .getByRole('navigation', { name: `${project.name} workspace` })
      .getByRole('button', { name, exact: true });
  await tool('Files').click();
  await page.getByRole('treeitem', { name: 'packages', exact: true }).click();
  await page.getByRole('treeitem', { name: 'packages/alpha', exact: true }).click();
  await page.getByRole('treeitem', { name: 'packages/alpha/src', exact: true }).click();
  await page.getByRole('treeitem', { name: 'packages/alpha/src/index.ts', exact: true }).click();
  await page
    .getByRole('region', { name: 'Source of packages/alpha/src/index.ts', exact: true })
    .waitFor();
  const drawer = () => page.getByRole('region', { name: 'File details panel', exact: true });
  await drawer().waitFor();
  const resize = page.getByRole('separator', { name: 'Resize file details', exact: true });
  const original = Number(await resize.getAttribute('aria-valuenow'));
  await resize.focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(Number(await resize.getAttribute('aria-valuenow')), original + 20);
  await drawer().getByRole('button', { name: 'Memory', exact: true }).click();
  await page
    .locator('.file-related-memories')
    .getByText('Native SAGE proposal keeps file boundaries explicit.', { exact: true })
    .waitFor();
  await drawer().getByRole('button', { name: 'Structure', exact: true }).click();
  await page.locator('.file-structure pre').filter({ hasText: 'feature' }).waitFor();
  await drawer().getByRole('button', { name: 'Activity', exact: true }).click();
  await page.locator('.file-event-list').waitFor();
  await drawer().getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({
    path: join(artifactDir, 'native-files-tree-drawer.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Collapse file details', exact: true }).click();
  await page.getByRole('button', { name: 'Expand file details', exact: true }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Project-relative path', { exact: true }).fill('desktop-notes');
  await page
    .getByRole('dialog', { name: 'Create folder', exact: true })
    .getByRole('button', { name: 'Create folder', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Create folder', exact: true })
    .waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('Project-relative path', { exact: true }).fill('desktop-notes/native.ts');
  await page
    .getByRole('dialog', { name: 'Create file', exact: true })
    .getByRole('button', { name: 'Create file', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Create file', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Edit file', exact: true }).click();
  const editor = () =>
    page.getByRole('textbox', { name: 'Edit desktop-notes/native.ts', exact: true });
  await editor().fill('export const desktop = 1;\n');
  await page.keyboard.press('Control+s');
  await waitFor(
    async () =>
      (await readFile(join(project.root, 'desktop-notes/native.ts'), 'utf8')) ===
      'export const desktop = 1;\n',
    'Native file save to real disk',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'visible' });
  await waitFor(
    async () => !(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled()),
    'Saved file acknowledgement',
  );
  await editor().fill('export const unsaved = true;\n');
  await page.getByRole('button', { name: 'Close desktop-notes/native.ts', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  assert.equal(await editor().inputValue(), 'export const unsaved = true;\n');
  await writeFile(join(project.root, 'desktop-notes/native.ts'), 'export const external = true;\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'File changed on disk', exact: true })
    .getByRole('button', { name: 'Reload from disk', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'File changed on disk', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await editor().inputValue(), 'export const external = true;\n');
  await editor().fill('export const resolved = true;\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(
    async () =>
      (await readFile(join(project.root, 'desktop-notes/native.ts'), 'utf8')) ===
      'export const resolved = true;\n',
    'Save after external edit review',
  );
  await waitFor(
    async () => !(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled()),
    'Resolved save acknowledgement',
  );
  await page.getByRole('button', { name: 'File actions', exact: true }).click();
  await page
    .locator('.file-context-menu')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  await page.getByLabel('Project-relative path', { exact: true }).fill('desktop-notes/renamed.ts');
  await page
    .getByRole('dialog', { name: 'Rename item', exact: true })
    .getByRole('button', { name: 'Rename item', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Rename item', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(
    await readFile(join(project.root, 'desktop-notes/renamed.ts'), 'utf8'),
    'export const resolved = true;\n',
  );
  await page.getByRole('button', { name: 'File actions', exact: true }).click();
  await page
    .locator('.file-context-menu')
    .getByRole('button', { name: 'Move to folder', exact: true })
    .click();
  await page.getByLabel('Destination folder', { exact: true }).fill('.');
  await page
    .getByRole('dialog', { name: 'Move item', exact: true })
    .getByRole('button', { name: 'Move item', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Move item', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(
    await readFile(join(project.root, 'renamed.ts'), 'utf8'),
    'export const resolved = true;\n',
  );
  await page.getByRole('button', { name: 'File actions', exact: true }).click();
  await page
    .locator('.file-context-menu')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete item', exact: true })
    .getByRole('button', { name: 'Delete item', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Delete item', exact: true }).waitFor({ state: 'hidden' });
  await assert.rejects(access(join(project.root, 'renamed.ts')));
  await tool('Changes').click();
  await page.getByRole('button', { name: 'Review review-fixture.ts', exact: true }).click();
  await page.locator('.diff-line-remove').filter({ hasText: 'reviewed = 1' }).waitFor();
  await page.locator('.diff-line-add').filter({ hasText: 'reviewed = 2' }).waitFor();
  await page.getByRole('button', { name: 'Side by side diff', exact: true }).click();
  await page.locator('.diff-split').waitFor();
  await page.getByRole('button', { name: 'Unified diff', exact: true }).click();
  await page
    .locator('.diff-line-add')
    .getByRole('button', { name: 'Review line 1', exact: true })
    .click();
  await page
    .getByLabel('Review note', { exact: true })
    .fill('Confirm the new value against the project requirement.');
  await page
    .getByRole('dialog', { name: 'Add review note', exact: true })
    .getByRole('button', { name: 'Add review note', exact: true })
    .click();
  await page
    .locator('.file-review-tray')
    .getByText('Confirm the new value against the project requirement.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Stage review-fixture.ts', exact: true }).click();
  await page.getByRole('button', { name: 'Unstage review-fixture.ts', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unstage review-fixture.ts', exact: true }).click();
  await page.getByRole('button', { name: 'Stage review-fixture.ts', exact: true }).waitFor();
  await page.screenshot({ path: join(artifactDir, 'native-diff-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.screenshot({ path: join(artifactDir, 'native-diff-review-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'File review fits a compact native window',
  );
  await page.screenshot({
    path: join(artifactDir, 'native-files-review-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  assert.equal(
    (await rpc('snapshot')).sessions.length,
    0,
    'Files and repository review do not create desktop sessions',
  );
  console.log(
    'PASS: native file tree, evidence drawer/resize, anchored SAGE, structure, create/edit/save/conflict/rename/move/delete, unified/split Git diff, line review and stage/unstage',
  );
}
