import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function exerciseNativeProviderOAuth({
  page,
  rpc,
  call,
  waitFor,
  providerId,
  artifactDir,
}) {
  const sections = page.getByRole('navigation', { name: 'WrongStack settings sections' });
  await sections.getByRole('button', { name: 'Providers & models', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Subscription sign-in', exact: true });
  const methods = (await call('auth.oauth.list')).providers;
  assert.ok(methods.some((item) => item.id === 'chatgpt'));
  await panel
    .getByRole('combobox', { name: 'Subscription service', exact: true })
    .selectOption('chatgpt');
  await panel
    .getByRole('combobox', { name: 'Subscription connection mode', exact: true })
    .selectOption('new');
  await panel
    .getByRole('textbox', { name: 'Subscription account name', exact: true })
    .fill(providerId);
  await panel.getByRole('button', { name: 'Start sign-in', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: 'already exists' }).waitFor();
  const alias = 'native-signin-fixture';
  await panel.getByRole('textbox', { name: 'Subscription account name', exact: true }).fill(alias);
  await panel.getByRole('button', { name: 'Start sign-in', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep connections unchanged', exact: true })
    .click();
  assert.equal(
    await panel.getByRole('region', { name: 'Subscription sign-in progress', exact: true }).count(),
    0,
  );
  const begin = async () => {
    await panel.getByRole('button', { name: 'Start sign-in', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Begin reviewed sign-in', exact: true })
      .click();
    await panel.getByText('Continue in your browser.', { exact: true }).waitFor();
  };
  const events = async () => {
    let offset = 0;
    const frames = [];
    for (let i = 0; i < 20; i++) {
      const batch = await rpc('profile.events', { offset });
      frames.push(...batch.events);
      offset = batch.offset;
      if (!batch.hasMore) return frames;
    }
    throw Error('OAuth fixture event history exceeded its read budget');
  };
  try {
    await begin();
    const refused = await call('auth.oauth.cancel', {
      kind: 'chatgpt',
      attemptId: 'stale-native-attempt',
    });
    assert.equal(refused.phase, 'error');
    await panel.getByText('Continue in your browser.', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Paste a callback URL or code', exact: true }).click();
    await panel
      .getByLabel('Sign-in callback URL or code', { exact: true })
      .fill('fixture-only-not-submitted');
    await page.screenshot({
      path: join(artifactDir, 'native-subscription-signin.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 800, height: 640 });
    assert.equal(
      await panel.evaluate((element) => element.scrollWidth > element.clientWidth),
      false,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactDir, 'native-subscription-signin-compact.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1480, height: 960 });
    await panel.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
    await panel
      .getByText('Sign-in cancelled. Saved connections were kept.', { exact: true })
      .waitFor();
    assert.equal(
      await panel.getByLabel('Sign-in callback URL or code', { exact: true }).count(),
      0,
    );
    assert.equal(
      (await call('providers.saved')).providers.some((item) => item.id === alias),
      false,
    );
    const beforeCancel = (await events()).filter(
      (event) =>
        event.type === 'auth.oauth.status' && event.payload.message === 'Sign-in cancelled.',
    ).length;
    await begin();
    await sections.getByRole('button', { name: 'Model catalog', exact: true }).click();
    await waitFor(
      async () =>
        (await events()).filter(
          (event) =>
            event.type === 'auth.oauth.status' && event.payload.message === 'Sign-in cancelled.',
        ).length > beforeCancel,
      'Detached OAuth attempt closes its own listener',
      15000,
    );
    assert.equal(
      (await call('providers.saved')).providers.some((item) => item.id === alias),
      false,
    );
  } finally {
    await call('auth.oauth.cancel', { kind: 'chatgpt' });
  }
  console.log(
    'PASS: native registry-driven OAuth metadata, alias collision/review, loopback-only browser startup, stale cancellation refusal, transient paste clearing and unmount cancellation without external authentication',
  );
}
