import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';
import { assertSquareCorners } from './square-corner-check.mjs';

export async function checkNextSteps(browser, base, output, errors) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    const language = theme === 'dark' ? 'tr' : 'en';
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1080 }, colorScheme: theme });
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(`${base}?theme=${theme}&nextsteps=1&lang=${language}`);
        const draft = page.getByRole('textbox', {
          name: language === 'tr' ? 'Kendi mesajınız' : 'Your message',
          exact: true,
        });
        const submit = page.getByTestId('next-steps-submit');
        await expect(draft).toBeVisible();
        await expect(submit).toBeDisabled();
        await page.getByRole('button', { name: /Run the focused tests/ }).click();
        await page.getByRole('button', { name: /Update the documentation/ }).click();
        await draft.fill('Keep the corners square.\nCheck the mobile layout too.');
        if (width === 1440) {
          await page.evaluate(() => window.fixture.config.setState({ wsConnected: false }));
          await submit.click();
          await expect(draft).toHaveValue('Keep the corners square.\nCheck the mobile layout too.');
          await expect(
            page
              .getByRole('button', { pressed: true })
              .filter({ hasText: /Run the focused tests|Update the documentation/ }),
          ).toHaveCount(2);
          assert.equal(
            await page.evaluate(
              () => window.fixture.sent.filter((item) => item.type === 'user_message').length,
            ),
            0,
          );
          await expect(page.locator('.ws-toast')).toBeVisible();
          await page.locator('.ws-toast button').click();
          await page.evaluate(() => window.fixture.config.setState({ wsConnected: true }));
          await draft.focus();
        }
        await page.keyboard.press('Tab');
        await expect(submit).toBeFocused();
        await expect(submit).toContainText('3');
        await assertSquareCorners(page);
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Next steps must fit the viewport',
        );
        await page.screenshot({
          animations: 'disabled',
          path: path.join(output, `next-steps-${theme}-${width}.png`),
        });
        await page.keyboard.press('Enter');
        await expect
          .poll(() =>
            page.evaluate(
              () => window.fixture.sent.filter((item) => item.type === 'user_message').length,
            ),
          )
          .toBe(1);
        const sent = await page.evaluate(
          () => window.fixture.sent.find((item) => item.type === 'user_message').payload.content,
        );
        assert.equal(
          sent,
          'Run the focused tests\nUpdate the documentation\nKeep the corners square.\nCheck the mobile layout too.',
        );
        results.push({ theme, language, width, batch: 'PASS', keyboard: 'PASS' });
        console.log('next steps passed', theme, width);
      } finally {
        await page.close();
      }
    }
  }
  return results;
}
