import type { EngineCommand } from './engine-operations';

export interface ProfileModelPolicy extends Record<string, unknown> {
  favoriteModels: string[];
  disabledModels: string[];
  disabledProviders: string[];
}
export const emptyModelPolicy = (): ProfileModelPolicy => ({
  favoriteModels: [],
  disabledModels: [],
  disabledProviders: [],
});
export function mergeModelPolicy(
  current: ProfileModelPolicy,
  frame: Record<string, unknown>,
  requireFull = false,
): ProfileModelPolicy {
  const next = { ...current };
  for (const key of ['favoriteModels', 'disabledModels', 'disabledProviders'] as const) {
    if (!(key in frame) && !requireFull) continue;
    const value = frame[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
      throw Error(
        'The profile engine returned an invalid model policy. Refresh choices before switching.',
      );
    next[key] = [...value];
  }
  return next;
}
export async function readProfileModelPolicy(command: EngineCommand): Promise<ProfileModelPolicy> {
  return mergeModelPolicy(
    emptyModelPolicy(),
    await command('prefs.get', {}, ['prefs.updated']),
    true,
  );
}
