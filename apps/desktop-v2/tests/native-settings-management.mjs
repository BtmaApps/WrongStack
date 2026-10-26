import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateModelCalendar } from '../../../packages/core/src/core/model-availability-calendar.ts';

export async function exerciseNativeSettingsManagement({
  page,
  rpc,
  waitFor,
  artifactDir,
  instructionsPath,
  configPath,
}) {
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
      'Profile management ' + type,
      45000,
    );
    if (reply.success === false || reply.ok === false || typeof reply.error === 'string')
      throw Error(reply.error ?? reply.message ?? 'Operation refused');
    if (type === 'user_instructions.get' && reply.exists)
      assert.equal(
        reply.mtimeMs,
        (await stat(instructionsPath)).mtimeMs,
        'Native transport preserves the exact instruction revision token',
      );
    return reply;
  };
  const count = (await rpc('snapshot')).sessions.length;
  const initial = await call('user_instructions.get');
  const initialPrefs = await call('prefs.get');
  const originalTools = (await call('tools.list')).tools;
  const readTool = originalTools.find((tool) => tool.name === 'read');
  assert.ok(readTool, 'Registered read tool exists');
  const nav = () => page.getByRole('navigation', { name: 'WrongStack settings sections' });
  const go = (name) => nav().getByRole('button', { name, exact: true }).click();
  const savePrefs = async () => {
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'saved to your active profile' }).waitFor();
  };
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'WrongStack settings', exact: true })
    .click();
  try {
    await go('Global instructions');
    const text = page.getByRole('textbox', { name: 'Global instruction text', exact: true });
    await waitFor(async () => await text.isEnabled(), 'Global instruction document loaded');
    const local =
      '# Native global instructions\n\nUse English documentation and respect project boundaries.\n';
    await text.fill(local);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page
      .getByRole('region', { name: 'Global instructions preview', exact: true })
      .getByRole('heading', { name: 'Native global instructions', exact: true })
      .waitFor();
    await page.screenshot({
      path: join(artifactDir, 'native-global-instructions.png'),
      fullPage: true,
    });
    await go('Cost tiers');
    await go('Global instructions');
    assert.equal(await text.inputValue(), local, 'Instruction draft survives settings navigation');
    await page.getByRole('button', { name: 'Save global instructions', exact: true }).click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Global instructions saved and verified' })
      .waitFor();
    assert.equal(
      await readFile(instructionsPath, 'utf8'),
      local,
      'Actual global instructions file was saved',
    );
    const loaded = await call('user_instructions.get');
    const remote = '# Native external change\n\nKeep this newer document.\n';
    await call('user_instructions.save', { text: remote, baseMtimeMs: loaded.mtimeMs });
    await text.fill('Local unsaved instruction draft.');
    await page.getByRole('button', { name: 'Save global instructions', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'changed since it was loaded' }).waitFor();
    assert.equal(await text.inputValue(), 'Local unsaved instruction draft.');
    assert.equal(
      await readFile(instructionsPath, 'utf8'),
      remote,
      'Stale instruction save did not overwrite newer file',
    );
    await page.getByRole('button', { name: 'Reload instructions', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(
      await text.inputValue(),
      'Local unsaved instruction draft.',
      'Reload cancellation keeps draft',
    );
    await page.getByRole('button', { name: 'Reload instructions', exact: true }).click();
    await page.getByRole('button', { name: 'Discard draft and reload', exact: true }).click();
    await waitFor(
      async () => (await text.inputValue()) === remote,
      'Explicit global instruction reload',
    );
    await text.fill('');
    await page.getByRole('button', { name: 'Save global instructions', exact: true }).click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Global instructions saved and verified' })
      .waitFor();
    assert.equal(
      (await call('user_instructions.get')).text,
      '',
      'Empty instructions save is explicit',
    );

    await go('Tool availability');
    await page.getByRole('textbox', { name: 'Search registered tools', exact: true }).fill('read');
    const card = page
      .locator('.tool-access-card')
      .filter({ has: page.locator('strong', { hasText: /^read$/ }) });
    await card.waitFor();
    await card.getByText('Tool details', { exact: true }).click();
    await card.locator('.tool-input-names code').filter({ hasText: 'path' }).waitFor();
    const firstAction = readTool.disabled ? 'Enable read' : 'Disable read';
    await card.getByRole('button', { name: firstAction, exact: true }).click();
    await page
      .getByRole('status')
      .filter({ hasText: 'verified in the profile tool catalog' })
      .waitFor();
    const expected = !readTool.disabled;
    assert.equal(
      (await call('tools.list')).tools.find((tool) => tool.name === 'read').disabled,
      expected,
    );
    await waitFor(async () => {
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      return (config.tools?.disabledTools ?? []).includes('read') === expected;
    }, 'Tool availability persisted to actual profile config');
    await page
      .getByRole('combobox', { name: 'Tool availability filter', exact: true })
      .selectOption(expected ? 'disabled' : 'enabled');
    assert.equal(await card.count(), 1, 'Tool state filter uses canonical catalog');
    await page.screenshot({
      path: join(artifactDir, 'native-tool-availability.png'),
      fullPage: true,
    });
    await card
      .getByRole('button', { name: expected ? 'Enable read' : 'Disable read', exact: true })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'verified in the profile tool catalog' })
      .waitFor();
    await assert.rejects(
      call('tool.disable', { name: 'native-tool-that-does-not-exist' }),
      /refused/,
    );

    await go('Model availability');
    await page.getByRole('button', { name: 'Add availability window', exact: true }).click();
    await page.getByLabel('Window 1 label', { exact: true }).fill('Native overnight schedule');
    await page.getByLabel('Window 1 provider', { exact: true }).fill('native-calendar-fixture');
    await page.getByLabel('Window 1 model', { exact: true }).fill('test-model');
    await page.getByLabel('Window 1 enabled', { exact: true }).check();
    await page.getByLabel('Window 1 every day', { exact: true }).uncheck();
    for (const day of ['Sunday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
      await page.getByLabel('Window 1 ' + day, { exact: true }).uncheck();
    assert.equal(
      await page.getByLabel('Window 1 Monday', { exact: true }).isDisabled(),
      true,
      'Last specific day cannot accidentally become every day',
    );
    await page.getByLabel('Window 1 start', { exact: true }).fill('22:00');
    await page.getByLabel('Window 1 end', { exact: true }).fill('07:00');
    await page.getByLabel('Window 1 timezone', { exact: true }).fill('not/a-zone');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'IANA timezone' }).waitFor();
    assert.deepEqual(
      (await call('prefs.get')).modelAvailabilitySchedule ?? [],
      initialPrefs.modelAvailabilitySchedule ?? [],
      'Invalid schedule was not persisted',
    );
    await page.getByLabel('Window 1 timezone', { exact: true }).fill('UTC');
    await savePrefs();
    let rules = (await call('prefs.get')).modelAvailabilitySchedule;
    assert.deepEqual(rules[0].days, [1]);
    for (const [iso, allowed] of [
      ['2026-10-26T23:00:00Z', false],
      ['2026-10-27T06:59:00Z', false],
      ['2026-10-27T07:00:00Z', true],
    ])
      assert.equal(
        evaluateModelCalendar(rules, 'native-calendar-fixture', 'test-model', new Date(iso))
          .allowed,
        allowed,
      );
    await page.screenshot({
      path: join(artifactDir, 'native-model-availability.png'),
      fullPage: true,
    });
    await page.getByLabel('Window 1 behavior', { exact: true }).selectOption('allow_only');
    await page.getByLabel('Window 1 model', { exact: true }).fill('');
    await savePrefs();
    rules = (await call('prefs.get')).modelAvailabilitySchedule;
    assert.equal(
      evaluateModelCalendar(
        rules,
        'native-calendar-fixture',
        'another-model',
        new Date('2026-10-26T23:00:00Z'),
      ).allowed,
      true,
    );
    assert.equal(
      evaluateModelCalendar(
        rules,
        'native-calendar-fixture',
        'another-model',
        new Date('2026-10-27T08:00:00Z'),
      ).allowed,
      false,
    );
    await page.setViewportSize({ width: 800, height: 640 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'Availability settings fit a compact desktop',
    );
    await page.screenshot({
      path: join(artifactDir, 'native-model-availability-compact.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.getByRole('button', { name: 'Remove Window 1', exact: true }).click();
    await savePrefs();
    assert.deepEqual((await call('prefs.get')).modelAvailabilitySchedule, []);
    assert.equal(
      (await rpc('snapshot')).sessions.length,
      count,
      'Profile management creates no desktop sessions',
    );
  } catch (error) {
    await page.screenshot({
      path: join(artifactDir, 'native-settings-management-failure.png'),
      fullPage: true,
    });
    throw error;
  } finally {
    const doc = await call('user_instructions.get');
    await call('user_instructions.save', {
      text: initial.text ?? '',
      baseMtimeMs: doc.mtimeMs ?? null,
    });
    await call(readTool.disabled ? 'tool.disable' : 'tool.enable', { name: 'read' });
    await call('prefs.update', {
      modelAvailabilitySchedule: initialPrefs.modelAvailabilitySchedule ?? [],
    });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Mission control', exact: true })
      .click();
  }
  console.log(
    'PASS: native global instructions/Markdown/draft/revision conflict/reload, real tool availability/config persistence, and overnight/provider-wide availability windows without sessions',
  );
}
