import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.js';
import { Banner, WORDMARK_LINES } from '../src/components/history/banner.js';
import {
  BANNER_FORMATION_DURATION_MS,
  pixelFormationLine,
} from '../src/components/history/banner-formation.js';
import {
  type HistoryScrollController,
  ScrollableHistory,
} from '../src/components/scrollable-history.js';
import { setMotionStatic } from '../src/motion.js';
import { createAppJourney } from './helpers/app-journey-harness.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const entry = {
  id: 0,
  kind: 'banner' as const,
  version: '1.2.3',
  provider: 'openai',
  model: 'gpt-test',
  cwd: '/workspace/wrongstack',
};

function pixels(line: string): boolean[] {
  return [...line].flatMap((cell) => [cell === '█' || cell === '▀', cell === '█' || cell === '▄']);
}

afterEach(() => {
  vi.restoreAllMocks();
  setMotionStatic(false);
});

describe('banner pixel formation', () => {
  it('replays when the visible banner is clicked through the app pointer route', async () => {
    const journey = createAppJourney();
    const view = renderRealTty(<App {...journey.props} banner />, { columns: 100, rows: 45 });
    try {
      await settle(BANNER_FORMATION_DURATION_MS + 100);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      const row = view.lines().findIndex((line) => line.includes('BUILT ON THE WRONG STACK'));
      expect(row).toBeGreaterThanOrEqual(0);
      view.stdin.write(`\x1b[<0;10;${row + 1}M`);
      view.stdin.write(`\x1b[<0;10;${row + 1}m`);
      await settle(80);
      expect(view.lastFrame()).not.toContain(WORDMARK_LINES[0]);
      expect(view.lastFrame()).toContain('BUILT ON THE WRONG STACK');
      await settle(BANNER_FORMATION_DURATION_MS);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
    } finally {
      view.unmount();
    }
  });

  it('replays after /clear resets history through the app command path', async () => {
    const journey = createAppJourney();
    journey.props.slashRegistry.register({
      name: 'clear',
      description: 'Clear session',
      run: async () => ({ metadata: { cleared: true } }),
    });
    const onClearHistory = vi.fn((dispatch: (action: { type: 'clearHistory' }) => void) => {
      dispatch({ type: 'clearHistory' });
    });
    const view = renderRealTty(<App {...journey.props} banner onClearHistory={onClearHistory} />, {
      columns: 100,
      rows: 45,
    });
    try {
      await settle(BANNER_FORMATION_DURATION_MS + 100);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      view.stdin.write('/clear');
      await settle();
      view.stdin.write('\r');
      await settle(80);
      expect(onClearHistory).toHaveBeenCalledOnce();
      expect(view.lastFrame()).not.toContain(WORDMARK_LINES[0]);
      expect(view.lastFrame()).toContain('BUILT ON THE WRONG STACK');
      await settle(BANNER_FORMATION_DURATION_MS);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
    } finally {
      view.unmount();
    }
  });

  it('hits only the visible banner and rejects transcript, slack, and scrollbar cells', async () => {
    const controllerRef = { current: null as HistoryScrollController | null };
    const onBannerReplay = vi.fn();
    const view = renderRealTty(
      <ScrollableHistory
        entries={[entry, { id: 1, kind: 'info', text: 'ordinary transcript' }]}
        toolStream={null}
        viewportRows={30}
        controllerRef={controllerRef}
        onBannerReplay={onBannerReplay}
      />,
      { columns: 80, rows: 40 },
    );
    try {
      await settle();
      const row = view.lines().findIndex((line) => line.includes('BUILT ON THE WRONG STACK'));
      const transcriptRow = view.lines().findIndex((line) => line.includes('ordinary transcript'));
      expect(controllerRef.current?.replayBannerAt?.(row, 10)).toBe(true);
      expect(onBannerReplay).toHaveBeenCalledOnce();
      for (const [missRow, missColumn] of [
        [transcriptRow, 10],
        [0, 10],
        [row, 79],
        [row, -1],
        [-1, 10],
        [30, 10],
      ]) {
        expect(controllerRef.current?.replayBannerAt?.(missRow ?? -1, missColumn ?? -1)).toBe(
          false,
        );
      }
      expect(onBannerReplay).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });

  it('plays at app startup while the composer continues accepting input', async () => {
    const journey = createAppJourney();
    const view = renderRealTty(<App {...journey.props} banner />, { columns: 100, rows: 45 });
    try {
      await settle(80);
      expect(view.lastFrame()).toContain('BUILT ON THE WRONG STACK');
      expect(view.lastFrame()).not.toContain(WORDMARK_LINES[0]);
      view.stdin.write('pixel-animation-input');
      await settle(80);
      expect(view.lastFrame()).toContain('pixel-animation-input');
      await settle(BANNER_FORMATION_DURATION_MS);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      expect(view.lastFrame()).toContain('pixel-animation-input');
    } finally {
      view.unmount();
    }
  });

  it('adds only original bitmap pixels, monotonically, until the exact wordmark is restored', () => {
    for (const [row, line] of WORDMARK_LINES.entries()) {
      let previous = pixels(' '.repeat(line.length));
      const original = pixels(line);
      expect(pixelFormationLine(line, row, 0)).toBe(' '.repeat(line.length));
      for (const progress of [0.1, 0.25, 0.5, 0.75, 1]) {
        const frame = pixelFormationLine(line, row, progress);
        expect(frame).toHaveLength(line.length);
        const current = pixels(frame);
        for (let index = 0; index < current.length; index++) {
          if (previous[index]) expect(current[index]).toBe(true);
          if (current[index]) expect(original[index]).toBe(true);
        }
        previous = current;
      }
      expect(pixelFormationLine(line, row, 1)).toBe(line);
    }
    const halfway = WORDMARK_LINES.map((line, row) => pixelFormationLine(line, row, 0.5));
    expect(halfway.join('').trim()).not.toBe('');
    expect(halfway).not.toEqual(WORDMARK_LINES);
    expect(halfway.join('')).toMatch(/[▀▄]/u);
  });

  it('keeps layout stable, completes in 1.2 seconds, and stops painting while idle', async () => {
    const startedAt = 10_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const view = renderRealTty(
      <Banner entry={entry} termWidth={80} termHeight={40} animationStartedAt={startedAt} />,
      { columns: 80, rows: 40 },
    );
    try {
      await settle();
      const initial = view.lastFrame();
      expect(initial).not.toContain(WORDMARK_LINES[0]);
      expect(initial).not.toContain('██');
      expect(initial).toContain('openai › gpt-test');
      clock.mockReturnValue(startedAt + 650);
      await settle(90);
      const middle = view.lastFrame();
      expect(middle).not.toBe(initial);
      expect(middle).not.toContain(WORDMARK_LINES[0]);
      expect(middle.split('\n')).toHaveLength(initial.split('\n').length);
      clock.mockReturnValue(startedAt + BANNER_FORMATION_DURATION_MS);
      await settle(90);
      const completed = view.lastFrame();
      expect(completed).toContain(WORDMARK_LINES[0]);
      expect(completed.split('\n')).toHaveLength(initial.split('\n').length);
      const staticView = renderRealTty(<Banner entry={entry} termWidth={80} termHeight={40} />, {
        columns: 80,
        rows: 40,
      });
      try {
        await settle();
        expect(completed).toBe(staticView.lastFrame());
      } finally {
        staticView.unmount();
      }
      const frameCount = view.stdout.frames.length;
      await settle(180);
      expect(view.stdout.frames).toHaveLength(frameCount);
    } finally {
      view.unmount();
    }
  });

  it('keeps the completed wordmark after managed history is remounted', async () => {
    const startedAt = 10_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const tree = (key: number) => (
      <ScrollableHistory
        key={key}
        entries={[entry]}
        toolStream={null}
        viewportRows={30}
        bannerAnimationStartedAt={startedAt}
      />
    );
    const view = renderRealTty(tree(0), { columns: 80, rows: 40 });
    try {
      await settle();
      expect(view.lastFrame()).not.toContain(WORDMARK_LINES[0]);
      clock.mockReturnValue(startedAt + BANNER_FORMATION_DURATION_MS);
      await settle(90);
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      view.rerender(tree(1));
      await settle();
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
    } finally {
      view.unmount();
    }
  });

  it('renders the final frame immediately when motion is static', async () => {
    setMotionStatic(true);
    const view = renderRealTty(
      <Banner entry={entry} termWidth={80} animationStartedAt={Date.now()} />,
      { columns: 80, rows: 40 },
    );
    try {
      await settle();
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      const frameCount = view.stdout.frames.length;
      await settle(100);
      expect(view.stdout.frames).toHaveLength(frameCount);
    } finally {
      view.unmount();
    }
  });

  it('completes immediately when reduced motion is enabled during formation', async () => {
    const view = renderRealTty(
      <Banner entry={entry} termWidth={80} animationStartedAt={Date.now()} />,
      { columns: 80, rows: 40 },
    );
    try {
      await settle();
      setMotionStatic(true);
      await settle();
      expect(view.lastFrame()).toContain(WORDMARK_LINES[0]);
      const frameCount = view.stdout.frames.length;
      await settle(100);
      expect(view.stdout.frames).toHaveLength(frameCount);
    } finally {
      view.unmount();
    }
  });
});
