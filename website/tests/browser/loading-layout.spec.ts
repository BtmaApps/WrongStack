import { expect, test } from '@playwright/test';

test('lazy page loading reserves a viewport so the footer does not flash into view', async ({
  page,
}) => {
  let release!: () => void;
  const chunkGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/(?:assets\/HomePage-[^/]+\.js|src\/pages\/HomePage\.tsx)(?:\?.*)?$/,
    async (route) => {
      await chunkGate;
      await route.continue();
    },
  );
  const navigation = page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    const loading = page.getByText('Loading manual…', { exact: true });
    await expect(loading).toBeVisible();
    const footer = await page.locator('footer').boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(page.viewportSize()!.height);
  } finally {
    release();
    await navigation;
  }
  await expect(page.locator('main h1')).toBeVisible();
});
