import { expect, test } from '@playwright/test';

test('OxogNet attribution and signature work in both motion modes', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Meet the studio' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Built by OxogNet', exact: true });
  const mark = panel.locator('.oxog-mark');
  await panel.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-seen', 'true');
  await expect(panel.getByRole('link', { name: 'OXOGNET', exact: true })).toHaveAttribute(
    'href',
    'https://oxog.net',
  );
  await expect(panel.getByText('WrongStack is built and maintained by')).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(4);
  await expect(page.locator('footer')).not.toContainText(/Ersin|@ersinkoc/);
  await expect(page.locator('main')).not.toContainText(/Ersin|Independent builder/);
  const still = await mark.locator('path').evaluateAll((paths) =>
    paths.map((path) => ({
      offset: getComputedStyle(path).strokeDashoffset,
      animation: getComputedStyle(path).animationName,
    })),
  );
  expect(still).toEqual(Array.from({ length: 4 }, () => ({ offset: '0px', animation: 'none' })));
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await panel.screenshot({ path: testInfo.outputPath('oxog-studio.png') });

  await page.goto('/created-by');
  await expect(page.locator('main h1')).toContainText('OxogNet.');
  await expect(page).toHaveTitle('Built by OxogNet — WrongStack');
  await expect(page.locator('main')).not.toContainText(/Ersin|Person behind|Independent builder/);
  await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', 'OXOGNET OÜ');
  await expect(page.locator('main a[href="https://oxog.net/projects"]').last()).toBeVisible();

  // The normal-motion signature starts only on entering view, finishes all four
  // strokes, and remains complete when the user scrolls away and back again.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(mark).toHaveAttribute('data-seen', 'false');
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).strokeDashoffset),
  ).toBe('400px');
  await panel.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-seen', 'true');
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName),
  ).toBe('oxog-signature');
  await expect
    .poll(async () =>
      mark
        .locator('path')
        .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).strokeDashoffset)),
    )
    .toEqual(['0px', '0px', '0px', '0px']);
  const starts = await mark
    .locator('path')
    .evaluateAll((paths) => paths.map((path) => path.getAnimations()[0]?.startTime));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await panel.scrollIntoViewIfNeeded();
  expect(
    await mark
      .locator('path')
      .evaluateAll((paths) => paths.map((path) => path.getAnimations()[0]?.startTime)),
  ).toEqual(starts);
});
