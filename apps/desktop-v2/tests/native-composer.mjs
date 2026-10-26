import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixtureModel } from './local-provider.mjs';

/** Actual Tauri composer -> native IPC -> production engine -> isolated provider. */
export async function exerciseNativeComposer({
  page,
  identity,
  agent,
  rpc,
  artifactDir,
  waitFor,
  providerFixture,
}) {
  let offset = 0;
  const call = async (type, payload = {}, replies = []) => {
    const requestId = crypto.randomUUID();
    await rpc('engine.send', {
      id: agent.id,
      message: { type, payload: { ...payload, requestId } },
    });
    return await waitFor(
      async () => {
        const batch = await rpc('engine.events', { id: agent.id, offset });
        offset = batch.offset;
        const event = batch.events.find(
          (e) =>
            e.payload?.requestId === requestId && (replies.includes(e.type) || e.type === 'error'),
        );
        if (
          event?.type === 'error' ||
          event?.payload?.success === false ||
          typeof event?.payload?.error === 'string'
        )
          throw Error(event.payload.error ?? event.payload.message);
        return event?.payload;
      },
      'Composer ' + type,
      45000,
    );
  };
  const composer = () => page.getByRole('textbox', { name: 'Message WrongStack', exact: true });
  const idle = () =>
    waitFor(
      async () => !(await page.getByRole('button', { name: 'Stop run', exact: true }).count()),
      'Composer run completion',
      60000,
    );
  const send = async (text, mode = 'btw') => {
    await page.getByRole('combobox', { name: 'Message delivery mode' }).selectOption(mode);
    await composer().fill(text);
    await page.locator('.composer-send').click();
  };
  const options = async () => {
    const details = page.locator('.composer-options');
    if (!(await details.evaluate((el) => el.open)))
      await details.getByLabel('Composer options', { exact: true }).click();
    return details;
  };
  await idle();
  await page.getByRole('button', { name: 'Choose session model', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a model' });
  await picker.getByRole('textbox', { name: 'Search session models' }).fill(fixtureModel);
  await picker
    .getByRole('button')
    .filter({ has: page.locator('strong', { hasText: fixtureModel }) })
    .click();
  await picker.waitFor({ state: 'detached' });
  await page.getByRole('combobox', { name: 'Session reasoning effort' }).selectOption('high');
  await waitFor(
    async () => (await call('prefs.get', {}, ['prefs.updated'])).reasoningEffort === 'high',
    'Session effort readback',
  );
  await page.getByRole('combobox', { name: 'Session reasoning effort' }).selectOption('auto');
  await waitFor(
    async () => (await call('prefs.get', {}, ['prefs.updated'])).reasoningEffort === 'auto',
    'Session effort inheritance',
  );
  await page.screenshot({ path: join(artifactDir, 'native-composer-calm.png'), fullPage: true });

  await send('[native-composer-hold-queue] Keep this turn open.');
  await waitFor(() => providerFixture.holds.has('queue'), 'Real provider held turn');
  const turnCalls = providerFixture.calls.filter((c) => c.stream).length;
  await send('[native-composer-btw] Keep the public API stable.', 'btw');
  await page.getByRole('status').filter({ hasText: 'BTW saved for this session' }).waitFor();
  assert.equal(
    providerFixture.calls.filter((c) => c.stream).length,
    turnCalls,
    'BTW does not interrupt or start a provider turn',
  );
  assert.ok(providerFixture.holds.has('queue'), 'BTW leaves the active provider request running');
  await send('[native-composer-remove] Remove this pending task.', 'queue');
  const queue = page.locator('.composer-queue');
  await queue.locator('summary').filter({ hasText: '1 queued prompt' }).waitFor();
  await queue.locator('summary').click();
  await queue
    .getByRole('button', {
      name: 'Remove queued prompt [native-composer-remove] Remove this pending task.',
      exact: true,
    })
    .click();
  await queue.waitFor({ state: 'detached' });
  await send('[native-composer-queued] Run this next task.', 'queue');
  await queue.locator('summary').filter({ hasText: '1 queued prompt' }).waitFor();
  assert.equal((await call('queue.get', {}, ['queue.state'])).items.length, 1);
  await page.screenshot({ path: join(artifactDir, 'native-composer-queue.png'), fullPage: true });
  await page.reload();
  await page.locator(`[data-engine-session="${identity.sessionId}"]`).waitFor();
  await queue.locator('summary').filter({ hasText: '1 queued prompt' }).waitFor();
  assert.ok(providerFixture.holds.has('queue'), 'Queue and active turn survive renderer reload');
  await send('Do not lose this steering draft.', 'steer');
  await page.getByRole('alert').filter({ hasText: 'Remove pending queued prompts' }).waitFor();
  assert.equal(await composer().inputValue(), 'Do not lose this steering draft.');
  assert.ok(
    providerFixture.holds.has('queue'),
    'Ambiguous steering does not interrupt or drop queued work',
  );
  await composer().fill('');
  providerFixture.releaseHold('queue');
  await waitFor(
    () => providerFixture.calls.some((c) => c.composerPrompt.includes('[native-composer-queued]')),
    'Engine drains the queue after the held turn',
  );
  await idle();
  assert.equal((await call('queue.get', {}, ['queue.state'])).items.length, 0);
  assert.equal(
    await page
      .locator('.chat-message.user')
      .filter({ hasText: '[native-composer-queued]' })
      .count(),
    1,
    'Drained prompt appears exactly once after reload',
  );
  assert.ok(
    !providerFixture.calls.some((c) => c.composerPrompt.includes('[native-composer-remove]')),
    'Removed prompt never reaches the provider',
  );

  await send('[native-composer-hold-steer] Wait for a new instruction.');
  await waitFor(() => providerFixture.holds.has('steer'), 'Real steer fixture run');
  await send('[native-composer-steered] Follow the revised instruction.', 'steer');
  await waitFor(
    () => providerFixture.canceledHolds.has('steer'),
    'Steer aborts the real provider request',
  );
  await waitFor(
    () => providerFixture.calls.some((c) => c.composerPrompt.includes('[native-composer-steered]')),
    'Steer starts a new provider request',
  );
  await idle();

  await send('[native-composer-hold-edit] Keep this prompt available to edit.');
  await waitFor(() => providerFixture.holds.has('edit'), 'Real stop-and-edit fixture run');
  await composer().fill('Existing unsent draft must survive.');
  await page.getByRole('button', { name: 'Stop and edit last prompt', exact: true }).click();
  await page.getByText('Your composer already contains a draft.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Keep current draft', exact: true }).click();
  assert.equal(await composer().inputValue(), 'Existing unsent draft must survive.');
  await waitFor(
    () => providerFixture.canceledHolds.has('edit'),
    'Stop and edit aborts the active request',
  );
  await idle();
  await composer().fill('');
  await send('[native-composer-hold-restore] Restore this exact last prompt.');
  await waitFor(() => providerFixture.holds.has('restore'), 'Real prompt restoration fixture');
  await page.getByRole('button', { name: 'Stop and edit last prompt', exact: true }).click();
  await waitFor(
    async () =>
      (await composer().inputValue()) ===
      '[native-composer-hold-restore] Restore this exact last prompt.',
    'Last prompt restored into empty composer',
  );
  await idle();
  await composer().fill('');

  await page.getByRole('combobox', { name: 'Message delivery mode' }).selectOption('queue');
  await composer().fill('[native-composer-refine] Build the desktop composer.');
  await (await options()).getByRole('button', { name: 'Refine this draft', exact: true }).click();
  let refine = page.getByRole('dialog', { name: 'Refine your prompt' });
  await refine.getByRole('button', { name: 'Refined', exact: true }).waitFor();
  await waitFor(
    async () => await refine.getByRole('button', { name: 'Refined', exact: true }).isEnabled(),
    'Real model refinement result',
    120000,
  );
  await refine
    .getByRole('region', { name: 'Prompt preview', exact: true })
    .getByText('Build the desktop composer and preserve the requested session boundaries.', {
      exact: true,
    })
    .waitFor();
  assert.ok(
    providerFixture.calls.some((c) => c.refiner),
    'Refinement calls the production refiner/provider path',
  );
  assert.equal(
    await refine.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
    'Refinement dialog has no clipped horizontal content',
  );
  await page.screenshot({
    path: join(artifactDir, 'native-composer-refinement.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(
    await refine.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
    'Compact refinement dialog fits its container',
  );
  await page.screenshot({
    path: join(artifactDir, 'native-composer-refinement-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1480, height: 960 });
  await refine.getByRole('button', { name: 'Keep original draft', exact: true }).click();
  assert.equal(
    await composer().inputValue(),
    '[native-composer-refine] Build the desktop composer.',
    'Leaving refinement keeps the original',
  );
  await (await options()).getByRole('button', { name: 'Refine this draft', exact: true }).click();
  refine = page.getByRole('dialog', { name: 'Refine your prompt' });
  await waitFor(
    async () => await refine.getByRole('button', { name: 'English', exact: true }).isEnabled(),
    'English refinement version',
    120000,
  );
  await refine.getByRole('button', { name: 'English', exact: true }).click();
  await refine.getByRole('checkbox', { name: 'Edit this version', exact: true }).check();
  await refine
    .getByRole('textbox', { name: 'Edit refined prompt' })
    .fill(
      '[native-composer-refined-approved] Implement the desktop composer and preserve all session boundaries.',
    );
  await refine.getByRole('button', { name: 'Approve & send', exact: true }).click();
  await refine.waitFor({ state: 'detached' });
  await waitFor(
    () =>
      providerFixture.calls.some(
        (c) => !c.refiner && c.composerPrompt.includes('[native-composer-refined-approved]'),
      ),
    'Approved refinement reaches the actual next turn',
  );
  await idle();
  assert.equal(await composer().inputValue(), '');
  await (await options())
    .getByRole('checkbox', { name: 'Refine before sending', exact: true })
    .check();
  await waitFor(
    async () => (await call('prefs.get', {}, ['prefs.updated'])).enhanceEnabled === true,
    'Automatic refinement enabled',
  );
  await page.locator('.composer-options').getByLabel('Composer options', { exact: true }).click();
  await send(
    '[native-composer-auto] Build the native composer with a clear model selector.',
    'queue',
  );
  refine = page.getByRole('dialog', { name: 'Refine your prompt' });
  await waitFor(
    async () => await refine.getByRole('button', { name: 'Refined', exact: true }).isEnabled(),
    'Automatic refinement preview',
    120000,
  );
  await refine.getByRole('button', { name: 'Original', exact: true }).click();
  await refine.getByRole('button', { name: 'Approve & send', exact: true }).click();
  await refine.waitFor({ state: 'detached' });
  await waitFor(
    () =>
      providerFixture.calls.some(
        (c) => !c.refiner && c.composerPrompt.includes('[native-composer-auto]'),
      ),
    'Original prompt approved from automatic refinement',
  );
  await idle();
  await (await options())
    .getByRole('checkbox', { name: 'Refine before sending', exact: true })
    .uncheck();
  await waitFor(
    async () => (await call('prefs.get', {}, ['prefs.updated'])).enhanceEnabled === false,
    'Automatic refinement preference restored',
  );
  await page.locator('.composer-options').getByLabel('Composer options', { exact: true }).click();
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Compact composer does not overflow',
  );
  await page.screenshot({ path: join(artifactDir, 'native-composer-compact.png'), fullPage: true });
  await page.setViewportSize({ width: 1480, height: 960 });
  await page.getByRole('combobox', { name: 'Message delivery mode' }).selectOption('btw');
  console.log(
    'PASS: native model/effort, BTW without interrupt, persistent queue/reload/remove/drain, stop-and-steer, real bilingual refinement approval, draft retention and compact composer',
  );
}
