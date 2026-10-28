import { describe, expect, it } from 'vitest';
import {
  fixtureKey,
  fixtureModel,
  nativeComposerCalls,
  startLocalProvider,
} from './local-provider.mjs';

describe('native composer provider traffic ownership', () => {
  it('counts real tagged composer requests independently of unrelated streaming project work', async () => {
    const provider = await startLocalProvider();
    const send = async (content: string) => {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${fixtureKey}` },
        body: JSON.stringify({
          model: fixtureModel,
          stream: true,
          messages: [{ role: 'user', content }],
        }),
      });
      expect(response.status).toBe(200);
      await response.text();
    };
    try {
      await send('[native-composer-attachment-direct] Verify this image.');
      expect(nativeComposerCalls(provider.calls)).toHaveLength(1);
      await send('Execute the independent saved Kanban task for this project.');
      expect(provider.calls).toHaveLength(2);
      expect(nativeComposerCalls(provider.calls)).toHaveLength(1);
      await send('[native-composer-attachment-queued] Execute the queued image request.');
      expect(nativeComposerCalls(provider.calls)).toHaveLength(2);
    } finally {
      await provider.close();
    }
  });
});
