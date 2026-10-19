import { expect, test } from '@playwright/test';

test('Mammoth Oxog footer matches the single-link layout and repeating SVG signature', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Meet the studio' })).toBeVisible();
  const panel = page.getByRole('link', { name: /^PART OF A BIGGER PICTURE/ });
  const mark = panel.locator('.oxog-mark');
  await panel.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-seen', 'true');
  await expect(panel).toHaveAttribute('href', 'https://oxog.net');
  await expect(panel.getByRole('heading')).toHaveText('Small studio. Big ideas.');
  await expect(panel.getByText('Explore the tools and infrastructure from Oxog.')).toBeVisible();
  await expect(panel.getByText('Meet oxog.net')).toBeVisible();
  await expect(panel.locator('li, a')).toHaveCount(0);
  await expect(page.locator('footer .site-container > :last-child')).toHaveClass('oxog-studio');
  await expect(page.locator('footer')).not.toContainText('Made in Estonia');
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
  expect(await mark.evaluate((svg) => svg.getBoundingClientRect().width)).toBe(
    page.viewportSize()!.width <= 520 ? 65 : 105,
  );
  expect(await panel.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('7px');
  await panel.screenshot({ path: testInfo.outputPath('oxog-studio.png') });

  await page.goto('/created-by');
  await expect(page.locator('main h1')).toContainText('OxogNet.');
  await expect(page).toHaveTitle('Built by OxogNet — WrongStack');
  await expect(page.locator('main')).not.toContainText(/Ersin|Person behind|Independent builder/);
  await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', 'OXOGNET OÜ');
  await expect(page.locator('main a[href="https://oxog.net/projects"]').last()).toBeVisible();

  // Match Mammoth's six-second loop, 150ms stagger and draw/hold keyframes.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(mark).toHaveAttribute('data-seen', 'false');
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).strokeDashoffset),
  ).toBe('0px');
  await panel.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-seen', 'true');
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName),
  ).toBe('oxog-signature');
  const loops = await mark.locator('path').evaluateAll((paths) =>
    paths.map((path) => {
      const style = getComputedStyle(path);
      const animation = path.getAnimations()[0]!;
      return {
        duration: style.animationDuration,
        delay: style.animationDelay,
        iterations: animation.effect!.getTiming().iterations,
        keyframes: (animation.effect as KeyframeEffect).getKeyframes().map((keyframe) => ({
          offset: keyframe.computedOffset,
          stroke: keyframe.strokeDashoffset,
        })),
      };
    }),
  );
  expect(loops).toEqual(
    [0, 0.15, 0.3, 0.45].map((delay) => ({
      duration: '6s',
      delay: `${delay}s`,
      iterations: Infinity,
      keyframes: [
        { offset: 0, stroke: '400px' },
        { offset: 0.33, stroke: '0px' },
        { offset: 1, stroke: '0px' },
      ],
    })),
  );
  await expect
    .poll(async () =>
      mark
        .locator('path')
        .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).strokeDashoffset)),
    )
    .toEqual(['0px', '0px', '0px', '0px']);
  const mouse = page.getByRole('button', { name: 'Fare efektlerini kapat' });
  await mouse.click();
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName),
  ).toBe('oxog-signature');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(mark).toHaveAttribute('data-seen', 'false');
  expect(
    await mark
      .locator('path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName),
  ).toBe('none');
  await panel.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-seen', 'true');
  await panel.screenshot({ path: testInfo.outputPath('oxog-studio-animated.png') });
});
