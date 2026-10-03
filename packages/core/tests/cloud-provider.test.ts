import { describe, expect, it } from 'vitest';
import {
  cloudFieldsForProvider,
  parseNativeCloudSettings,
  resolveNativeCloudSettings,
} from '../src/cloud-provider.js';

describe('native cloud profile settings', () => {
  it('isolates explicit settings and preserves environment fallbacks without mutation', () => {
    const env = {
      AWS_REGION: 'us-east-1',
      GOOGLE_VERTEX_PROJECT: 'env-project',
      GOOGLE_VERTEX_LOCATION: 'us-central1',
      AZURE_COGNITIVE_SERVICES_RESOURCE_NAME: 'cognitive',
    };
    expect(
      resolveNativeCloudSettings({ region: 'eu-west-1', project: 'profile-project' }, env),
    ).toMatchObject({ region: 'eu-west-1', project: 'profile-project', location: 'us-central1' });
    expect(
      resolveNativeCloudSettings(undefined, env, 'azure-cognitive-services').resourceName,
    ).toBe('cognitive');
    expect(env.AWS_REGION).toBe('us-east-1');
  });
  it.each([
    null,
    { apiKey: 'secret' },
    { region: 'a/b' },
    { project: 123 },
    { region: 'x'.repeat(129) },
  ])('rejects invalid or secret cloud fields %j', (value) => {
    expect(() => parseNativeCloudSettings(value)).toThrow();
  });
  it('supports clearing fields without introducing unsupported role/SSO options', () => {
    expect(parseNativeCloudSettings({ region: '' })).toEqual({});
    expect(cloudFieldsForProvider('amazon-bedrock')).toEqual(['region']);
    expect(cloudFieldsForProvider('google-vertex')).toEqual(['project', 'location']);
  });
});
