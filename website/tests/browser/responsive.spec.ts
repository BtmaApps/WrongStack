import { expect, test } from '@playwright/test';
import { siteRoutes } from '../../src/data/content';

const detailRoutes = [
  '/commands/help',
  '/tools/dead-code-scan',
  '/features/brain-council',
  '/plugins/wstack-prompts',
  '/modes/default',
  '/agent-roster/explore',
];

test('pages share fluid content edges and keep text inside the viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const route of [...siteRoutes, ...detailRoutes]) {
    await test.step(route, async () => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const nav = document.querySelector('header nav')!.getBoundingClientRect();
        const shells = [...document.querySelectorAll('.site-container')]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0)
          .map((rect) => ({ x: rect.x, width: rect.width }));
        // Tables, code and boards may scroll locally. Their text must stay inside
        // that scrollport; clipping on the page itself must not hide a layout error.
        const escapedText = [
          ...document.querySelectorAll(
            'main p, main h1, main h2, main h3, main code, main button, main a',
          ),
        ]
          .filter((element) => {
            if (!element.getClientRects().length) return false;
            let parent = element.parentElement;
            while (parent && parent.tagName !== 'MAIN') {
              if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX))
                return false;
              parent = parent.parentElement;
            }
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > viewport + 1;
          })
          .map((element) => element.textContent?.slice(0, 100));
        return {
          viewport,
          documentWidth: document.documentElement.scrollWidth,
          nav: { x: nav.x, width: nav.width },
          shells,
          escapedText,
        };
      });
      expect
        .soft(layout.documentWidth, `${route}: document overflow`)
        .toBeLessThanOrEqual(layout.viewport);
      expect.soft(layout.escapedText, `${route}: text outside viewport`).toEqual([]);
      expect.soft(layout.shells.length).toBeGreaterThan(2);
      for (const shell of layout.shells) {
        expect.soft(Math.abs(shell.x - layout.nav.x), `${route}: left edge`).toBeLessThan(1);
        expect
          .soft(Math.abs(shell.width - layout.nav.width), `${route}: content width`)
          .toBeLessThan(1);
      }
      expect.soft(layout.nav.width).toBeLessThanOrEqual(layout.viewport - 32);
      if (layout.viewport === 1440) expect.soft(layout.nav.width).toBeGreaterThan(1350);
      if (layout.viewport >= 1920) {
        expect.soft(layout.nav.width).toBeGreaterThanOrEqual(1680);
        expect.soft(layout.nav.width).toBeLessThanOrEqual(1750);
      }
    });
  }
  expect(errors).toEqual([]);
});

test('navigation, search, theme and catalog filters remain usable', async ({ page }, testInfo) => {
  await page.goto('/tools');
  await expect(page.locator('main h1')).toBeVisible();
  const width = page.viewportSize()!.width;
  const columns = await page
    .locator('.site-card-grid')
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(
    width < 640 ? 1 : width < 1024 ? 2 : width < 1440 ? 3 : width < 1920 ? 4 : 5,
  );
  const filter = page.getByPlaceholder('Search tools, capabilities or families…');
  await filter.fill('no-such-tool-responsive-check');
  await expect(page.getByText('No tool matches this filter.')).toBeVisible();
  await filter.fill('browser');
  await expect(page.locator('.site-card-grid').first()).toBeVisible();
  await filter.fill('');
  await page
    .locator('.site-card-grid')
    .first()
    .screenshot({ path: testInfo.outputPath('catalog.png') });
  await page.goto('/');
  if (width < 1024) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Open navigation', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('button', { name: 'More', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Search pages, features and commands' }).click();
  const search = page.getByRole('dialog', { name: 'Search WrongStack documentation' });
  await expect(search).toBeVisible();
  await search.getByRole('textbox').fill('mailbox');
  await expect(search.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).not.toBeVisible();
  await page.getByRole('button', { name: /^Color theme:/ }).click();
  await page.getByRole('dialog', { name: 'Appearance' }).getByText('Dark', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('home-dark.png') });
  await page.getByRole('button', { name: /^Color theme:/ }).click();
  await page
    .getByRole('dialog', { name: 'Appearance' })
    .getByText('Light', { exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('home-light.png') });
});
