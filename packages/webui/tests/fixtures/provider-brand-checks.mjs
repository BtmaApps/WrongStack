import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';
import { assertSquareCorners } from './square-corner-check.mjs';

export async function checkProviderBrands(browser, base, output, errors) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1080 }, colorScheme: theme });
      const externalImages = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (
          request.resourceType() === 'image' &&
          new URL(request.url()).origin !== new URL(base).origin
        )
          externalImages.push(request.url());
      });
      await page.goto(`${base}?theme=${theme}&provider-brands=1`);
      const cards = page.getByTestId('provider-key-cards');
      await expect(cards.locator('[data-provider-brand]')).toHaveCount(16);
      await expect
        .poll(() =>
          cards
            .locator('img')
            .evaluateAll(
              (images) =>
                images.length === 16 &&
                images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        )
        .toBe(true);
      await expect(cards.locator('[data-provider-brand="custom"]')).toHaveCount(0);
      await assertSquareCorners(page);
      const input = cards.locator('input[type="password"]').first();
      await input.fill('visual-fixture-not-a-real-key');
      await expect(input).toHaveValue('visual-fixture-not-a-real-key');
      await input.clear();
      assert(
        await cards.evaluate((el) => el.scrollWidth <= el.clientWidth),
        'Key cards must fit viewport',
      );
      await page.screenshot({
        animations: 'disabled',
        path: path.join(output, `provider-key-logos-${theme}-${width}.png`),
      });
      const settings = page.getByTestId('provider-brand-settings');
      await settings.scrollIntoViewIfNeeded();
      await expect(settings.locator('[data-provider-brand]')).toHaveCount(16);
      await expect
        .poll(() =>
          settings
            .locator('img')
            .evaluateAll((images) =>
              images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        )
        .toBe(true);
      await page.screenshot({
        animations: 'disabled',
        path: path.join(output, `provider-catalog-logos-${theme}-${width}.png`),
      });
      await settings.getByRole('button', { name: /Saved/ }).first().click();
      await expect(settings.locator('[data-provider-brand="openai"] img')).toBeVisible();
      await expect(settings.locator('[data-provider-brand="zai"] img')).toBeVisible();
      await expect(settings.locator('[data-provider-brand="custom"] svg')).toBeVisible();
      await expect(settings.locator('[data-provider-brand="custom"] img')).toHaveCount(0);
      await assertSquareCorners(page);
      assert(
        await settings.evaluate((el) => el.scrollWidth <= el.clientWidth),
        `Provider settings must fit viewport at ${width}: ${JSON.stringify(
          await settings.evaluate((el) =>
            [...el.querySelectorAll('*')]
              .filter((child) => child.scrollWidth > child.clientWidth + 1)
              .slice(0, 10)
              .map((child) => ({
                tag: child.tagName,
                cls: child.className,
                width: child.clientWidth,
                scroll: child.scrollWidth,
              })),
          ),
        )}`,
      );
      assert.deepEqual(externalImages, [], 'Provider logos must load locally');
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Provider page must fit viewport',
      );
      results.push({
        theme,
        width,
        keyCards: 'PASS',
        catalog: 'PASS',
        savedAliases: 'PASS',
        neutralFallback: 'PASS',
        localImages: 'PASS',
      });
      await page.close();
    }
  }
  return results;
}
