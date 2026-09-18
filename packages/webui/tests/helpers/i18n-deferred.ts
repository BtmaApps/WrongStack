import { i18n } from '@/i18n';

/**
 * Wait for the lazily loaded `activity` and `settings` namespaces.
 *
 * `src/i18n` bundles only the small namespaces inline and fetches these two as
 * async chunks right after init. A component test that renders on the first
 * tick races that fetch: it sees raw keys (`activity:toolGroup.toolCalls`)
 * instead of English whenever the chunk has not resolved yet — which on a
 * loaded CI runner is most of the time. Await this in `beforeAll` before
 * asserting on text from those namespaces.
 */
export async function loadDeferredI18nNamespaces(): Promise<void> {
  await i18n.loadNamespaces(['activity', 'settings']);
}
