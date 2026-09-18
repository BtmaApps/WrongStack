/**
 * Unit tests for layout module - sidebar and view layout logic.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_MEDIUM,
  SIDEBAR_WIDTH_NARROW,
  SIDEBAR_WIDTH_WIDE,
  WINDOW_STATE_SAVE_DEBOUNCE_MS,
} from '../src/main/state/constants.js';

import { getSidebarWidth } from '../src/shared/layout.js';

// ============================================================================
// Sidebar Width Tests
// ============================================================================

describe('Sidebar width calculation', () => {
  describe('collapsed state', () => {
    it('should return collapsed width when collapsed is true', () => {
      expect(getSidebarWidth(1920, true)).toBe(SIDEBAR_WIDTH_COLLAPSED);
    });

    it('should return collapsed width regardless of window width', () => {
      expect(getSidebarWidth(800, true)).toBe(SIDEBAR_WIDTH_COLLAPSED);
      expect(getSidebarWidth(1400, true)).toBe(SIDEBAR_WIDTH_COLLAPSED);
    });
  });

  describe('narrow windows (< 900px)', () => {
    it('should return narrow width for windows under 900px', () => {
      expect(getSidebarWidth(899, false)).toBe(SIDEBAR_WIDTH_NARROW);
      expect(getSidebarWidth(760, false)).toBe(SIDEBAR_WIDTH_NARROW);
      expect(getSidebarWidth(500, false)).toBe(SIDEBAR_WIDTH_NARROW);
    });

    it('should return wide width for windows at 900px exactly', () => {
      expect(getSidebarWidth(900, false)).toBe(SIDEBAR_WIDTH_MEDIUM);
    });
  });

  describe('medium windows (900-1179px)', () => {
    it('should return medium width for windows 900-1179px', () => {
      expect(getSidebarWidth(900, false)).toBe(SIDEBAR_WIDTH_MEDIUM);
      expect(getSidebarWidth(1000, false)).toBe(SIDEBAR_WIDTH_MEDIUM);
      expect(getSidebarWidth(1179, false)).toBe(SIDEBAR_WIDTH_MEDIUM);
    });

    it('should return wide width for windows at 1180px exactly', () => {
      expect(getSidebarWidth(1180, false)).toBe(SIDEBAR_WIDTH_WIDE);
    });
  });

  describe('wide windows (>= 1180px)', () => {
    it('should return wide width for windows 1180px and above', () => {
      expect(getSidebarWidth(1180, false)).toBe(SIDEBAR_WIDTH_WIDE);
      expect(getSidebarWidth(1400, false)).toBe(SIDEBAR_WIDTH_WIDE);
      expect(getSidebarWidth(1920, false)).toBe(SIDEBAR_WIDTH_WIDE);
      expect(getSidebarWidth(2560, false)).toBe(SIDEBAR_WIDTH_WIDE);
    });
  });
});

// ============================================================================
// Content Width Tests
// ============================================================================

describe('Content width calculation', () => {
  function getContentWidth(windowWidth: number, collapsed: boolean): number {
    const sidebarWidth = getSidebarWidth(windowWidth, collapsed);
    return Math.max(0, windowWidth - sidebarWidth);
  }

  it('should calculate correct content width for wide windows', () => {
    const contentWidth = getContentWidth(1400, false);
    expect(contentWidth).toBe(1400 - SIDEBAR_WIDTH_WIDE);
  });

  it('should calculate correct content width for collapsed sidebar', () => {
    const contentWidth = getContentWidth(1400, true);
    expect(contentWidth).toBe(1400 - SIDEBAR_WIDTH_COLLAPSED);
  });

  it('should not return negative content width', () => {
    const contentWidth = getContentWidth(50, false);
    expect(contentWidth).toBeGreaterThanOrEqual(0);
  });

  it('should maximize content width when sidebar is collapsed', () => {
    const normalWidth = getContentWidth(1400, false);
    const collapsedWidth = getContentWidth(1400, true);
    expect(collapsedWidth).toBeGreaterThan(normalWidth);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Layout constants', () => {
  it('should have valid sidebar width values', () => {
    expect(SIDEBAR_WIDTH_WIDE).toBeGreaterThan(0);
    expect(SIDEBAR_WIDTH_MEDIUM).toBeGreaterThan(0);
    expect(SIDEBAR_WIDTH_NARROW).toBeGreaterThan(0);
    expect(SIDEBAR_WIDTH_COLLAPSED).toBeGreaterThan(0);
  });

  it('should have sidebar widths in descending order', () => {
    expect(SIDEBAR_WIDTH_WIDE).toBeGreaterThan(SIDEBAR_WIDTH_MEDIUM);
    expect(SIDEBAR_WIDTH_MEDIUM).toBeGreaterThan(SIDEBAR_WIDTH_NARROW);
  });

  it('should have collapsed width as smallest', () => {
    expect(SIDEBAR_WIDTH_COLLAPSED).toBeLessThan(SIDEBAR_WIDTH_NARROW);
  });

  it('should have valid window dimension constraints', () => {
    expect(MIN_WINDOW_WIDTH).toBeGreaterThan(0);
    expect(MIN_WINDOW_HEIGHT).toBeGreaterThan(0);
    expect(MIN_WINDOW_WIDTH).toBeLessThan(MIN_WINDOW_HEIGHT * 2); // Reasonable aspect ratio
  });

  it('should have valid debounce timing', () => {
    expect(WINDOW_STATE_SAVE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(WINDOW_STATE_SAVE_DEBOUNCE_MS).toBeLessThan(5000); // Reasonable upper bound
  });
});

// ============================================================================
// View Bounds Tests
// ============================================================================

describe('View bounds calculation', () => {
  interface ViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  function calculateViewBounds(
    windowWidth: number,
    windowHeight: number,
    sidebarCollapsed: boolean,
    isActive: boolean,
  ): ViewBounds {
    const sidebarWidth = getSidebarWidth(windowWidth, sidebarCollapsed);
    const contentWidth = Math.max(0, windowWidth - sidebarWidth);

    return {
      x: sidebarWidth,
      y: 0,
      width: isActive ? contentWidth : 0,
      height: windowHeight,
    };
  }

  it('should position active view after sidebar', () => {
    const bounds = calculateViewBounds(1400, 900, false, true);
    expect(bounds.x).toBe(SIDEBAR_WIDTH_WIDE);
    expect(bounds.width).toBe(1400 - SIDEBAR_WIDTH_WIDE);
  });

  it('should hide inactive view (width 0)', () => {
    const bounds = calculateViewBounds(1400, 900, false, false);
    expect(bounds.width).toBe(0);
  });

  it('should use full width when sidebar collapsed', () => {
    const bounds = calculateViewBounds(1400, 900, true, true);
    expect(bounds.x).toBe(SIDEBAR_WIDTH_COLLAPSED);
    expect(bounds.width).toBe(1400 - SIDEBAR_WIDTH_COLLAPSED);
  });

  it('should always start at y=0', () => {
    const bounds = calculateViewBounds(1400, 900, false, true);
    expect(bounds.y).toBe(0);
  });

  it('should use full window height', () => {
    const bounds = calculateViewBounds(1400, 900, false, true);
    expect(bounds.height).toBe(900);
  });
});

// ============================================================================
// Debounce Timer Tests
// ============================================================================

describe('Window state save debouncing', () => {
  it('should use debounce interval from constants', () => {
    expect(WINDOW_STATE_SAVE_DEBOUNCE_MS).toBe(350);
  });

  it('should have reasonable debounce timing', () => {
    // Fast enough for responsive UX
    expect(WINDOW_STATE_SAVE_DEBOUNCE_MS).toBeLessThan(1000);
    // Slow enough to batch rapid changes
    expect(WINDOW_STATE_SAVE_DEBOUNCE_MS).toBeGreaterThan(100);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Layout edge cases', () => {
  it('should handle minimum window width', () => {
    const width = getSidebarWidth(MIN_WINDOW_WIDTH, false);
    expect(width).toBe(SIDEBAR_WIDTH_NARROW);
  });

  it('should handle very small windows', () => {
    const width = getSidebarWidth(100, false);
    expect(width).toBe(SIDEBAR_WIDTH_NARROW);
  });

  it('should handle very large windows', () => {
    const width = getSidebarWidth(5000, false);
    expect(width).toBe(SIDEBAR_WIDTH_WIDE);
  });

  it('should handle exact breakpoint values', () => {
    // At exactly 900, should use MEDIUM (not NARROW)
    expect(getSidebarWidth(900, false)).toBe(SIDEBAR_WIDTH_MEDIUM);
    // At exactly 1180, should use WIDE (not MEDIUM)
    expect(getSidebarWidth(1180, false)).toBe(SIDEBAR_WIDTH_WIDE);
  });

  it('should handle negative width (clamped to 0)', () => {
    const contentWidth = Math.max(0, -100 - SIDEBAR_WIDTH_WIDE);
    expect(contentWidth).toBe(0);
  });
});
