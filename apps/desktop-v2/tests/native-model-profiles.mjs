import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeModelProfiles({
  getPage,
  rpc,
  waitFor,
  restart,
  artifactDir,
  wrongstackHome,
}) {
  const providerId = 'shared-profile-provider',
    modelId = 'shared/model';
  let offset = 0;
  const call = async (type, payload = {}) => {
    const requestId = crypto.randomUUID();
    await rpc('profile.send', { message: { type, payload: { ...payload, requestId } } });
    const reply = await waitFor(
      async () => {
        const batch = await rpc('profile.events', { offset });
        offset = batch.offset;
        return batch.events.find((event) => event.payload?.requestId === requestId)?.payload;
      },
      `Profile draft ${type}`,
      45000,
    );
    if (reply.success === false || reply.ok === false || typeof reply.error === 'string')
      throw Error(reply.error ?? reply.message);
    return reply;
  };
  const ipc = (method, params) =>
    getPage().evaluate(
      ({ method, params }) => window.__TAURI_INTERNALS__.invoke('host_request', { method, params }),
      { method, params },
    );
  const key = (profileId) =>
    'model-editor:' +
    createHash('sha256')
      .update(profileId ? JSON.stringify(['model-editor', profileId, providerId]) : providerId)
      .digest('hex');
  const draft = (profileId) => ipc('profile-draft.get', { formKey: key(profileId) });
  const put = (profileId, value, expectedRevision) =>
    ipc('profile-draft.save', { formKey: key(profileId), value, expectedRevision });
  const profile = async () => (await call('prefs.get')).profileIdentity;
  const config = async (name) =>
    JSON.parse(await readFile(join(wrongstackHome, 'profiles', name, 'config.json'), 'utf8'));
  const open = async () => {
    const page = getPage();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await waitFor(
      async () => (await rpc('profile.status')).status === 'running',
      'Selected profile engine ready',
      100000,
    );
    await page
      .getByRole('navigation', { name: 'WrongStack settings sections' })
      .getByRole('button', { name: 'Model catalog', exact: true })
      .click();
    const catalog = page.getByRole('region', { name: 'Model catalog settings', exact: true });
    await catalog.getByLabel('Catalog provider', { exact: true }).selectOption(providerId);
    return catalog;
  };
  const switchTo = async (name) => {
    const bootstrapPath = join(wrongstackHome, 'config.json');
    await restart(true, async () => {
      const bootstrap = JSON.parse(await readFile(bootstrapPath, 'utf8'));
      await writeFile(bootstrapPath, JSON.stringify({ ...bootstrap, activeProfile: name }));
    });
    offset = 0;
    const catalog = await open();
    return { catalog, profile: await profile() };
  };
  const before = await rpc('snapshot');
  await call('provider.add', {
    id: providerId,
    type: 'openai-compatible',
    family: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:9/v1',
    models: [modelId],
    customModels: {
      [modelId]: {
        name: 'Shared base model',
        modelsDev: { name: 'Shared base model', cost: { input: 1 } },
      },
    },
  });
  let catalog = await open();
  const first = await profile();
  assert.equal(first.name, 'default');
  assert.match(first.id, /^[a-f0-9]{64}$/);
  await catalog
    .locator('.model-catalog-list')
    .getByRole('button', { name: /Shared base model/ })
    .click();
  await catalog.getByRole('button', { name: 'Edit model definition', exact: true }).click();
  let editor = getPage().getByRole('dialog');
  await editor.getByLabel('Model display name', { exact: true }).fill('Profile A pending model');
  await waitFor(
    async () => (await draft(first.id)).value?.editor.draft.text.name === 'Profile A pending model',
    'Profile A draft acknowledged',
  );
  const firstDraft = await draft(first.id);
  assert.equal(firstDraft.value.profileId, first.id);
  const legacy = structuredClone(firstDraft.value);
  delete legacy.profileId;
  legacy.editor.draft.text.name = 'Earlier unassigned model';
  await put(undefined, legacy, (await draft()).revision);
  const secondDir = join(wrongstackHome, 'profiles', 'second');
  await mkdir(secondDir, { recursive: true });
  await writeFile(join(secondDir, 'config.json'), JSON.stringify(await config('default')));
  const next = await switchTo('second');
  catalog = next.catalog;
  const second = next.profile;
  assert.equal(second.name, 'second');
  assert.notEqual(second.id, first.id);
  assert.equal(
    await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).count(),
    0,
    'The same provider in another real profile cannot restore profile A’s draft',
  );
  assert.equal((await draft(second.id)).value, null);
  assert.deepEqual(await draft(first.id), firstDraft);
  await catalog.getByRole('button', { name: 'Review unassigned model draft', exact: true }).click();
  const legacyNotice = catalog.getByRole('region', { name: 'Unassigned model draft', exact: true });
  await getPage().screenshot({
    path: join(artifactDir, 'native-model-profile-legacy-review.png'),
    fullPage: true,
  });
  await legacyNotice
    .getByRole('button', { name: 'Copy and review in this profile', exact: true })
    .click();
  editor = getPage().getByRole('dialog');
  await editor.getByLabel('Model display name', { exact: true }).waitFor();
  assert.equal(
    await editor.getByLabel('Model display name', { exact: true }).inputValue(),
    'Earlier unassigned model',
  );
  assert.equal((await draft(second.id)).value.profileId, second.id);
  assert.deepEqual(
    (await draft()).value,
    legacy,
    'Reviewed migration copies without deleting or rewriting the unassigned source',
  );
  assert.equal(
    (await config('second')).providers[providerId].customModels[modelId].modelsDev.name,
    'Shared base model',
    'Copy does not apply provider settings',
  );
  await editor.getByLabel('Model display name', { exact: true }).fill('Profile B applied model');
  await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
  await catalog.getByText('Model definition saved and verified.', { exact: true }).waitFor();
  assert.equal(
    (await config('second')).providers[providerId].customModels[modelId].modelsDev.name,
    'Profile B applied model',
  );
  assert.equal(
    (await config('default')).providers[providerId].customModels[modelId].modelsDev.name,
    'Shared base model',
  );
  assert.deepEqual(await draft(first.id), firstDraft);
  const back = await switchTo('default');
  catalog = back.catalog;
  assert.equal(back.profile.id, first.id);
  await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).click();
  editor = getPage().getByRole('dialog');
  assert.equal(
    await editor.getByLabel('Model display name', { exact: true }).inputValue(),
    'Profile A pending model',
  );
  await getPage().screenshot({
    path: join(artifactDir, 'native-model-profile-owned-recovery.png'),
    fullPage: true,
  });
  await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
  await catalog.getByText('Model definition saved and verified.', { exact: true }).waitFor();
  assert.equal(
    (await config('default')).providers[providerId].customModels[modelId].modelsDev.name,
    'Profile A pending model',
  );
  assert.equal(
    (await config('second')).providers[providerId].customModels[modelId].modelsDev.name,
    'Profile B applied model',
  );
  await catalog.getByRole('button', { name: 'Review unassigned model draft', exact: true }).click();
  const source = await draft(),
    newer = structuredClone(source.value);
  newer.editor.draft.text.name = 'Newer unassigned draft';
  await put(undefined, newer, source.revision);
  await catalog
    .getByRole('button', { name: 'Discard unassigned model draft', exact: true })
    .click();
  await catalog
    .getByRole('alert')
    .filter({ hasText: 'The unassigned draft changed. Review its latest version before choosing.' })
    .waitFor();
  assert.deepEqual((await draft()).value, newer);
  await catalog
    .getByRole('button', { name: 'Discard unassigned model draft', exact: true })
    .click();
  await waitFor(
    async () => (await draft()).value === null,
    'Reviewed legacy removal is acknowledged',
  );
  assert.equal((await draft(first.id)).value, null);
  assert.equal((await draft(second.id)).value, null);
  const after = await rpc('snapshot');
  assert.deepEqual(
    after.sessions.map((row) => row.id),
    before.sessions.map((row) => row.id),
  );
  await writeFile(
    join(artifactDir, 'native-model-profile-proof.json'),
    JSON.stringify(
      {
        first,
        second,
        sameProvider: providerId,
        namespaceIsolation: true,
        profileFileIsolation: true,
        explicitLegacyCopy: true,
        staleLegacyDeleteRefused: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: actual bootstrap-selected profile isolation through cold restarts, same-provider native drafts, separate model config writes, explicit legacy copy and revision-protected legacy removal',
  );
  return { first, second };
}
