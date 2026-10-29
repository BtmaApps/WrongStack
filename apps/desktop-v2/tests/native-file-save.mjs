import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const hash = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Overwrite is bound to the disk version the user reviewed, and the real engine
 * refuses a write whose expected version is no longer on disk.
 */
export async function exerciseVersionBoundSave({
  page,
  editor,
  waitFor,
  project,
  rpc,
  artifactDir,
}) {
  const relative = 'desktop-notes/native.ts',
    file = join(project.root, relative);
  const dialog = page.getByRole('dialog', { name: 'File changed on disk', exact: true });
  const overwrite = dialog.getByRole('button', { name: 'Overwrite with my draft', exact: true });
  await editor().fill('export const draft = 1;\n');
  await writeFile(file, 'export const externalOne = 1;\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor();
  // The disk changes again while the review is open: overwrite must not replace this newer edit.
  await writeFile(file, 'export const externalTwo = 2;\n');
  await overwrite.click();
  await waitFor(
    async () => (await dialog.isVisible()) && (await overwrite.isEnabled()),
    'Newer disk version keeps the conflict review open',
  );
  await page.waitForTimeout(300);
  assert.equal(await readFile(file, 'utf8'), 'export const externalTwo = 2;\n');
  assert.ok(await dialog.isVisible(), 'A second external edit is reviewed again');
  await page.screenshot({
    path: join(artifactDir, 'native-file-version-conflict.png'),
    fullPage: true,
  });
  await overwrite.click();
  await dialog.waitFor({ state: 'hidden' });
  await waitFor(
    async () => (await readFile(file, 'utf8')) === 'export const draft = 1;\n',
    'Reviewed overwrite reaches disk',
  );
  assert.equal(await editor().inputValue(), 'export const draft = 1;\n');

  // Engine contract directly: a stale expectation writes nothing and reports the disk version.
  let offset = 0;
  const call = async (type, payload) => {
    const requestId = crypto.randomUUID();
    await rpc('project.send', {
      projectId: project.id,
      message: { type, payload: { ...payload, requestId } },
    });
    return waitFor(async () => {
      const batch = await rpc('project.events', { projectId: project.id, offset });
      offset = batch.offset;
      return batch.events.find((event) => event.payload?.requestId === requestId)?.payload;
    }, `Engine ${type}`);
  };
  const read = await call('files.read', { filePath: relative });
  assert.equal(read.sha256, hash('export const draft = 1;\n'));
  const refused = await call('files.write', {
    filePath: relative,
    content: 'export const stale = true;\n',
    expectedSha256: hash('export const externalTwo = 2;\n'),
  });
  assert.equal(refused.success, false);
  assert.equal(refused.conflict, true);
  assert.equal(refused.currentSha256, read.sha256);
  assert.equal(await readFile(file, 'utf8'), 'export const draft = 1;\n');
  const accepted = await call('files.write', {
    filePath: relative,
    content: 'export const resolved = true;\n',
    expectedSha256: read.sha256,
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.sha256, hash('export const resolved = true;\n'));
  // The editor's baseline is now stale: saving reviews the engine-written version, then reloads it.
  await editor().fill('export const local = true;\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reload from disk', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await editor().inputValue(), 'export const resolved = true;\n');
  assert.equal(await readFile(file, 'utf8'), 'export const resolved = true;\n');
  await waitFor(
    async () => !(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled()),
    'Editor matches the engine-written version',
  );
  console.log(
    'PASS: version-bound file save: reviewed-overwrite refusal for a newer disk edit and engine stale-hash refusal',
  );
}
