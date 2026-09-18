import type { AgentTimelineEntry } from '@wrongstack/core/coordination';
import type { FleetEntry } from '../app-state.js';
import { theme } from '../theme.js';

export const STATUS: Record<FleetEntry['status'], { icon: string; color: string }> = {
  idle: {
    icon: '○',
    get color() {
      return theme.textMuted;
    },
  },
  running: {
    icon: '▶',
    get color() {
      return theme.warn;
    },
  },
  success: {
    icon: '✓',
    get color() {
      return theme.success;
    },
  },
  failed: {
    icon: '✗',
    get color() {
      return theme.error;
    },
  },
  timeout: {
    icon: '⏱',
    get color() {
      return theme.warn;
    },
  },
  stopped: {
    icon: '⊘',
    get color() {
      return theme.textMuted;
    },
  },
};

export const IDLE_HIDE_MS = 60_000;
export const EMPTY_AGENTS_CLOSE_DELAY_MS = 7_500;
export const TRANSCRIPT_ROWS = 10;
export const TRANSCRIPT_FETCH_LIMIT = 500;

export const TRANSCRIPT_GLYPHS: Record<AgentTimelineEntry['kind'], string> = {
  text: '💬',
  thinking: '∴',
  tool_use: '🔧',
  tool_result: '📎',
  status: '·',
  error: '❌',
  system: '·',
};
