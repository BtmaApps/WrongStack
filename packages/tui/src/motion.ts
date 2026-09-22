/**
 * Motion policy for decorative TUI animation (spinners, color sweeps, the
 * animated terminal title).
 *
 * The `static` animation style means "no decorative motion anywhere": it
 * stops every spinner and color clock, not only the working-label gradient.
 * `WRONGSTACK_REDUCED_MOTION=1` forces that for the whole process without
 * touching saved settings — for screen readers, recordings, slow remote
 * terminals and CI. Functional clocks (elapsed timers, countdowns, progress)
 * keep running either way.
 */
import { useSyncExternalStore } from 'react';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function reducedMotionFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env['WRONGSTACK_REDUCED_MOTION'];
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase());
}

const ENV_REDUCED_MOTION = reducedMotionFromEnv();

/** The style actually rendered: the environment override wins over settings. */
export function effectiveAnimationStyle<S extends string>(style: S): S | 'static' {
  return ENV_REDUCED_MOTION ? 'static' : style;
}

/** Whether the animated terminal title may run. */
export function titleAnimationAllowed(setting: boolean | undefined): boolean {
  return setting !== false && !ENV_REDUCED_MOTION;
}

/** Styles whose label colors move and therefore need the fast color clock. */
export function animatesColor(style: string): boolean {
  return style === 'rainbow' || style === 'wave' || style === 'pulse' || style === 'cycle';
}

let motionStatic = ENV_REDUCED_MOTION;
const listeners = new Set<() => void>();

/**
 * Publish the effective style so leaves without a style prop (tool stream
 * spinner, composer activity icon) follow it.
 */
export function setMotionStatic(value: boolean): void {
  const next = value || ENV_REDUCED_MOTION;
  if (next === motionStatic) return;
  motionStatic = next;
  for (const listener of listeners) listener();
}

export function isMotionStatic(): boolean {
  return motionStatic;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while decorative motion is off. */
export function useMotionStatic(): boolean {
  return useSyncExternalStore(subscribe, isMotionStatic, isMotionStatic);
}
