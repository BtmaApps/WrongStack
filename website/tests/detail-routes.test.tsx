import { expect, it } from 'vitest';
import { commandDetails } from '../src/data/command-details';
import { featureStories } from '../src/data/content';
import { commandFromSlug, commands } from '../src/data/content-commands';
import { featureDeepDives } from '../src/data/deep-dives';
import { pluginDetails } from '../src/data/plugin-details';
import { pluginCatalog } from '../src/data/runtime-catalog';

it('every linked plugin has detail content instead of rendering a blank main', () => {
  const missing = pluginCatalog
    .filter((plugin) => !pluginDetails[plugin.name])
    .map((plugin) => plugin.name);
  expect(missing).toEqual([]);
});

it('every linked feature has deep-dive content', () => {
  expect(
    featureStories
      .filter((feature) => !featureDeepDives[feature.slug])
      .map((feature) => feature.slug),
  ).toEqual([]);
});

it('every Proof-Driven Hunt command has catalog, usage, and detail entries', () => {
  const byName = new Map(commands.map((entry) => [entry.name, entry]));
  for (const cmd of [
    '/bughunt',
    '/sechunt',
    '/racehunt',
    '/debloat',
    '/uipolish',
    '/typehunt',
    '/testgap',
  ]) {
    const entry = byName.get(cmd);
    expect(entry, `commands missing ${cmd}`).toBeDefined();
    expect(entry?.category).toBe('Workflow');
    expect(entry?.origin).toBe('Built-in plugin');
    expect(entry?.usage?.length ?? 0, `usage missing for ${cmd}`).toBeGreaterThan(0);
    expect(commandFromSlug(cmd.slice(1))?.name).toBe(cmd);
    expect(commandDetails[cmd], `commandDetails missing ${cmd}`).toBeDefined();
  }
});
