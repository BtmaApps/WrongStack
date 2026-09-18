import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { RightSidebar } from '../src/components/sidebar.js';
import { ipcStatusColor, SidebarIpcIcons } from '../src/components/sidebar-ipc-icons.js';
import { displayWidth } from '../src/terminal-width.js';
import { theme } from '../src/theme.js';
import { glyphs } from '../src/ui-glyphs.js';

describe('sidebar IPC strip', () => {
  it('fits all seven service icons on one row at the minimum sidebar width', () => {
    const view = render(<SidebarIpcIcons connections={[]} width={20} />);
    const frame = view.lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(1);
    expect(displayWidth(frame)).toBeLessThanOrEqual(20);
    for (const icon of [
      glyphs.sessions,
      glyphs.clock,
      glyphs.index,
      glyphs.brain,
      glyphs.task,
      glyphs.mail,
      glyphs.audit,
    ]) {
      expect(frame).toContain(icon.trim());
    }
    expect(frame).not.toMatch(/IPC|Connections|ms|healthy/);
    view.unmount();
  });

  it('uses semantic theme colours and never paints an unknown or offline service healthy', () => {
    expect(ipcStatusColor('healthy')).toBe(theme.success);
    expect(ipcStatusColor('degraded')).toBe(theme.warn);
    expect(ipcStatusColor('error')).toBe(theme.error);
    for (const status of ['offline', 'unavailable', undefined] as const) {
      expect(ipcStatusColor(status)).toBe(theme.textMuted);
    }
  });

  it('keeps the existing sidebar height and focused keyboard hint', () => {
    const view = render(
      <RightSidebar
        width={32}
        maxHeight={12}
        statusIcons={<SidebarIpcIcons connections={[]} width={32} />}
      />,
    );
    expect((view.lastFrame() ?? '').split('\n')).toHaveLength(12);
    view.rerender(
      <RightSidebar
        width={32}
        maxHeight={12}
        focused
        statusIcons={<SidebarIpcIcons connections={[]} width={32} />}
      />,
    );
    expect(view.lastFrame()).toContain('Shift+Tab exits');
    expect((view.lastFrame() ?? '').split('\n')).toHaveLength(12);
    view.unmount();
  });
});
