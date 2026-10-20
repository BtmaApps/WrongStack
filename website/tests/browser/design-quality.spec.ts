import { expect, test } from '@playwright/test';

test('scrolled search stays in the top layer and contains keyboard focus', async ({ page }) => {
  await page.goto('/tools');
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
  const trigger = page.getByRole('button', { name: 'Search ⌘ K: pages, features and commands' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search WrongStack documentation' });
  const input = dialog.getByRole('combobox', { name: 'Search documentation' });
  await expect(input).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds?.y).toBe(0);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close search', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.fill('no-such-destination-quality-check');
  await expect(dialog.getByText('No exact trail found.')).toBeVisible();
  await expect(dialog.getByRole('listbox').getByRole('heading')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(input).not.toHaveAttribute('aria-activedescendant');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await trigger.click();
  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await input.fill('mailbox');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/mailbox$/);
  await expect(page.locator('main h1')).toBeVisible();
});

test('brand links retain readable contrast on hover in both themes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/ecosystem');
    const link = page.getByRole('link', { name: 'Read the docs for WrongStack', exact: true });
    await link.hover();
    const colors = await link.evaluate((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('article')!).backgroundColor,
    }));
    const luminance = (color: string) => {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((value) => {
          const c = Number(value) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const a = luminance(colors.text),
      b = luminance(colors.background);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});

test('short-screen navigation scrolls and Escape returns focus', async ({ page }) => {
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: 400 });
  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: width < 1024 ? 'Open navigation' : 'More',
    exact: true,
  });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const scrollport =
    width < 1024 ? page.locator('header > div').last() : page.locator('header [class~="left-1/2"]');
  const geometry = await scrollport.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    overflow: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
    height: element.clientHeight,
  }));
  expect(geometry.bottom).toBeLessThanOrEqual(400);
  expect(geometry.overflow).toBe('auto');
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('fonts load locally and denied clipboard access is explained', async ({ page }) => {
  const externalFonts: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('permission denied');
        },
      },
    });
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Space Grotesk');
  expect(
    await page
      .locator('main code')
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('JetBrains Mono');
  expect(
    await page.evaluate(async () => {
      const faces = await document.fonts.load('400 16px "Space Grotesk"', 'ÇĞİÖŞÜçğıöşü');
      return faces.length > 0 && document.fonts.check('400 16px "Space Grotesk"', 'ÇĞİÖŞÜçğıöşü');
    }),
  ).toBe(true);
  expect(externalFonts).toEqual([]);
  await page.locator('main button[aria-label^="Copy "]').first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Copy unavailable.' })).toHaveText(
    'Copy unavailable. Select and copy the text manually.',
  );
  const command = page.getByRole('region', { name: 'Install command', exact: true });
  await command.focus();
  await expect(command).toBeFocused();
  expect(await command.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
});

test('content remains readable when intersection animations are unavailable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'IntersectionObserver');
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools');
  await expect(page.locator('.site-card-grid').first()).toBeVisible();
  expect(
    await page
      .locator('.site-card-grid')
      .first()
      .evaluate((element) => {
        for (let parent: Element | null = element; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).opacity === '0') return false;
        }
        return true;
      }),
  ).toBe(true);
  expect(errors).toEqual([]);
});
