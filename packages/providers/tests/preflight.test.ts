import { describe, expect, it } from 'vitest';
import { inspectProviderPreflight } from '../src/preflight.js';

describe('provider configuration preflight', () => {
  it('reports a partial AWS credential pair without exposing its value', () => {
    const result = inspectProviderPreflight(
      'amazon-bedrock',
      { type: 'amazon-bedrock' },
      { AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'fixture-private-key' },
    );
    expect(result.requiresConfiguration).toBe(true);
    expect(JSON.stringify(result)).not.toContain('fixture-private-key');
  });
  it('keeps ambient AWS credential chains unverified rather than declaring them missing', () => {
    const result = inspectProviderPreflight(
      'work',
      { type: 'amazon-bedrock' },
      { AWS_REGION: 'us-east-1', AWS_PROFILE: 'team' },
    );
    expect(result.checks.find((check) => check.name === 'AWS credential chain')?.status).toBe(
      'unverified',
    );
    expect(result.requiresConfiguration).toBe(false);
  });
  it('distinguishes Vertex project and location setup from Google ADC', () => {
    const result = inspectProviderPreflight(
      'vertex',
      { type: 'google-vertex' },
      {
        GOOGLE_VERTEX_PROJECT: 'project',
        GOOGLE_VERTEX_LOCATION: 'global',
        GOOGLE_APPLICATION_CREDENTIALS: '/credential.json',
      },
    );
    expect(result.requiresConfiguration).toBe(false);
    expect(result.checks.some((check) => check.status === 'unverified')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('/credential.json');
  });
  it('reports an Azure endpoint without an API key as incomplete setup', () => {
    expect(
      inspectProviderPreflight(
        'azure',
        { type: 'azure', baseUrl: 'https://resource.example/openai' },
        {},
      ).requiresConfiguration,
    ).toBe(true);
  });
  it('honors provider aliases and saved multi-key configuration', () => {
    const result = inspectProviderPreflight(
      'team-azure',
      {
        type: 'azure',
        baseUrl: 'https://resource.example/openai',
        activeKey: 'work',
        apiKeys: [{ label: 'work', apiKey: 'fixture-private-key', createdAt: '2026-10-02' }],
      },
      {},
    );
    expect(result.requiresConfiguration).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fixture-private-key');
  });
});
