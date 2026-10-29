import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeModelPriceTiers({
  page,
  catalog,
  call,
  saved,
  providerId,
  modelId,
  artifactDir,
  configPath,
}) {
  const remote = structuredClone((await saved()).customModels[modelId]);
  const first = {
    tier: { type: 'context', size: 200000, future: 'keep' },
    input: 2,
    output: 4,
    cache_read: 0,
    future: 42,
  };
  const legacy = { input: 2, output: 4, cache_read: 0, future: 'preserved' };
  remote.modelsDev.cost = { ...remote.modelsDev.cost, tiers: [first], context_over_200k: legacy };
  await call('provider.custom_models.set', { providerId, modelId, customModel: remote });
  await catalog.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await catalog
    .getByRole('region', { name: 'Saved model price tiers', exact: true })
    .getByText('Legacy over-200k schedule', { exact: true })
    .waitFor();
  const edit = async () => {
    await catalog.getByRole('button', { name: 'Edit model definition', exact: true }).click();
    return page.getByRole('dialog');
  };
  const save = async (editor) => {
    await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
    await catalog.getByText('Model definition saved and verified.', { exact: true }).waitFor();
  };
  let editor = await edit();
  assert.equal(
    await editor.getByLabel('Over 200k context USD / million tokens', { exact: true }).isDisabled(),
    true,
  );
  await editor
    .getByLabel('Model description', { exact: true })
    .fill('Preserve the actual catalog price shape');
  await save(editor);
  assert.deepEqual((await saved()).customModels[modelId].modelsDev.cost.context_over_200k, legacy);
  assert.deepEqual((await saved()).customModels[modelId].modelsDev.cost.tiers, [first]);
  editor = await edit();
  const pricing = editor.getByRole('region', { name: 'Model context price tiers', exact: true });
  await pricing.getByRole('button', { name: 'Add context price tier', exact: true }).click();
  await pricing.getByLabel('Price tier 2 context threshold', { exact: true }).fill('400000');
  await pricing.getByLabel('Price tier 2 input price', { exact: true }).fill('0');
  await pricing.getByLabel('Price tier 2 output price', { exact: true }).fill('6');
  await pricing.getByRole('button', { name: 'Add context price tier', exact: true }).click();
  await pricing.getByRole('button', { name: 'Remove price tier 3', exact: true }).click();
  await pricing.getByRole('button', { name: 'Move price tier 2 up', exact: true }).click();
  await pricing.getByLabel('Price tier 2 context threshold', { exact: true }).fill('400000');
  await editor.getByRole('button', { name: 'Save model definition', exact: true }).click();
  await editor.getByRole('alert').filter({ hasText: 'thresholds must be unique' }).waitFor();
  assert.deepEqual((await saved()).customModels[modelId].modelsDev.cost.tiers, [first]);
  await pricing.getByLabel('Price tier 2 context threshold', { exact: true }).fill('200000');
  const light = page.getByRole('button', { name: 'Switch to light mode', exact: true });
  if (await light.count()) await light.click();
  await pricing
    .getByRole('heading', { name: 'Context price tiers', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifactDir, 'native-model-price-tiers.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 640 });
  await pricing
    .getByLabel('Price tier 1 context threshold', { exact: true })
    .scrollIntoViewIfNeeded();
  assert.equal(await pricing.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({
    path: join(artifactDir, 'native-model-price-tiers-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  await save(editor);
  const expected = [{ tier: { type: 'context', size: 400000 }, input: 0, output: 6 }, first];
  assert.deepEqual((await saved()).customModels[modelId].modelsDev.cost.tiers, expected);
  assert.deepEqual(
    JSON.parse(await readFile(configPath, 'utf8')).providers[providerId].customModels[modelId]
      .modelsDev.cost.tiers,
    expected,
  );
  editor = await edit();
  assert.equal(
    await editor.getByLabel('Price tier 1 input price', { exact: true }).inputValue(),
    '0',
  );
  assert.equal(
    await editor.getByLabel('Price tier 1 cache read price', { exact: true }).inputValue(),
    '',
  );
  await editor.getByRole('button', { name: 'Remove all saved price tiers', exact: true }).click();
  await save(editor);
  const cost = (await saved()).customModels[modelId].modelsDev.cost;
  assert.equal(Object.hasOwn(cost, 'tiers'), false);
  assert.deepEqual(cost.context_over_200k, legacy);
  assert.equal(cost.input, remote.modelsDev.cost.input);
  console.log(
    'PASS: native canonical context price tiers, explicit zero/omitted rates, ordering, duplicate refusal, actual disk/readback, nested legacy preservation and reviewed tier removal',
  );
}
