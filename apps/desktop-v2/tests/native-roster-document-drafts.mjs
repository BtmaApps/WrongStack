import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Unsaved role document text survives a renderer reload; a store that changed
 * meanwhile opens the comparison immediately instead of hiding the difference.
 */
export async function exerciseNativeRosterDocumentDrafts({
  page,
  project,
  role,
  directory,
  open,
  card,
  catalog,
  waitFor,
}) {
  const formKey =
    'roster-document:' +
    createHash('sha256')
      .update(JSON.stringify(['roster-document', role, 'identity', '']))
      .digest('hex');
  const stored = () =>
    page.evaluate(
      (params) =>
        window.__TAURI_INTERNALS__.invoke('host_request', { method: 'form-draft.get', params }),
      { projectId: project.id, formKey },
    );
  const document = page.getByRole('dialog', {
    name: `Identity instructions for ${role}`,
    exact: true,
  });
  const markdown = document.getByLabel('Role document Markdown', { exact: true });
  const reopen = async () => {
    await page.reload();
    await open(project);
    await card(role).click();
    await catalog().getByRole('button', { name: 'Read identity', exact: true }).click();
  };
  await catalog().getByRole('button', { name: 'Read identity', exact: true }).click();
  await document.getByRole('button', { name: 'Edit project text', exact: true }).click();
  await markdown.fill('# Parked identity\n');
  await waitFor(
    async () => (await stored()).value?.text === '# Parked identity\n',
    'Role document draft acknowledged',
  );
  await reopen();
  await document.getByText(/Recovered local draft/).waitFor();
  assert.equal(await markdown.inputValue(), '# Parked identity\n');

  await writeFile(join(directory, 'identity.md'), '# Changed while away\n');
  await reopen();
  const current = document.getByLabel('Current stored role document', { exact: true });
  await current.waitFor();
  // Role loaders trim document boundaries; the comparison shows the canonical stored text.
  assert.equal((await current.inputValue()).trim(), '# Changed while away');
  assert.equal(await markdown.inputValue(), '# Parked identity\n');
  await document.getByRole('button', { name: 'Use stored text', exact: true }).click();
  await waitFor(async () => (await stored()).value === null, 'Reviewed stored text clears draft');
  await document.getByRole('button', { name: 'Close role document', exact: true }).click();
  console.log(
    'PASS: native role document drafts: reload restore and immediate comparison with a changed store',
  );
}

/** An unsaved runtime override survives a renderer reload and is cleared by an explicit discard. */
export async function exerciseNativeRosterRuntimeDraft({
  page,
  project,
  role,
  open,
  card,
  catalog,
  waitFor,
}) {
  const formKey =
    'roster-runtime:' +
    createHash('sha256')
      .update(JSON.stringify(['roster-runtime', role]))
      .digest('hex');
  const stored = () =>
    page.evaluate(
      (params) =>
        window.__TAURI_INTERNALS__.invoke('host_request', { method: 'form-draft.get', params }),
      { projectId: project.id, formKey },
    );
  const runtime = () =>
    page.getByRole('dialog', { name: `Runtime policy for ${role}`, exact: true });
  const tools = () => runtime().getByLabel('Role Tool calls', { exact: true });
  await catalog().getByRole('button', { name: 'Edit runtime policy', exact: true }).click();
  await tools().fill('55');
  await waitFor(
    async () => String((await stored()).value?.draft?.budget?.maxToolCalls) === '55',
    'Runtime draft acknowledged',
  ).catch(async (error) => {
    throw Error(`${error.message}; stored: ${JSON.stringify(await stored()).slice(0, 600)}`);
  });
  await page.reload();
  await open(project);
  await card(role).click();
  await catalog().getByRole('button', { name: 'Edit runtime policy', exact: true }).click();
  await runtime()
    .getByText(/unsaved runtime draft has been recovered/)
    .waitFor();
  assert.equal(await tools().inputValue(), '55');
  await runtime().getByRole('button', { name: 'Close role runtime', exact: true }).click();
  await runtime().getByRole('button', { name: 'Discard runtime draft', exact: true }).click();
  await waitFor(async () => (await stored()).value === null, 'Discarded runtime draft cleared');
  console.log('PASS: native roster runtime draft: reload restore and explicit discard');
}

/** The unsent role-creation form survives a renderer reload and clears when emptied. */
export async function exerciseNativeRosterCreateDraft({ page, project, open, catalog, waitFor }) {
  const stored = () =>
    page.evaluate(
      (params) =>
        window.__TAURI_INTERNALS__.invoke('host_request', { method: 'form-draft.get', params }),
      { projectId: project.id, formKey: 'roster-create' },
    );
  const dialog = page.getByRole('dialog', { name: 'Create project roster role', exact: true });
  const name = dialog.getByLabel('New role name', { exact: true });
  await catalog().getByRole('button', { name: 'Create project role', exact: true }).click();
  await name.fill('Parked role name');
  await waitFor(
    async () => (await stored()).value?.fields?.name === 'Parked role name',
    'Role creation draft acknowledged',
  );
  await page.reload();
  await open(project);
  await catalog().getByRole('button', { name: 'Create project role', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Restored the role' }).waitFor();
  assert.equal(await name.inputValue(), 'Parked role name');
  await name.fill('');
  await waitFor(async () => (await stored()).value === null, 'Emptied role form clears its copy');
  await dialog.getByRole('button', { name: 'Close role creation', exact: true }).click();
  console.log('PASS: native roster role-creation draft: reload restore and clear when emptied');
}
