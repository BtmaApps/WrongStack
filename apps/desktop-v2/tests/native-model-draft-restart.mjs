import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeModelDraftRestart({
  getPage,
  rpc,
  waitFor,
  restart,
  artifactDir,
  configPath,
}) {
  const providerId = 'native-draft-restart',
    modelId = 'native/existing',
    newId = 'native/unfinished';
  let offset = 0;
  const call = async (type, payload = {}) => {
    const requestId = crypto.randomUUID();
    await rpc('profile.send', { message: { type, payload: { ...payload, requestId } } });
    const reply = await waitFor(
      async () => {
        const events = await rpc('profile.events', { offset });
        offset = events.offset;
        return events.events.find((event) => event.payload?.requestId === requestId)?.payload;
      },
      `Restart model fixture ${type}`,
      45000,
    );
    if (reply.success === false || reply.ok === false || typeof reply.error === 'string')
      throw Error(reply.error ?? reply.message);
    return reply;
  };
  const profile = (await call('prefs.get')).profileIdentity;
  assert.match(profile.id, /^[a-f0-9]{64}$/);
  const formKey =
    'model-editor:' +
    createHash('sha256')
      .update(JSON.stringify(['model-editor', profile.id, providerId]))
      .digest('hex');
  const draft = () =>
    getPage().evaluate(
      ({ formKey }) =>
        window.__TAURI_INTERNALS__.invoke('host_request', {
          method: 'profile-draft.get',
          params: { formKey },
        }),
      { formKey },
    );
  const saved = async () =>
    (await call('providers.saved')).providers.find((provider) => provider.id === providerId);
  const open = async () => {
    const page = getPage();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await waitFor(
      async () => (await rpc('profile.status')).status === 'running',
      'Restarted profile engine ready',
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
  const restartAndOpen = async (cold) => {
    const proof = await restart(cold);
    if (cold) offset = 0;
    const catalog = await open();
    return { proof, catalog };
  };
  const identities = [];
  let cleanupError;
  const before = await rpc('snapshot');
  await call('provider.add', {
    id: providerId,
    type: 'openai-compatible',
    family: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:9/v1',
    models: [modelId],
    customModels: {
      [modelId]: {
        name: 'Existing restart model',
        modelsDev: { name: 'Existing restart model', cost: { input: 1 } },
      },
    },
  });
  try {
    let catalog = await open();
    await catalog.getByRole('button', { name: 'Add model definition', exact: true }).click();
    let editor = getPage().getByRole('dialog');
    await editor.getByLabel('Model definition ID', { exact: true }).fill(newId);
    await editor
      .getByLabel('Model display name', { exact: true })
      .fill('Acknowledged restart draft');
    await editor.getByRole('button', { name: 'Add context price tier', exact: true }).click();
    await editor.getByLabel('Price tier 1 context threshold', { exact: true }).fill('250000');
    await editor.getByLabel('Price tier 1 input price', { exact: true }).fill('-1');
    await waitFor(
      async () => (await draft()).value?.editor.draft.pricing.rows[0]?.prices.input === '-1',
      'Draft is acknowledged before process termination',
    );
    const acknowledged = await draft();
    const warm = await restartAndOpen(false);
    identities.push(warm.proof);
    catalog = warm.catalog;
    await catalog
      .getByRole('button', { name: 'Continue saved model draft', exact: true })
      .waitFor();
    assert.equal(
      await getPage().getByRole('dialog').count(),
      0,
      'Restart does not automatically open or apply a recovered draft',
    );
    assert.deepEqual(
      await draft(),
      acknowledged,
      'UI process restart restores the exact acknowledged SQLite snapshot',
    );
    assert.equal((await saved()).customModels?.[newId], undefined);
    const cold = await restartAndOpen(true);
    identities.push(cold.proof);
    catalog = cold.catalog;
    await catalog
      .getByRole('button', { name: 'Continue saved model draft', exact: true })
      .waitFor();
    assert.deepEqual(
      await draft(),
      acknowledged,
      'Fresh UI, host, engine and WebView data recover the exact native draft',
    );
    const disk = JSON.parse(await readFile(configPath, 'utf8'));
    assert.equal(
      disk.providers[providerId].customModels?.[newId],
      undefined,
      'Recovery never writes an unfinished model to provider configuration',
    );
    await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).click();
    editor = getPage().getByRole('dialog');
    assert.equal(
      await editor.getByLabel('Model definition ID', { exact: true }).inputValue(),
      newId,
    );
    assert.equal(
      await editor.getByLabel('Price tier 1 input price', { exact: true }).inputValue(),
      '-1',
    );
    await getPage().screenshot({
      path: join(artifactDir, 'native-model-draft-cold-recovered.png'),
      fullPage: true,
    });
    await editor.getByRole('button', { name: 'Cancel model editing', exact: true }).click();
    await editor.getByRole('button', { name: 'Discard model draft', exact: true }).click();
    await waitFor(
      async () => (await draft()).value === null,
      'Recovered unfinished draft clears only after explicit acknowledgement',
    );
    await catalog
      .locator('.model-catalog-list')
      .getByRole('button', { name: /Existing restart model/ })
      .click();
    await catalog.getByRole('button', { name: 'Edit model definition', exact: true }).click();
    editor = getPage().getByRole('dialog');
    await editor.getByLabel('Model display name', { exact: true }).fill('Stale recovered edit');
    await waitFor(
      async () => (await draft()).value?.editor.draft.text.name === 'Stale recovered edit',
      'Existing-model draft acknowledged',
    );
    const baseline = await draft();
    const remote = structuredClone((await saved()).customModels[modelId]);
    remote.name = 'Newer persisted model';
    remote.modelsDev.name = remote.name;
    await call('provider.custom_models.set', { providerId, modelId, customModel: remote });
    const secondCold = await restartAndOpen(true);
    identities.push(secondCold.proof);
    catalog = secondCold.catalog;
    await catalog.getByRole('button', { name: 'Continue saved model draft', exact: true }).click();
    editor = getPage().getByRole('dialog');
    assert.deepEqual(
      (await draft()).value.editor.initial,
      baseline.value.editor.initial,
      'Original definition baseline survives cold restart',
    );
    await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
    await editor.getByRole('alert').filter({ hasText: 'changed since it was opened' }).waitFor();
    assert.equal((await saved()).customModels[modelId].modelsDev.name, remote.name);
    assert.equal(
      await editor.getByLabel('Model display name', { exact: true }).inputValue(),
      'Stale recovered edit',
    );
    await getPage().screenshot({
      path: join(artifactDir, 'native-model-draft-cold-stale-refusal.png'),
      fullPage: true,
    });
    await editor.getByRole('button', { name: 'Cancel model editing', exact: true }).click();
    await editor.getByRole('button', { name: 'Discard model draft', exact: true }).click();
    await waitFor(
      async () => (await draft()).value === null,
      'Stale recovered editor explicitly discarded',
    );
    const cleared = await draft();
    const last = await restartAndOpen(false);
    identities.push(last.proof);
    catalog = last.catalog;
    await catalog
      .getByRole('button', { name: 'Add model definition', exact: true })
      .waitFor({ state: 'visible' });
    await waitFor(
      async () =>
        await catalog
          .getByRole('button', { name: 'Add model definition', exact: true })
          .isEnabled(),
      'Cleared draft does not block a new editor after restart',
    );
    assert.equal(
      await catalog
        .getByRole('button', { name: 'Continue saved model draft', exact: true })
        .count(),
      0,
    );
    assert.deepEqual(
      await draft(),
      cleared,
      'Acknowledged discard remains cleared across process restart',
    );
    const after = await rpc('snapshot');
    assert.deepEqual(
      after.projects.map((row) => row.id).sort(),
      before.projects.map((row) => row.id).sort(),
    );
    assert.deepEqual(
      after.sessions.map((row) => row.id).sort(),
      before.sessions.map((row) => row.id).sort(),
    );
    await writeFile(
      join(artifactDir, 'native-model-draft-restarts.json'),
      JSON.stringify(
        {
          identities,
          acknowledgedRevision: acknowledged.revision,
          clearedRevision: cleared.revision,
          originalBaselinePreserved: true,
          staleModelRefused: true,
          unfinishedModelNotApplied: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: model drafts survive two UI process restarts and two complete host/engine restarts with fresh WebViews, exact acknowledged snapshot/baseline recovery, no implicit model write, stale-model refusal and durable discard',
    );
  } finally {
    try {
      if (!getPage().isClosed() && (await saved())) await call('provider.remove', { providerId });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (cleanupError) throw cleanupError;
  return identities;
}
