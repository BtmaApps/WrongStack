import { useLayoutEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { useHistoryViewportSync } from '../src/hooks/use-history-viewport-sync.js';
import { Box, Text, useStdout } from '../src/ink.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

function Probe({ shrinkOnMount = false }: { shrinkOnMount?: boolean }) {
  const { stdout } = useStdout();
  const { termRows } = useHistoryViewportSync({
    stdoutRows: stdout.rows,
    viewportRows: 1,
    setViewportRows: () => {},
  });
  useLayoutEffect(() => {
    if (shrinkOnMount) {
      // Reproduce a resize before passive subscriptions are installed.
      stdout.rows -= 2;
      stdout.emit('resize');
    }
  }, []);
  return (
    <Box height={termRows} flexDirection="column" justifyContent="flex-end">
      <Text>{`last-row:${termRows}`}</Text>
    </Box>
  );
}

describe('history viewport terminal size', () => {
  it('recovers a two-row shrink during mount before the resize subscription', async () => {
    const view = renderRealTty(<Probe shrinkOnMount />, { rows: 12, columns: 40 });
    try {
      await settle();
      expect(view.lines()).toHaveLength(10);
      expect(view.lines()[9]).toBe('last-row:10');
    } finally {
      view.unmount();
    }
  });

  it('follows the Ink stream on shrink and growth and ignores foreign resizes', async () => {
    const view = renderRealTty(<Probe />, { rows: 12, columns: 40 });
    try {
      await settle();
      view.resize(40, 10);
      await settle();
      expect(view.lines()).toHaveLength(10);
      expect(view.lines()[9]).toBe('last-row:10');
      process.stdout.emit('resize');
      await settle();
      expect(view.lines()).toHaveLength(10);
      view.resize(60, 16);
      await settle();
      expect(view.lines()).toHaveLength(16);
      expect(view.lines()[15]).toBe('last-row:16');
    } finally {
      view.unmount();
    }
  });
});
