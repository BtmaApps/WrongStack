import { expect, test } from '@playwright/test';

test('shared effects paint across clipped cards and follow text through scroll', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/features');
  await expect(page.locator('main h1')).toBeVisible();
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.id = 'ambient-paint-control';
    panel.style.cssText =
      'position:fixed;left:40px;top:180px;width:280px;height:240px;z-index:2;overflow:hidden;background:var(--bg);border-radius:12px;';
    panel.innerHTML =
      '<p style="padding:24px">Selectable copy inside an opaque clipped panel</p><a href="#ambient-link" style="display:block;padding:24px">Linked card content</a>';
    panel.addEventListener('pointermove', (event) => event.stopPropagation());
    document.querySelector('.site-content')!.append(panel);
  });
  // Probe the actual browser paint order, then restore the passive SVG immediately.
  expect(
    await page
      .locator('.ambient-background svg')
      .first()
      .evaluate((svg) => {
        const previous = (svg as SVGElement).style.pointerEvents;
        (svg as SVGElement).style.pointerEvents = 'all';
        const top = document.elementFromPoint(160, 260);
        (svg as SVGElement).style.pointerEvents = previous;
        return top === svg || svg.contains(top);
      }),
  ).toBe(true);
  const effects = page.locator('.ambient-effects');
  await expect(effects).toHaveCSS('position', 'fixed');
  await expect(effects).toHaveCSS('pointer-events', 'none');
  expect(
    await effects.evaluate((svg) => {
      const previous = svg.style.pointerEvents;
      svg.style.pointerEvents = 'all';
      const top = document.elementFromPoint(160, 260);
      svg.style.pointerEvents = previous;
      return top === svg || svg.contains(top);
    }),
  ).toBe(true);
  await page.mouse.move(160, 260);
  await page.clock.runFor(200);
  const cursor = effects.locator('[data-pointer-field]');
  await expect(cursor).toHaveAttribute('transform', 'translate(160 260)');
  expect(Number(await cursor.getAttribute('opacity'))).toBeGreaterThan(0);
  await page.mouse.move(160, 360);
  await page.clock.runFor(80);
  await expect(cursor).toHaveAttribute('transform', 'translate(160 360)');
  await page.mouse.move(335, 360);
  await page.clock.runFor(80);
  await expect(cursor).toHaveAttribute('transform', 'translate(335 360)');
  expect(Number(await cursor.getAttribute('opacity'))).toBeGreaterThan(0);
  await page.mouse.move(160, 360);
  await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
  await page.clock.runFor(80);
  await expect(cursor).toHaveAttribute('transform', 'translate(160 360)');
  await page.screenshot({ path: testInfo.outputPath('light-over-card.png') });
  await page.mouse.click(70, 210);
  await page.clock.runFor(80);
  await expect(page.locator('.ambient-background')).toHaveAttribute('data-active-bursts', '1');
  const burst = effects.locator('[data-ambient-burst]').first();
  await expect(burst).toHaveAttribute('transform', 'translate(70 210)');
  await page.clock.fastForward(2200);
  await page.clock.runFor(80);
  await expect(page.locator('.ambient-background')).toHaveAttribute('data-active-bursts', '0');
  await page.locator('#ambient-paint-control a').click();
  await page.clock.runFor(80);
  await expect(page.locator('.ambient-background')).toHaveAttribute('data-active-bursts', '0');
  await page.mouse.move(66, 214);
  await page.mouse.down();
  await page.mouse.move(275, 237, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString().trim())).not.toBe('');
  await expect(page.locator('.ambient-background')).toHaveAttribute('data-active-bursts', '0');
  await page.getByRole('button', { name: /^Color theme:/ }).click();
  await page.getByRole('dialog', { name: 'Appearance' }).getByText('Dark', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('header').evaluate(async (header) => {
    await Promise.all(
      header.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.mouse.move(180, 300);
  await page.clock.runFor(120);
  await page.screenshot({ path: testInfo.outputPath('dark-over-card.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ambient-background')).toHaveAttribute('data-motion', 'reduced');
  await expect(cursor).toHaveAttribute('opacity', '0');
  await page.evaluate(() => document.querySelector('#ambient-paint-control')!.remove());
});
