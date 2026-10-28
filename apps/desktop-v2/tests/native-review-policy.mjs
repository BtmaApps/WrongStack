import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseNativeReviewPolicy({ page, rpc, waitFor, artifactDir, configPath }) {
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
      `Native review policy ${type}`,
      45000,
    );
    if (reply.success === false || reply.ok === false || reply.error)
      throw Error(reply.error ?? reply.message);
    return reply;
  };
  const count = (await rpc('snapshot')).sessions.length;
  const previous = await call('prefs.get');
  await call('prefs.update', {
    fallbackProfiles: { ...previous.fallbackProfiles, 'native-review': ['openai/native-review'] },
  });
  const open = async () => {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'WrongStack settings', exact: true })
      .click();
    await page
      .getByRole('navigation', { name: 'WrongStack settings sections' })
      .getByRole('button', { name: 'Review policy', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Continuous review', exact: true }).waitFor();
  };
  await open();
  const screen = page.getByRole('region', { name: 'WrongStack settings' });
  await screen.getByLabel('Enable Chimera reviews', { exact: true }).uncheck();
  await screen.getByLabel('Enable continuous reviews', { exact: true }).uncheck();
  await screen
    .getByLabel('Chimera reviewer model', { exact: true })
    .fill('openrouter/vendor/reviewer');
  await screen.getByLabel('Chimera file limit', { exact: true }).fill('120');
  await screen.getByLabel('Chimera follow-up policy', { exact: true }).selectOption('ask');
  await screen
    .getByLabel('Continuous review fallback profile', { exact: true })
    .selectOption('native-review');
  await screen
    .getByText('Routing edits are not reflected here until settings are saved and read back.', {
      exact: true,
    })
    .waitFor();
  await screen
    .getByLabel('Continuous reviewer model', { exact: true })
    .fill('openai/explicit-reviewer');
  assert.equal(
    await screen.getByLabel('Continuous review fallback profile', { exact: true }).inputValue(),
    '',
  );
  await screen
    .getByLabel('Continuous review fallback profile', { exact: true })
    .selectOption('native-review');
  assert.equal(
    await screen.getByLabel('Continuous reviewer model', { exact: true }).inputValue(),
    '',
  );
  await screen.getByLabel('Review model rotation', { exact: true }).selectOption('random');
  await screen.getByLabel('Cascade review threshold', { exact: true }).selectOption('critical');
  await screen.getByLabel('Review batch delay', { exact: true }).fill('0');
  await screen.getByLabel('Review batch file limit', { exact: true }).fill('121');
  await screen.getByLabel('Concurrent review limit', { exact: true }).fill('20');
  await call('prefs.update', { maxIterations: 77 });
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  await screen
    .getByText('WrongStack settings saved to your active profile.', { exact: true })
    .waitFor();
  const saved = await call('prefs.get');
  assert.equal(saved.maxIterations, 77, 'Review save preserves unrelated concurrent profile edits');
  assert.equal(saved.chimeraEnabled, false);
  assert.equal(saved.chimeraProvider, 'openrouter');
  assert.equal(saved.chimeraModel, 'vendor/reviewer');
  assert.equal(saved.chimeraMaxFiles, 120);
  assert.equal(saved.chimeraAutoFix, 'ask');
  assert.equal(saved.autoReviewEnabled, false);
  assert.equal(saved.autoReviewFallbackProfile, 'native-review');
  assert.equal(saved.autoReviewProvider, '');
  assert.equal(saved.autoReviewModel, '');
  assert.equal(saved.autoReviewModelSelection, 'random');
  assert.equal(saved.autoReviewCascadeOn, 'critical');
  assert.equal(saved.autoReviewDebounceMs, 0);
  assert.equal(saved.autoReviewMaxFilesPerBatch, 121);
  assert.equal(saved.autoReviewMaxConcurrentReviews, 20);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.extensions['wstack-chimera'].model, 'vendor/reviewer');
  assert.equal(config.extensions['wstack-chimera'].autoFix, 'ask');
  assert.equal(config.extensions['wstack-auto-review'].fallbackProfile, 'native-review');
  assert.equal(config.extensions['wstack-auto-review'].maxConcurrentReviews, 20);
  await screen.getByLabel('Review batch delay', { exact: true }).fill('-1');
  await screen.getByRole('button', { name: 'Save settings', exact: true }).click();
  assert.equal(
    (await call('prefs.get')).autoReviewDebounceMs,
    0,
    'Invalid input never changes the profile',
  );
  await screen.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.screenshot({ path: join(artifactDir, 'native-review-policy.png'), fullPage: true });
  await page.reload();
  await open();
  assert.equal(
    await screen.getByLabel('Chimera reviewer model', { exact: true }).inputValue(),
    'openrouter/vendor/reviewer',
  );
  assert.equal(
    await screen.getByLabel('Continuous review fallback profile', { exact: true }).inputValue(),
    'native-review',
  );
  assert.equal((await rpc('snapshot')).sessions.length, count);
  await page
    .getByRole('navigation', { name: 'WrongStack settings sections' })
    .getByRole('button', { name: 'Fallbacks & agent defaults', exact: true })
    .click();
  assert.equal(
    await screen
      .getByRole('button', { name: 'Remove profile native-review', exact: true })
      .isDisabled(),
    true,
    'A profile selected by continuous review cannot be deleted as unused',
  );
  console.log(
    'PASS: native profile review policy save/readback and disk persistence, named profile/model exclusion, real numeric bounds, unrelated edit preservation, invalid input refusal and UI reload without conversations',
  );
}
