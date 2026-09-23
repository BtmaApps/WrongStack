/**
 * `--ascii`: the TUI's Text/Box wrappers convert symbols before Ink measures
 * them, and bordered boxes switch to Ink's `classic` (+-|) border.
 */
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete process.env['WRONGSTACK_TUI_ICON_STYLE'];
  vi.resetModules();
});

async function renderSample(): Promise<string> {
  const { Box, Text } = await import('../src/ink.js');
  const { lastFrame, unmount } = render(
    <Box borderStyle="round" flexDirection="column">
      <Text>
        ✓ saved → {'next'} … <Text bold>🧠 şğı</Text>
      </Text>
    </Box>,
  );
  const frame = lastFrame() ?? '';
  unmount();
  return frame;
}

describe('TUI ASCII mode', () => {
  it('renders ASCII symbols and a classic border, keeping letters', async () => {
    process.env['WRONGSTACK_TUI_ICON_STYLE'] = 'ascii';
    vi.resetModules();
    const frame = await renderSample();
    expect(frame).toContain('+ saved -> next ... * şğı');
    expect(frame).toMatch(/^\+-+\+/);
    expect(frame.replace(/şğı/g, '')).not.toMatch(/[^\x00-\x7f]/);
  });

  it('leaves the normal glyphs alone when ASCII mode is off', async () => {
    vi.resetModules();
    const frame = await renderSample();
    expect(frame).toContain('✓ saved → next …');
    expect(frame).toContain('╭');
  });
});
