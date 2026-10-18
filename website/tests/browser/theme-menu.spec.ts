import { expect, test } from '@playwright/test';

test('appearance selection persists and System follows device changes', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Color theme:/ });
  const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await expect(trigger).toHaveAccessibleName('Color theme: System');
  await trigger.click();
  await expect(dialog.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  const rect = await dialog.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(15);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 15);
  await dialog.screenshot({ path: testInfo.outputPath('appearance-light.png') });
  await dialog.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(dialog.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  await dialog.screenshot({ path: testInfo.outputPath('appearance-dark.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await page.reload();
  await expect(trigger).toHaveAccessibleName('Color theme: Dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await trigger.click();
  await dialog.getByText('Light', { exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await dialog.getByText('System', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('system');

  // Native radio keys change the selection without a pointer.
  await dialog.getByRole('radio', { name: 'System', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('main h1').click();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.keyboard.press('Tab');
  await expect(dialog).not.toBeVisible();
});
