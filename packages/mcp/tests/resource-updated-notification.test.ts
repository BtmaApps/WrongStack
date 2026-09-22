import { describe, expect, it } from 'vitest';
import { resourceUpdatedUri } from '../src/protocol.js';

describe('resourceUpdatedUri', () => {
  it('accepts a well-formed notification payload', () => {
    expect(resourceUpdatedUri({ uri: 'file:///project/README.md' })).toBe(
      'file:///project/README.md',
    );
  });

  it('ignores a malformed payload instead of throwing', () => {
    // A notification has no reply, so a bad one is dropped, never answered.
    expect(resourceUpdatedUri(undefined)).toBeUndefined();
    expect(resourceUpdatedUri(null)).toBeUndefined();
    expect(resourceUpdatedUri([])).toBeUndefined();
    expect(resourceUpdatedUri({})).toBeUndefined();
    expect(resourceUpdatedUri({ uri: 42 })).toBeUndefined();
    expect(resourceUpdatedUri({ uri: '' })).toBeUndefined();
  });

  it('refuses a URI carrying header-injection characters or an absurd length', () => {
    expect(resourceUpdatedUri({ uri: 'file:///a\r\nX-Evil: 1' })).toBeUndefined();
    expect(resourceUpdatedUri({ uri: `file:///${'a'.repeat(5_000)}` })).toBeUndefined();
  });
});
