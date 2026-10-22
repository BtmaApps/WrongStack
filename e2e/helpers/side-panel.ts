import type { Locator, Page } from '@playwright/test';

/**
 * The WebUI side panel, scoped by ELEMENT rather than by role.
 *
 * The panel is an overlay `role="dialog"` only below 768px (`isOverlay` in
 * packages/webui/src/components/SidePanel/index.tsx) and a
 * `role="complementary"` landmark on every wider viewport. A
 * `getByRole('dialog', { name: 'Side panel' })` scope therefore matches
 * NOTHING on a desktop browser — every panel lookup times out there.
 *
 * Scoping by the element works for both, and still disambiguates the tab
 * bar's `+` button, whose accessible name is also "New session".
 */
export function sidePanel(page: Page): Locator {
  return page.locator('aside[aria-label="Side panel"]');
}

/** A button inside the WebUI side panel (not the tab bar, not a dialog). */
export function panelButton(page: Page, name: string): Locator {
  return sidePanel(page).getByRole('button', { name, exact: true });
}
