import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeFleetPolicy({ page, rpc, waitFor, artifactDir, configPath }) {
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
      `Fleet profile ${type}`,
      45000,
    );
    if (reply.success === false || reply.ok === false || reply.error)
      throw Error(reply.error ?? reply.message);
    return reply;
  };
  const screen = page.getByRole('region', { name: 'WrongStack settings', exact: true });
  const sections = page.getByRole('navigation', {
    name: 'WrongStack settings sections',
    exact: true,
  });
  const open = async () => {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await sections.getByRole('button', { name: 'Fleet & companions', exact: true }).click();
    await screen.getByRole('heading', { name: 'Fleet capacity', exact: true }).waitFor();
  };
  const before = await call('prefs.get');
  const diskBefore = JSON.parse(await readFile(configPath, 'utf8'));
  const switches = [
    ['memoryCompanionEnabled', 'Memory Companion'],
    ['exploreCompanionEnabled', 'Explore Companion'],
    ['skillCompanionEnabled', 'Skill Companion'],
    ['nextPrediction', 'Next-step prediction'],
    ['nextStepsTool', 'Next-steps tool'],
  ];
  const edited = {
    maxConcurrent: 64,
    fleetChatVerbosity: before.fleetChatVerbosity === 'full' ? 'off' : 'full',
  };
  await open();
  await screen.getByLabel('Concurrent agents', { exact: true }).fill('64');
  await screen
    .getByLabel('Fleet chat detail', { exact: true })
    .selectOption(edited.fleetChatVerbosity);
  for (const [key, label] of switches) {
    assert.equal(typeof before[key], 'boolean', `Canonical ${key} is available`);
    edited[key] = !before[key];
    await screen.getByRole('checkbox', { name: label, exact: true }).setChecked(edited[key]);
  }
  assert.equal(
    (await call('prefs.get')).maxConcurrent,
    before.maxConcurrent,
    'Draft edits do not write the profile',
  );
  await sections.getByRole('button', { name: 'Context & reasoning', exact: true }).click();
  await sections.getByRole('button', { name: 'Fleet & companions', exact: true }).click();
  assert.equal(await screen.getByLabel('Concurrent agents', { exact: true }).inputValue(), '64');
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  await screen
    .getByText('WrongStack settings saved to your active profile.', { exact: true })
    .waitFor();
  const saved = await call('prefs.get');
  for (const [key, value] of Object.entries(edited)) assert.equal(saved[key], value, key);
  const disk = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(disk.maxConcurrent, 64);
  assert.equal(disk.autonomy.fleetChatVerbosity, edited.fleetChatVerbosity);
  assert.equal(disk.nextPrediction, edited.nextPrediction);
  assert.equal(disk.tools.nextsteps.enabled, edited.nextStepsTool);
  assert.deepEqual(disk.fleet.lifecycle, diskBefore.fleet.lifecycle);
  for (const [key, child] of [
    ['memoryCompanionEnabled', 'memoryCompanion'],
    ['exploreCompanionEnabled', 'exploreCompanion'],
    ['skillCompanionEnabled', 'skillCompanion'],
  ]) {
    assert.deepEqual(
      disk.fleet[child],
      { ...diskBefore.fleet?.[child], enabled: edited[key] },
      'Companion budgets and unknown fields survive toggle saves',
    );
  }
  await screen.getByLabel('Concurrent agents', { exact: true }).fill('1.5');
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  assert.equal(
    (await call('prefs.get')).maxConcurrent,
    64,
    'Fractional concurrency never persists',
  );
  await screen.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await screen.getByLabel('Concurrent agents', { exact: true }).fill('128');
  await call('prefs.update', { maxConcurrent: 96 });
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  await screen.getByRole('alert').filter({ hasText: 'changed elsewhere' }).waitFor();
  assert.equal((await call('prefs.get')).maxConcurrent, 96);
  await screen
    .getByRole('button', { name: 'Reload saved values (discard drafts)', exact: true })
    .click();
  await screen.getByLabel('Concurrent agents', { exact: true }).waitFor();
  assert.equal(await screen.getByLabel('Concurrent agents', { exact: true }).inputValue(), '96');
  await page.screenshot({ path: join(artifactDir, 'native-fleet-policy.png'), fullPage: true });
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({
    path: join(artifactDir, 'native-fleet-policy-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  const dark = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  if (await dark.count()) await dark.click();
  await page.screenshot({
    path: join(artifactDir, 'native-fleet-policy-dark.png'),
    fullPage: true,
  });
  await page.reload();
  await open();
  assert.equal(await screen.getByLabel('Concurrent agents', { exact: true }).inputValue(), '96');
  for (const [key, label] of switches)
    assert.equal(
      await screen.getByRole('checkbox', { name: label, exact: true }).isChecked(),
      edited[key],
    );
  const snapshot = await rpc('snapshot');
  assert.equal(snapshot.projects.length, 0);
  assert.equal(snapshot.sessions.length, 0);
  console.log(
    'PASS: all seven Fleet policy fields, uncapped concurrency, draft retention/discard, same-field conflict refusal, persisted companion config, reload, themes and zero project/session profile workflow',
  );
}
