import { expect, it } from 'vitest';
import { featureStories } from '../src/data/content';
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
