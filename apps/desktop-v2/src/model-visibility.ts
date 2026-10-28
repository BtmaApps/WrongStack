import { record } from './engine-values';

export const modelReferences = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export const providerDisabled = (refs: unknown, provider: string): boolean =>
  modelReferences(refs).some((id) => id.trim().toLowerCase() === provider.trim().toLowerCase());
export function providerVisibilityPatch(
  draft: Record<string, unknown>,
  provider: string,
  disabled: boolean,
) {
  const current = modelReferences(draft['disabledProviders']);
  return {
    disabledProviders: disabled
      ? providerDisabled(current, provider)
        ? current
        : [...current, provider]
      : current.filter((id) => id.trim().toLowerCase() !== provider.trim().toLowerCase()),
  };
}
/** The engine's model-list grammar, kept browser-only and checked against its matcher. */
export function modelRefMatches(raw: string, provider: string, model: string): boolean {
  const ref = raw.trim().toLowerCase(),
    p = provider.trim().toLowerCase(),
    m = model.trim().toLowerCase();
  if (!ref) return false;
  if (ref === m || ref === `${p}/${m}`) return true;
  const spaced = /^([^\s/]+)\s+([^\s/].*)$/u.exec(ref);
  if (spaced) return spaced[1] === p && spaced[2]!.trim() === m;
  const slash = ref.indexOf('/');
  if (slash !== -1) return ref.slice(0, slash).trim() === p && ref.slice(slash + 1).trim() === m;
  return false;
}
export const modelListed = (refs: unknown, provider: string, model: string) =>
  modelReferences(refs).some((ref) => modelRefMatches(ref, provider, model));
export function selectableCatalogModels<T extends { id: string }>(
  models: readonly T[],
  provider: string,
  prefs: Record<string, unknown>,
): T[] {
  if (providerDisabled(prefs['disabledProviders'], provider)) return [];
  return models
    .filter((model) => !modelListed(prefs['disabledModels'], provider, model.id))
    .sort(
      (a, b) =>
        Number(modelListed(prefs['favoriteModels'], provider, b.id)) -
        Number(modelListed(prefs['favoriteModels'], provider, a.id)),
    );
}
export function disableModelPatch(
  draft: Record<string, unknown>,
  provider: string,
  model: string,
  defaultProvider: string,
) {
  // Bare routing references resolve against the active default provider.
  const matchesRoute = (ref: string) => {
    const clean = ref.trim().toLowerCase();
    if (clean === model.trim().toLowerCase())
      return provider.trim().toLowerCase() === defaultProvider.trim().toLowerCase();
    return modelRefMatches(ref, provider, model);
  };
  const keep = (value: unknown) => modelReferences(value).filter((ref) => !matchesRoute(ref));
  const disabledModels = modelReferences(draft['disabledModels']);
  return {
    disabledModels: modelListed(disabledModels, provider, model)
      ? disabledModels
      : [...disabledModels, `${provider}/${model}`],
    favoriteModels: keep(draft['favoriteModels']),
    fallbackModels: keep(draft['fallbackModels']),
    fallbackProfiles: Object.fromEntries(
      Object.entries(record(draft['fallbackProfiles'])).map(([name, refs]) => [name, keep(refs)]),
    ),
  };
}
