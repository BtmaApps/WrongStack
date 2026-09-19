/**
 * Tests for src/lib/sdd-theme.ts — SDD design system constants and formatters.
 * Pure functions and data with no external dependencies.
 */

import { describe, expect, it } from 'vitest';
import {
  statusStyle,
  priorityStyle,
  agentInitials,
  fmtDuration,
  fmtAgo,
  SDD_STATUS,
  SDD_PRIORITY,
  SDD_RUN_STATUS,
  SDD_AGENT_COLORS,
  SDD_FEED_KIND,
} from '../../src/lib/sdd-theme';

describe('SDD_STATUS', () => {
  it('has all 8 status entries', () => {
    expect(Object.keys(SDD_STATUS)).toHaveLength(8);
  });

  it('each entry has the required fields', () => {
    for (const style of Object.values(SDD_STATUS)) {
      expect(style).toHaveProperty('labelKey');
      expect(style).toHaveProperty('icon');
      expect(style).toHaveProperty('text');
      expect(style).toHaveProperty('ring');
      expect(style).toHaveProperty('dot');
      expect(style).toHaveProperty('hex');
      expect(typeof style.labelKey).toBe('string');
      expect(['function', 'object']).toContain(typeof style.icon); // Lucide component
      expect(typeof style.text).toBe('string');
      expect(typeof style.ring).toBe('string');
      expect(typeof style.dot).toBe('string');
      expect(typeof style.hex).toBe('string');
    }
  });

  it('in_progress has spin=true', () => {
    expect(SDD_STATUS.in_progress.spin).toBe(true);
  });
});

describe('statusStyle', () => {
  it('returns pending style for pending status', () => {
    const s = statusStyle('pending');
    expect(s).toBe(SDD_STATUS.pending);
  });

  it('returns completed style for completed status', () => {
    const s = statusStyle('completed');
    expect(s).toBe(SDD_STATUS.completed);
  });

  it('returns pending fallback for unknown status', () => {
    const s = statusStyle('unknown_status');
    expect(s).toBe(SDD_STATUS.pending);
  });

  it('returns pending fallback for empty string', () => {
    const s = statusStyle('');
    expect(s).toBe(SDD_STATUS.pending);
  });
});

describe('SDD_PRIORITY', () => {
  it('has all 4 priority entries', () => {
    expect(Object.keys(SDD_PRIORITY)).toHaveLength(4);
  });

  it('critical has destructive text', () => {
    expect(SDD_PRIORITY.critical.text).toContain('destructive');
  });
});

describe('priorityStyle', () => {
  it('returns critical style for critical priority', () => {
    expect(priorityStyle('critical')).toBe(SDD_PRIORITY.critical);
  });

  it('returns high style for high priority', () => {
    expect(priorityStyle('high')).toBe(SDD_PRIORITY.high);
  });

  it('returns medium fallback for unknown priority', () => {
    expect(priorityStyle('unknown')).toBe(SDD_PRIORITY.medium);
  });
});

describe('SDD_RUN_STATUS', () => {
  it('has all 7 run status entries', () => {
    expect(Object.keys(SDD_RUN_STATUS)).toHaveLength(7);
  });
});

describe('SDD_AGENT_COLORS', () => {
  it('has 7 color entries', () => {
    expect(SDD_AGENT_COLORS).toHaveLength(7);
  });

  it('every color is a bg-* class', () => {
    for (const c of SDD_AGENT_COLORS) {
      expect(c).toMatch(/^bg-/);
    }
  });
});

describe('SDD_FEED_KIND', () => {
  it('has all feed kind entries', () => {
    expect(Object.keys(SDD_FEED_KIND)).toHaveLength(10);
  });

  it('each entry has icon and color', () => {
    for (const entry of Object.values(SDD_FEED_KIND)) {
      expect(entry).toHaveProperty('icon');
      expect(entry).toHaveProperty('color');
      expect(['function', 'object']).toContain(typeof entry.icon);
      expect(typeof entry.color).toBe('string');
    }
  });
});

describe('agentInitials', () => {
  it('returns two-letter initials for a full name', () => {
    expect(agentInitials('John Doe')).toBe('JD');
  });

  it('returns single letter for a one-word name', () => {
    expect(agentInitials('Alice')).toBe('A');
  });

  it('returns two letters for three-word name', () => {
    expect(agentInitials('John Michael Doe')).toBe('JM');
  });

  it('returns dot for empty string', () => {
    expect(agentInitials('')).toBe('\u00B7');
  });

  it('returns dot for whitespace-only string', () => {
    expect(agentInitials('   ')).toBe('\u00B7');
  });

  it('handles leading/trailing whitespace', () => {
    expect(agentInitials('  John  Doe  ')).toBe('JD');
  });

  it('uppercases initials', () => {
    expect(agentInitials('john doe')).toBe('JD');
  });
});

describe('fmtDuration', () => {
  it('returns seconds for < 60s', () => {
    expect(fmtDuration(5000)).toBe('5s');
  });

  it('returns 0s for 0ms', () => {
    expect(fmtDuration(0)).toBe('0s');
  });

  it('clamps negative to 0', () => {
    expect(fmtDuration(-100)).toBe('0s');
  });

  it('returns minutes for exact minutes', () => {
    expect(fmtDuration(120_000)).toBe('2m');
  });

  it('returns minutes + seconds for mixed duration', () => {
    expect(fmtDuration(125_000)).toBe('2m 5s');
  });

  it('returns hours for >= 1h', () => {
    expect(fmtDuration(3600_000)).toBe('1h 0m');
  });

  it('returns hours + minutes for mixed hour duration', () => {
    expect(fmtDuration(4500_000)).toBe('1h 15m');
  });

  it('handles large durations', () => {
    expect(fmtDuration(7200_000)).toBe('2h 0m');
  });
});

describe('fmtAgo', () => {
  it('returns seconds for < 60s ago', () => {
    expect(fmtAgo(1000, 6000)).toBe('5s');
  });

  it('returns 0s for now', () => {
    const now = Date.now();
    expect(fmtAgo(now, now)).toBe('0s');
  });

  it('returns minutes for < 60m ago', () => {
    expect(fmtAgo(0, 120_000)).toBe('2m');
  });

  it('returns hours for >= 1h ago', () => {
    expect(fmtAgo(0, 7200_000)).toBe('2h');
  });

  it('clamps negative time difference to 0', () => {
    expect(fmtAgo(5000, 1000)).toBe('0s');
  });
});
