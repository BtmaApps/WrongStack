import { expect, test } from '@playwright/test';

test('ambient SVG stays passive, bounded and pauses when hidden or reduced', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-18T00:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const background = page.locator('.ambient-background');
  await expect(background).toHaveAttribute('data-motion', 'running');
  await expect(background).toHaveAttribute('aria-hidden', 'true');
  const expectedCount =
    page.viewportSize()!.width < 768 ? 8 : page.viewportSize()!.width < 1280 ? 16 : 24;
  await expect(background).toHaveAttribute('data-node-count', String(expectedCount));
  expect(await background.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    'none',
  );
  const node = background.locator('[data-ambient-node]').first();
  const start = await node.getAttribute('transform');
  await page.clock.runFor(80);
  await expect.poll(() => node.getAttribute('transform')).not.toBe(start);

  await page.mouse.click(8, 240);
  await page.clock.runFor(40);
  await expect(background).toHaveAttribute('data-active-bursts', '1');
  await page.clock.fastForward(2000);
  await page.clock.runFor(80);
  await expect(background).toHaveAttribute('data-active-bursts', '0', { timeout: 3000 });
  await page.getByRole('button', { name: /^Color theme:/ }).click();
  await page.getByRole('dialog', { name: 'Appearance' }).getByText('Dark', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.clock.runFor(100);
  await expect(background).toHaveAttribute('data-active-bursts', '0');
  const darkStroke = await node.evaluate((element) => getComputedStyle(element).stroke);
  await page.screenshot({ path: testInfo.outputPath('ambient-dark.png') });

  await page.mouse.move(8, 360);
  await page.mouse.wheel(0, 850);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await expect(background).toHaveAttribute('data-motion', 'running');
  await background.evaluate((element) => {
    (element as HTMLElement).style.display = 'none';
  });
  await expect(background).toHaveAttribute('data-motion', 'offscreen');
  await background.evaluate((element) => {
    (element as HTMLElement).style.display = '';
  });
  await expect(background).toHaveAttribute('data-motion', 'running');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(80);
  await expect(background).toHaveAttribute('data-motion', 'reduced');
  const still = await node.getAttribute('transform');
  await page.clock.runFor(150);
  expect(await node.getAttribute('transform')).toBe(still);
  await page.mouse.click(8, 240);
  await expect(background).toHaveAttribute('data-active-bursts', '0');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(background).toHaveAttribute('data-motion', 'running');
  const resumed = await node.getAttribute('transform');
  await page.clock.runFor(80);
  await expect.poll(() => node.getAttribute('transform')).not.toBe(resumed);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(background).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: /^Color theme:/ }).click();
  await page
    .getByRole('dialog', { name: 'Appearance' })
    .getByText('Light', { exact: true })
    .click();
  await page.keyboard.press('Escape');
  expect(await node.evaluate((element) => getComputedStyle(element).stroke)).not.toBe(darkStroke);
  await page.goto('/features');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(background).toHaveCount(1);
  await expect(background).toHaveAttribute('data-motion', 'reduced');
  await page.screenshot({ path: testInfo.outputPath('ambient-light.png') });
  if (page.viewportSize()!.width === 375) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(background).toHaveAttribute('data-motion', 'running');
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 180, y: 720 }],
    });
    for (const y of [640, 560, 480, 400, 320]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 180, y }],
      });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(150);
    await expect(background).toHaveAttribute('data-active-bursts', '0');
    await session.detach();
  }
  expect(pageErrors).toEqual([]);
});
