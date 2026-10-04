import { expect, type Page, test } from '@playwright/test';

import { enableKeyboardShortcuts } from './helpers/keyboard-shortcuts';

/**
 * Focus indicator — one token, everywhere.
 *
 * Regression guard for two defects this suite now owns:
 *
 * 1. The transcript search box (`SearchOverlay`) and the command palette
 *    input both carried `outline-none`. That utility lives in Tailwind's
 *    `utilities` cascade layer, which outranks the app's `:focus-visible`
 *    rule in `@layer base` — so the class silently deleted the project's own
 *    focus affordance and the input had NO visible focus indicator at all.
 *
 * 2. The activity rail's ring read as a neutral grey instead of `--ring`.
 *    Cause: Tailwind v4's `transition-colors` includes `outline-color`, so
 *    `.ws-nav-button` (which uses it) animated the ring in from the icon's
 *    own colour. Sampling immediately showed `--muted-foreground`; only after
 *    ~250ms did it settle on the ring token.
 *
 * Both assertions are token-aware: the ring must be present AND must resolve
 * to `--ring`, so neither an `outline-none` regression nor a silent
 * `currentColor` fallback can ship again.
 */

/** rgb channels from any rgb()/rgba()/color() string. */
function channels(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1]!.split(/[,/]/).map((p) => parseFloat(p));
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r!, g!, b!];
}

/** Computed focus ring of whatever currently holds focus, plus the ring token. */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    // Resolve --ring through a probe so the expectation follows the active
    // palette/theme instead of a hardcoded rgb.
    const probe = document.createElement('span');
    probe.style.color = 'hsl(var(--ring))';
    document.body.appendChild(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    return {
      tag: el.tagName.toLowerCase(),
      width: parseFloat(cs.outlineWidth) || 0,
      style: cs.outlineStyle,
      color: cs.outlineColor,
      token,
    };
  });
}

/** Assert the focused element shows the project's focus ring. */
function expectVisibleRing(ring: Awaited<ReturnType<typeof focusRing>>) {
  expect(ring, 'nothing focused').not.toBeNull();
  expect(ring!.style, 'focus ring outline-style').not.toBe('none');
  expect(ring!.width, 'focus ring outline-width').toBeGreaterThanOrEqual(2);
  expect(ring!.color, 'focus ring must not be transparent').not.toMatch(/transparent/);

  const actual = channels(ring!.color);
  const expected = channels(ring!.token);
  expect(actual, `unparseable outline-color: ${ring!.color}`).not.toBeNull();
  expect(expected, `unparseable --ring: ${ring!.token}`).not.toBeNull();
  for (let i = 0; i < 3; i += 1) {
    expect(actual![i], `focus ring channel ${i} must be the --ring token`).toBeCloseTo(
      expected![i]!,
      0,
    );
  }
}

test.describe('focus indicator', () => {
  test.beforeEach(async ({ page }) => {
    await enableKeyboardShortcuts(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#main-content')).toBeVisible();
    // The chat textarea auto-focuses at boot; neutralise focus so the global
    // shortcuts and Radix autofocuses behave like a fresh keyboard user
    // (same boot-race guard as inspector-panel.spec.ts).
    await page.locator('body').focus();
    // Ctrl+1 is the deterministic way onto the chat view, which is where
    // SearchOverlay is mounted.
    await page.keyboard.press('Control+1');
  });

  test('transcript search box shows the ring token', async ({ page }) => {
    await page.keyboard.press('Control+Shift+F');
    const input = page.locator('input[placeholder]').first();
    await expect(input).toBeFocused({ timeout: 5_000 });
    expectVisibleRing(await focusRing(page));
  });

  test('command palette input shows the ring token', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[role="dialog"] input').first();
    await expect(input).toBeFocused({ timeout: 5_000 });
    expectVisibleRing(await focusRing(page));
  });

  test('search box and palette resolve to the same colour', async ({ page }) => {
    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('input[placeholder]').first()).toBeFocused({ timeout: 5_000 });
    const search = await focusRing(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(page.locator('[role="dialog"] input').first()).toBeFocused({ timeout: 5_000 });
    const palette = await focusRing(page);

    // One indicator, one token: these must not drift apart.
    expect(search!.color).toBe(palette!.color);
  });

  test('activity rail ring is the ring token immediately, not a fading colour', async ({
    page,
  }) => {
    // Tab onto a rail button and sample with NO settle wait — this is exactly
    // what a CI contrast/focus check does, and what caught the transition bug.
    let railRing: Awaited<ReturnType<typeof focusRing>> = null;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? '',
      );
      if (!/\(Ctrl/.test(label)) continue;
      railRing = await focusRing(page);
      break;
    }
    expect(railRing, 'never reached an activity-rail button').not.toBeNull();
    expectVisibleRing(railRing);
  });
});
