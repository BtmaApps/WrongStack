import { describe, expect, it } from 'vitest';
import { AppMainColumn } from '../src/app-main-column.js';
import { RightSidebar } from '../src/components/sidebar.js';
import { WrongProxyPanelSidebar } from '../src/components/sidebar-panel-wrong-proxy.js';
import { Box, Text } from '../src/ink.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const rows = 12;
const columns = 100;
function Frame({ bottomRows }: { bottomRows: number }) {
  return (
    <Box flexDirection="column" height={rows} overflowY="hidden" justifyContent="flex-end">
      <Box flexDirection="row" width={columns} flexShrink={0} overflowX="hidden">
        <AppMainColumn width={72} rows={rows}>
          <Box height={rows - 3} flexDirection="column" flexShrink={0}>
            {Array.from({ length: rows - 3 }, (_, i) => (
              <Text key={i}>{`history-${i}`}</Text>
            ))}
          </Box>
          <Box flexDirection="column" flexShrink={0}>
            {Array.from({ length: bottomRows }, (_, i) => (
              <Text key={i}>{`bottom-${i}`}</Text>
            ))}
          </Box>
        </AppMainColumn>
        <RightSidebar width={28} maxHeight={rows}>
          <WrongProxyPanelSidebar width={24} proxy={null} />
        </RightSidebar>
      </Box>
    </Box>
  );
}

describe('sidebar top anchoring', () => {
  it('keeps WrongProxy title and top chrome when the composer grows two rows', async () => {
    const view = renderRealTty(<Frame bottomRows={3} />, { rows, columns });
    try {
      await settle();
      const sidebarTop = view
        .lines()
        .slice(0, 2)
        .map((line) => line.slice(72));
      expect(sidebarTop.join('\n')).toContain('WRONGPROXY');
      view.rerender(<Frame bottomRows={5} />);
      await settle();
      expect(
        view
          .lines()
          .slice(0, 2)
          .map((line) => line.slice(72)),
      ).toEqual(sidebarTop);
      expect(view.lastFrame()).toContain('bottom-4');
      expect(view.lines()).toHaveLength(rows);
      view.rerender(<Frame bottomRows={3} />);
      await settle();
      expect(
        view
          .lines()
          .slice(0, 2)
          .map((line) => line.slice(72)),
      ).toEqual(sidebarTop);
    } finally {
      view.unmount();
    }
  });
});
