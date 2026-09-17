import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { generateTotp } from '@wrongstack/core/security';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-auth-browser-'));
const previousHome = process.env.WRONGSTACK_HOME;
process.env.WRONGSTACK_HOME = path.join(dir, 'state');
const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
let server;
let browser;
try {
  const { startHqServer } = await import('../src/hq-server.ts');
  const log = console.log;
  try {
    console.log = () => {};
    server = await startHqServer({
      host: '127.0.0.1',
      port,
      exactPort: true,
      dataDir: path.join(dir, 'hq'),
      password: 'fixture-HQ-password!234',
      requireBrowserAuth: true,
    });
  } finally {
    console.log = log;
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('#hq-password-input').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText(/invalid password/i)).toBeVisible();
  await page.locator('#hq-password-input').fill('fixture-HQ-password!234');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/login'));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const login = await response;
  assert.equal(login.status(), 429);
  await expect(page.getByText(/Retry after \d+ seconds/)).toBeVisible();
  const retryAfter = Number(login.headers()['retry-after']);
  assert.ok(retryAfter > 0 && retryAfter < 10);
  await page.waitForTimeout(retryAfter * 1000 + 100);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#hq-password-input')).toHaveCount(0);
  await page.getByText('Security', { exact: true }).click();
  const setupResponse = page.waitForResponse((r) => r.url().endsWith('/api/auth/totp/setup'));
  await page.getByRole('button', { name: 'Start 2FA enrollment' }).click();
  const setup = await setupResponse;
  assert.equal(setup.status(), 200);
  const { secret } = await setup.json();
  assert.equal(typeof secret, 'string');
  await page.getByLabel('Verification code').fill(generateTotp(secret));
  const enableResponse = page.waitForResponse((r) => r.url().endsWith('/api/auth/totp/enable'));
  await page.getByRole('button', { name: 'Confirm and enable 2FA' }).click();
  const enabled = await enableResponse;
  assert.equal(enabled.status(), 200);
  const { recoveryCodes } = await enabled.json();
  assert.ok(recoveryCodes.length > 0);
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: "I've saved my recovery codes" }).click(),
  ]);
  // Enabling 2FA revokes the original password-only session.
  await expect(page.locator('#hq-password-input')).toBeVisible();
  await page.locator('#hq-password-input').fill('fixture-HQ-password!234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Authenticator code').fill(recoveryCodes[0]);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out of HQ' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out of HQ' }).click();
  await page.locator('#hq-password-input').fill('fixture-HQ-password!234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Authenticator code').fill(recoveryCodes[0]);
  const reuseResponse = page.waitForResponse((r) => r.url().endsWith('/api/login/verify'));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  assert.equal((await reuseResponse).status(), 401);
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  // Enrollment consumes the current TOTP counter. Respect the next time slot
  // rather than reusing that code or bypassing the single-use check.
  await page.waitForTimeout(Math.max(2200, 30_000 - (Date.now() % 30_000) + 200));
  await page.getByLabel('Authenticator code').fill(generateTotp(secret));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out of HQ' })).toBeVisible();
  const raw = await fs.readFile(path.join(dir, 'hq/auth.json'), 'utf8');
  assert.ok(!raw.includes('fixture-HQ-password!234'));
  assert.ok(!raw.includes(recoveryCodes[0]));
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(`http://127.0.0.1:${server.port}/mobile`);
  await mobile.locator('#hq-password-input').fill('fixture-HQ-password!234');
  await mobile.getByRole('button', { name: 'Log in', exact: true }).click();
  await mobile.getByLabel('Authenticator code').fill(recoveryCodes[1]);
  await mobile.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(mobile.getByLabel('Authenticator code')).toHaveCount(0);
  const status = await mobile.evaluate(async () => {
    const response = await fetch('/api/auth/status');
    const body = await response.json();
    return { status: response.status, loggedIn: body.loggedIn, authKind: body.authKind };
  });
  assert.equal(status.status, 200);
  assert.equal(status.loggedIn, true);
  assert.equal(status.authKind, 'password');
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mobileContext.close();
  assert.deepEqual(errors, []);
  console.log(
    'Live HQ desktop/mobile password/rate-limit/logout/2FA/recovery single-use browser smoke passed.',
  );
} finally {
  await browser?.close();
  await server?.close();
  if (previousHome === undefined) delete process.env.WRONGSTACK_HOME;
  else process.env.WRONGSTACK_HOME = previousHome;
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
