/**
 * Which catalog entry a provider instance was built from.
 *
 * A provider is named by its config key: a second account `work` with
 * `type: "anthropic"` is the provider `work`. What it IS stays `anthropic`,
 * and a rule written against the vendor (a directory's `denyProviders:
 * ["anthropic"]`) must keep covering it. The factory records the catalog id
 * here when it differs from the instance id; nothing is added to the provider
 * object itself.
 */
const catalogIds = new WeakMap<object, string>();

export function bindProviderCatalogId(provider: { readonly id: string }, catalogId: string): void {
  if (catalogId && catalogId !== provider.id) catalogIds.set(provider, catalogId);
}

/** The instance id, then the catalog id it was built from when that differs. */
export function providerIdentities(provider: { readonly id: string }): string[] {
  const catalogId = catalogIds.get(provider);
  return catalogId ? [provider.id, catalogId] : [provider.id];
}
