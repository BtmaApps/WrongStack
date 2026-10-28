import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeExecutionPolicy({
  page,
  rpc,
  waitFor,
  artifactDir,
  configPath,
  providerFixture,
}) {
  let offset = 0;
  const call = async (type, payload = {}) => {
    const requestId = crypto.randomUUID();
    await rpc('profile.send', { message: { type, payload: { ...payload, requestId } } });
    const result = await waitFor(
      async () => {
        const batch = await rpc('profile.events', { offset });
        offset = batch.offset;
        return batch.events.find((event) => event.payload?.requestId === requestId)?.payload;
      },
      `Execution policy ${type}`,
      45000,
    );
    if (result.error || result.success === false) throw Error(result.error ?? result.message);
    return result;
  };
  const screen = page.getByRole('region', { name: 'WrongStack settings', exact: true });
  const nav = page.getByRole('navigation', { name: 'WrongStack settings sections', exact: true });
  const open = async () => {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await nav.getByRole('button', { name: 'Execution & permissions', exact: true }).click();
    await screen.getByRole('heading', { name: 'Tool confirmation mode', exact: true }).waitFor();
  };
  const policy = screen.getByRole('region', { name: 'Tool confirmation policy', exact: true });
  const mode = policy.getByLabel('Tool confirmation mode', { exact: true });
  const confirm = (label) =>
    policy.getByRole('checkbox', { name: `Confirm: ${label}`, exact: true });
  const save = async () => {
    await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
    await screen
      .getByText('WrongStack settings saved to your active profile.', { exact: true })
      .waitFor();
  };
  const completions = providerFixture.calls.length;
  await open();
  assert.equal(await mode.inputValue(), 'standard');
  assert.equal(await confirm('Publish or deploy').isDisabled(), true);
  await mode.selectOption('yolo');
  assert.equal(await confirm('Delete in bulk').isChecked(), false);
  for (const label of ['Write WrongStack trusted state', 'Bind credentials to an endpoint']) {
    assert.equal(await confirm(label).isDisabled(), true);
    assert.equal(await confirm(label).isChecked(), true);
  }
  await confirm('Publish or deploy').uncheck();
  const before = await call('prefs.get');
  assert.equal(before.yolo, false, 'Confirmation draft does not apply before Save');
  await call('prefs.update', { yoloConfirm: { ...before.yoloConfirm, 'git-history': true } });
  await save();
  let saved = await call('prefs.get');
  assert.equal(saved.yolo, true);
  assert.equal(saved.yoloPlus, false);
  assert.equal(saved.yoloConfirm.publish, false);
  assert.equal(saved.yoloConfirm['bulk-delete'], false);
  assert.equal(
    saved.yoloConfirm['git-history'],
    true,
    'Independent category edit survives the full-map write',
  );
  assert.equal(saved.yoloConfirm['agent-state'], true);
  assert.equal(saved.yoloConfirm['credential-bind'], true);
  let disk = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(disk.autonomy.yolo, true);
  assert.equal(disk.autonomy.yoloPlus, false);
  assert.deepEqual(disk.autonomy.yoloConfirm, saved.yoloConfirm);
  await mode.selectOption('yolo-plus');
  await policy.getByRole('status').filter({ hasText: 'bypasses these per-kind prompts' }).waitFor();
  assert.equal(await confirm('Publish or deploy').isDisabled(), true);
  await save();
  saved = await call('prefs.get');
  assert.equal(saved.yolo, true);
  assert.equal(saved.yoloPlus, true);
  assert.equal(
    saved.yoloConfirm.publish,
    false,
    'YOLO+ retains the saved normal-YOLO category map',
  );
  await page.reload();
  await open();
  assert.equal(await mode.inputValue(), 'yolo-plus');
  await mode.selectOption('standard');
  await save();
  saved = await call('prefs.get');
  assert.equal(saved.yolo, false);
  assert.equal(saved.yoloPlus, false);
  await mode.selectOption('yolo-plus');
  await call('prefs.update', { yolo: true, yoloPlus: false });
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  await screen.getByRole('alert').filter({ hasText: 'mode changed elsewhere' }).waitFor();
  saved = await call('prefs.get');
  assert.equal(saved.yolo, true);
  assert.equal(saved.yoloPlus, false);
  await screen
    .getByRole('button', { name: 'Reload saved values (discard drafts)', exact: true })
    .click();
  await waitFor(async () => (await mode.inputValue()) === 'yolo', 'Mode-pair conflict reload');
  await confirm('Publish or deploy').check();
  await nav.getByRole('button', { name: 'Context & reasoning', exact: true }).click();
  await nav.getByRole('button', { name: 'Execution & permissions', exact: true }).click();
  assert.equal(await confirm('Publish or deploy').isChecked(), true);
  await screen.getByRole('button', { name: 'Discard changes', exact: true }).click();
  assert.equal(await confirm('Publish or deploy').isChecked(), false);
  await policy
    .getByRole('heading', { name: 'Tool confirmation mode', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifactDir, 'native-execution-policy.png'), fullPage: true });
  await page.setViewportSize({ width: 800, height: 640 });
  await mode.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({
    path: join(artifactDir, 'native-execution-policy-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  const dark = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  if (await dark.count()) await dark.click();
  await page.screenshot({
    path: join(artifactDir, 'native-execution-policy-dark.png'),
    fullPage: true,
  });
  disk = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(disk.autonomy.yoloPlus, false);
  const snapshot = await rpc('snapshot');
  assert.equal(snapshot.projects.length, 0);
  assert.equal(snapshot.sessions.length, 0);
  assert.equal(providerFixture.calls.length, completions);
  console.log(
    'PASS: standard/YOLO/YOLO+ paired mode saves, nine category map, protected controls, independent category preservation, stale mode-pair refusal, draft/discard, actual disk/reload, themes and zero execution',
  );
}
