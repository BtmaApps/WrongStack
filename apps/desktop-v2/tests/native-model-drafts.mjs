import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function exerciseNativeModelDrafts({
  page,
  catalog,
  call,
  saved,
  providerId,
  modelId,
  artifactDir,
  waitFor,
}) {
  const profile = (await call('prefs.get')).profileIdentity;
  assert.match(profile.id, /^[a-f0-9]{64}$/);
  const formKey =
    'model-editor:' +
    createHash('sha256')
      .update(JSON.stringify(['model-editor', profile.id, providerId]))
      .digest('hex');
  const ipc = (method, params) =>
    page.evaluate(
      ({ method, params }) => window.__TAURI_INTERNALS__.invoke('host_request', { method, params }),
      { method, params },
    );
  const read = () => ipc('profile-draft.get', { formKey });
  const put = (value, expectedRevision) =>
    ipc('profile-draft.save', { formKey, value, expectedRevision });
  const open = async () => {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await page
      .getByRole('navigation', { name: 'WrongStack settings sections' })
      .getByRole('button', { name: 'Model catalog', exact: true })
      .click();
    await catalog.getByLabel('Catalog provider', { exact: true }).selectOption(providerId);
  };
  const configName = (await saved()).customModels[modelId].modelsDev.name;
  await catalog.getByRole('button', { name: 'Edit model definition', exact: true }).click();
  let editor = page.getByRole('dialog');
  await editor.getByLabel('Model display name', { exact: true }).fill('Recover native model draft');
  await editor.getByRole('button', { name: 'Add context price tier', exact: true }).click();
  await editor.getByLabel('Price tier 1 context threshold', { exact: true }).fill('250000');
  await editor.getByLabel('Price tier 1 input price', { exact: true }).fill('-1');
  await waitFor(
    async () => (await read()).value?.editor.draft.pricing.rows[0]?.prices.input === '-1',
    'Invalid-in-progress model pricing is durably drafted',
  );
  assert.equal(
    (await saved()).customModels[modelId].modelsDev.name,
    configName,
    'Draft storage does not apply provider settings',
  );
  await page.reload();
  await open();
  await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('dialog').count(),
    0,
    'Recovery is reviewed, never an automatic open/apply',
  );
  await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).click();
  editor = page.getByRole('dialog');
  assert.equal(
    await editor.getByLabel('Model display name', { exact: true }).inputValue(),
    'Recover native model draft',
  );
  assert.equal(
    await editor.getByLabel('Price tier 1 input price', { exact: true }).inputValue(),
    '-1',
  );
  await editor.getByLabel('Price tier 1 input price', { exact: true }).fill('2.5');
  await waitFor(
    async () => (await read()).value?.editor.draft.pricing.rows[0]?.prices.input === '2.5',
    'Recovered price edit is acknowledged',
  );
  const beforePeer = await read(),
    peer = structuredClone(beforePeer.value);
  peer.editor.draft.text.name = 'Other window model draft';
  const peerAck = await put(peer, beforePeer.revision);
  await editor
    .getByLabel('Model display name', { exact: true })
    .fill('Keep this window model draft');
  await editor.getByRole('button', { name: 'Use saved model draft', exact: true }).waitFor();
  assert.equal(
    await editor.getByRole('button', { name: 'Save model definition', exact: true }).isDisabled(),
    true,
  );
  assert.equal((await read()).value.editor.draft.text.name, 'Other window model draft');
  const newer = structuredClone(peer);
  newer.editor.draft.text.name = 'Newest saved model draft';
  await put(newer, peerAck.revision);
  await editor.getByRole('button', { name: 'Keep this model draft', exact: true }).click();
  await editor
    .getByText('The saved model draft changed again. Review the latest version.', { exact: true })
    .waitFor();
  assert.equal((await read()).value.editor.draft.text.name, 'Newest saved model draft');
  await editor
    .getByRole('region', { name: 'Model draft recovery', exact: true })
    .getByText('This window', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifactDir, 'native-model-draft-comparison.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({
    path: join(artifactDir, 'native-model-draft-comparison-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  await editor.getByRole('button', { name: 'Use saved model draft', exact: true }).click();
  await waitFor(
    async () =>
      (await editor.getByLabel('Model display name', { exact: true }).inputValue()) ===
      'Newest saved model draft',
    'Reviewed saved draft resolves through native storage before replacing the editor',
  );
  assert.equal(
    await editor.getByLabel('Model display name', { exact: true }).inputValue(),
    'Newest saved model draft',
  );
  await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
  await catalog.getByText('Model definition saved and verified.', { exact: true }).waitFor();
  assert.equal(
    (await read()).value,
    null,
    'Only confirmed model save clears the matching native draft',
  );
  assert.equal((await saved()).customModels[modelId].modelsDev.name, 'Newest saved model draft');
  await catalog.getByRole('button', { name: 'Edit model definition', exact: true }).click();
  editor = page.getByRole('dialog');
  await editor
    .getByLabel('Model display name', { exact: true })
    .fill('Discard this recovered draft');
  await waitFor(
    async () => (await read()).value?.editor.draft.text.name === 'Discard this recovered draft',
    'Second draft saved',
  );
  await page.reload();
  await open();
  await catalog.getByRole('button', { name: 'Discard saved model draft', exact: true }).click();
  await waitFor(
    async () => (await read()).value === null,
    'Explicit recovered draft discard is acknowledged',
  );
  assert.equal((await saved()).customModels[modelId].modelsDev.name, 'Newest saved model draft');
  await catalog
    .locator('.model-catalog-list')
    .getByRole('button', { name: /Newest saved model draft/ })
    .click();
  const other =
    'model-editor:' +
    createHash('sha256')
      .update(JSON.stringify(['model-editor', profile.id, 'other-provider']))
      .digest('hex');
  assert.equal((await ipc('profile-draft.get', { formKey: other })).value, null);
  console.log(
    'PASS: profile-owned native model drafts, invalid form recovery, explicit resume/discard, newer-window comparison/CAS refusal, reviewed saved choice, acknowledged cleanup and provider isolation',
  );
}
