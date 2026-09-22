import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { MonitorShell, MonitorViewportProvider } from '../src/components/monitor-shell.js';
import { Box, Text } from '../src/ink.js';

async function header(columns: number, right?: string): Promise<string> {
  const view = render(
    <MonitorViewportProvider value={{ columns, rows: 12 }}>
      <Box width={columns}>
        <MonitorShell
          accent="cyan"
          icon="▣"
          title="PROJECTS"
          kicker="workspace switcher"
          right={right ? <Text>{right}</Text> : undefined}
        >
          <Text>body</Text>
        </MonitorShell>
      </Box>
    </MonitorViewportProvider>,
  );
  // The fit is decided from measured widths in a passive effect.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const line = (view.lastFrame() ?? '').split('\n')[1] ?? '';
  view.unmount();
  return line;
}

describe('MonitorShell kicker', () => {
  it('shows the kicker when title, kicker and right content fit', async () => {
    const line = await header(100, '24 projects');
    expect(line).toContain('PROJECTS / workspace switcher');
    expect(line).toContain('24 projects');
  });

  it('drops the kicker, never the title or right content, when space runs out', async () => {
    const line = await header(66, 'a rather long right-hand summary');
    expect(line).toContain('PROJECTS');
    expect(line).not.toContain('workspace');
    expect(line).toContain('a rather long right-hand summary');
  });

  it('keeps the kicker without right content when it alone fits', async () => {
    const line = await header(40);
    expect(line).toContain('PROJECTS / workspace switcher');
  });
});
