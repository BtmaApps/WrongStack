import { changedSettings } from './settings-fields';

export type SettingsValues = Record<string, unknown>;
const object = (value: unknown): value is SettingsValues =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function sameSetting(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => sameSetting(value, b[i]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a).filter((key) => a[key] !== undefined);
    return (
      keys.length === Object.keys(b).filter((key) => b[key] !== undefined).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameSetting(a[key], b[key]))
    );
  }
  return false;
}
/** Three-way read-before-write merge. Arrays are ordered, indivisible settings. */
export function prepareSettingsPatch(
  base: SettingsValues,
  draft: SettingsValues,
  current: SettingsValues,
): SettingsValues {
  const merge = (before: unknown, edited: unknown, live: unknown, path: string): unknown => {
    if (sameSetting(before, edited)) return live;
    if (sameSetting(before, live) || sameSetting(edited, live)) return edited;
    if (object(edited) && object(live) && (before === undefined || object(before))) {
      const original = object(before) ? before : {};
      return Object.fromEntries(
        [...new Set([...Object.keys(original), ...Object.keys(edited), ...Object.keys(live)])]
          .map((key) => [key, merge(original[key], edited[key], live[key], `${path} → ${key}`)])
          .filter(([, value]) => value !== undefined),
      );
    }
    throw new Error(
      `“${path}” changed elsewhere while you were editing. Reload saved values before applying this change.`,
    );
  };
  return Object.fromEntries(
    Object.keys(changedSettings(base, draft)).map((key) => [
      key,
      merge(base[key], draft[key], current[key], key),
    ]),
  );
}
export function validSettingsName(name: string): boolean {
  return !!name.trim() && !['__proto__', 'prototype', 'constructor'].includes(name.trim());
}
export function withoutSetting<T>(values: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(values).filter(([name]) => name !== key));
}
export function removeModelTier(tiers: SettingsValues, id: string): SettingsValues {
  const levels = object(tiers['levels']) ? tiers['levels'] : {};
  const routing = object(tiers['routing']) ? tiers['routing'] : {};
  const leader = object(tiers['leader']) ? tiers['leader'] : {};
  return {
    ...tiers,
    levels: withoutSetting(levels, id),
    routing: Object.fromEntries(Object.entries(routing).filter(([, tier]) => tier !== id)),
    ...(tiers['default'] === id ? { default: undefined } : {}),
    ...(leader['maxTier'] === id ? { leader: withoutSetting(leader, 'maxTier') } : {}),
  };
}
