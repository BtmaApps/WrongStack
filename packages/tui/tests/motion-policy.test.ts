import { afterEach, describe, expect, it } from 'vitest';
import {
  animatesColor,
  effectiveAnimationStyle,
  isMotionStatic,
  reducedMotionFromEnv,
  setMotionStatic,
  titleAnimationAllowed,
} from '../src/motion.js';

describe('motion policy', () => {
  afterEach(() => setMotionStatic(false));

  it('reads WRONGSTACK_REDUCED_MOTION truthy values only', () => {
    for (const value of ['1', 'true', 'YES', ' on ']) {
      expect(reducedMotionFromEnv({ WRONGSTACK_REDUCED_MOTION: value })).toBe(true);
    }
    for (const value of ['0', 'false', '', 'off']) {
      expect(reducedMotionFromEnv({ WRONGSTACK_REDUCED_MOTION: value })).toBe(false);
    }
    expect(reducedMotionFromEnv({})).toBe(false);
  });

  it('keeps settings when the environment does not reduce motion', () => {
    // The test process runs without WRONGSTACK_REDUCED_MOTION.
    expect(effectiveAnimationStyle('rainbow')).toBe('rainbow');
    expect(titleAnimationAllowed(undefined)).toBe(true);
    expect(titleAnimationAllowed(false)).toBe(false);
  });

  it('runs the fast color clock only for color-moving styles', () => {
    for (const style of ['rainbow', 'wave', 'pulse', 'cycle'])
      expect(animatesColor(style)).toBe(true);
    for (const style of ['static', 'dots', 'breathe']) expect(animatesColor(style)).toBe(false);
  });

  it('publishes the static-motion flag', () => {
    setMotionStatic(true);
    expect(isMotionStatic()).toBe(true);
    setMotionStatic(false);
    expect(isMotionStatic()).toBe(false);
  });
});
