import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const sent: Array<{ type: string; payload: { filePath: string } }> = [];
const handlers = new Set<(msg: unknown) => void>();

// The card asks the server for each file; answer like the server does.
vi.mock('../../src/lib/ws-client', () => ({
  getWSClient: () => ({
    withSession: (p: object) => p,
    on: (_type: string, fn: (msg: unknown) => void) => {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },
    send: (msg: { type: string; payload: { filePath: string } }) => {
      sent.push(msg);
      const { filePath } = msg.payload;
      queueMicrotask(() => {
        const reply = {
          type: 'files.image',
          payload: filePath.endsWith('big.png')
            ? { filePath, tooLarge: true }
            : { filePath, dataUrl: `data:image/png;base64,${btoa(filePath)}`, bytes: 2048 },
        };
        for (const fn of [...handlers]) fn(reply);
      });
      return true;
    },
  }),
}));

const { ToolLedgerCard } = await import('../../src/components/MessageBubble/ToolLedgerCard');

function card(toolName: string, toolResult: string, isError = false) {
  return render(
    <ToolLedgerCard
      message={
        {
          id: `m-${toolName}-${sent.length}`,
          role: 'tool',
          content: '',
          toolName,
          toolInput: { prompt: 'a cat', path: 'art/cat.png' },
          toolResult,
          isError,
          timestamp: 0,
        } as never
      }
    />,
  );
}

describe('image_generate tool card', () => {
  it('shows the saved pictures without opening the card', async () => {
    card(
      'image_generate',
      JSON.stringify({
        provider: 'openai',
        model: 'gpt-image-1',
        files: [
          { path: 'art/cat.png', bytes: 2048, mediaType: 'image/png' },
          { path: 'art/big.png', bytes: 9e6, mediaType: 'image/png' },
        ],
      }),
    );
    const img = (await screen.findByAltText('art/cat.png')) as HTMLImageElement;
    expect(img.src).toBe(`data:image/png;base64,${btoa('art/cat.png')}`);
    expect(screen.getByText(/art\/cat\.png · 2\.0 KiB/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Too large to preview')).toBeTruthy());
    expect(sent.map((m) => m.payload.filePath)).toEqual(['art/cat.png', 'art/big.png']);
  });

  it('shows nothing extra for a failed call or another tool', () => {
    const before = sent.length;
    card('image_generate', 'image_generate: no usable image provider', true);
    card('write', JSON.stringify({ files: [{ path: 'x.png' }] }));
    card('image_generate', 'not the JSON the tool returns');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(sent).toHaveLength(before);
  });
});
