import { expect, test } from '@playwright/test';

test('mouse control persists while ambient and decorative animations continue', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-18T00:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const background = page.locator('.ambient-background');
  const button = page.getByRole('button', { name: /Fare efektlerini (aç|kapat)/ });
  const theme = page.getByRole('button', { name: /^Color theme:/ });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'Fare efektlerini kapat');
  await expect(background).toHaveAttribute('data-motion', 'running');
  const rect = (await button.boundingBox())!;
  const themeRect = (await theme.boundingBox())!;
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
  expect(rect.x).toBeGreaterThanOrEqual(themeRect.x + themeRect.width);
  expect(rect.x - themeRect.x - themeRect.width).toBeLessThan(10);
  await expect(page.locator('header nav')).toBeVisible();
  const headerFits = () =>
    page.locator('header nav').evaluate((nav) => {
      const children = [...nav.children]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0);
      return (
        children.every((rect) => rect.x >= 0 && rect.right <= innerWidth) &&
        children.every((rect, index) => index === 0 || rect.x >= children[index - 1]!.right)
      );
    });
  expect(await headerFits()).toBe(true);
  await page.clock.runFor(40);
  expect(
    await page
      .locator('.signal-line')
      .first()
      .evaluate((element) => getComputedStyle(element).animationDuration),
  ).toBe('9s');
  expect(
    await background
      .locator('.ambient-effects')
      .evaluate((element) => getComputedStyle(element).visibility),
  ).toBe('visible');
  await expect(background).toHaveAttribute('data-active-bursts', '0');
  await page.mouse.click(8, 240);
  await page.clock.runFor(40);
  await expect(background).toHaveAttribute('data-active-bursts', '1');
  await button.focus();
  await page.keyboard.press('Space');
  await expect(button).toBeFocused();
  await expect(button).toHaveAccessibleName('Fare efektlerini aç');
  await expect(background).toHaveAttribute('data-interactions', 'off');
  await expect(background).toHaveAttribute('data-motion', 'running');
  await expect(background).toHaveAttribute('data-active-bursts', '0');
  const node = background.locator('[data-ambient-node]').first();
  const still = await node.getAttribute('transform');
  await page.mouse.move(70, 270);
  await page.mouse.click(8, 240);
  await page.clock.runFor(300);
  await expect(background).toHaveAttribute('data-active-bursts', '0');
  expect(await node.getAttribute('transform')).not.toBe(still);
  expect(
    await background
      .locator('.ambient-effects')
      .evaluate((element) => getComputedStyle(element).visibility),
  ).toBe('hidden');
  expect(
    await page
      .locator('.signal-line')
      .first()
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe('running');
  for (const [selector, pseudo] of [
    ['.hero-noise', '::before'],
    ['.hero-orbit', '::after'],
  ] as const) {
    expect(
      await page.locator(selector).evaluate(
        (element, pseudo) => ({
          name: getComputedStyle(element, pseudo).animationName,
          state: getComputedStyle(element, pseudo).animationPlayState,
        }),
        pseudo,
      ),
    ).toEqual({
      name: selector === '.hero-noise' ? 'hero-glow-drift' : 'hero-orbit-spin',
      state: 'running',
    });
  }
  await page.locator('header').screenshot({ path: testInfo.outputPath('header-motion-off.png') });
  await theme.click();
  await page.getByRole('dialog', { name: 'Appearance' }).getByText('Dark', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(background).toHaveAttribute('data-interactions', 'off');
  await expect(background).toHaveAttribute('data-motion', 'running');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(background).toHaveAttribute('data-interactions', 'on');
  await expect(background).toHaveAttribute('data-motion', 'running');
  await page.reload();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(background).toHaveAttribute('data-motion', 'running');
  await page.locator('header').screenshot({ path: testInfo.outputPath('header-motion-on.png') });
  if (page.viewportSize()!.width === 375) {
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await headerFits()).toBe(true);
  }
  expect(errors).toEqual([]);
});
