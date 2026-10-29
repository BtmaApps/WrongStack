import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Unsaved SKILL.md edits survive a renderer reload, are not applied over a skill
 * file that changed on disk until reviewed, and are removed after a verified save.
 */
export async function exerciseNativeSkillDrafts({
  page,
  project,
  openLibrary,
  skillRoot,
  artifactDir,
}) {
  const formKey =
    'skill-editor:' +
    createHash('sha256')
      .update(JSON.stringify(['skill-editor', null, 'project', 'native-desktop-skill']))
      .digest('hex');
  const stored = () =>
    page.evaluate(
      (params) =>
        window.__TAURI_INTERNALS__.invoke('host_request', { method: 'form-draft.get', params }),
      { projectId: project.id, formKey },
    );
  const until = async (check, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await check();
      if (value) return value;
      await page.waitForTimeout(100);
    }
    throw Error(`Timed out: ${label}`);
  };
  const source = page.getByLabel('Skill Markdown source');
  const open = async () => {
    await openLibrary();
    await page.getByLabel('Filter skill source').selectOption('project');
    await page
      .getByRole('button', { name: 'Open skill native-desktop-skill', exact: true })
      .click();
  };
  const file = join(skillRoot, 'SKILL.md');
  const disk = await readFile(file, 'utf8');
  const parked = `${disk}\n## Parked edit\n\nSurvives a desktop reload.\n`;
  await open();
  await page.getByRole('button', { name: 'Edit skill', exact: true }).click();
  await source.fill(parked);
  const saved = await until(async () => {
    const draft = await stored();
    return draft.value?.body === parked ? draft : null;
  }, 'Skill edits acknowledged in native storage');
  assert.equal(saved.value.base, disk);

  await page.reload();
  await open();
  await page.getByRole('status').filter({ hasText: 'Restored unsaved edits' }).waitFor();
  assert.equal(await source.inputValue(), parked);

  // The skill file changes elsewhere: earlier edits are shown, not applied.
  const external = `${disk}\n## External change\n`;
  await writeFile(file, external);
  await page.reload();
  await open();
  const review = page.getByRole('region', { name: 'Earlier skill edits', exact: true });
  await review.waitFor();
  assert.equal(await source.count(), 0, 'Older edits are not loaded into the editor silently');
  // The review shows only what changed: the external heading removed, the parked heading added.
  await review.locator('.diff-line-add').filter({ hasText: '## Parked edit' }).waitFor();
  await review.locator('.diff-line-remove').filter({ hasText: '## External change' }).waitFor();
  await page.screenshot({
    path: join(artifactDir, 'native-skill-draft-review.png'),
    fullPage: true,
  });
  await review.getByRole('button', { name: 'Continue with my edits', exact: true }).click();
  assert.equal(await source.inputValue(), parked);
  await until(
    async () => (await stored()).value?.base === external,
    'Edits rebased on reviewed file',
  );
  await page.getByRole('button', { name: 'Save skill', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Skill saved and verified.' }).waitFor();
  assert.equal(await readFile(file, 'utf8'), parked);
  await until(async () => (await stored()).value === null, 'Edits cleared after verified save');
  console.log(
    'PASS: native skill edit drafts: reload restore, changed-file review without silent apply, explicit continue and cleanup after verified save',
  );
}
