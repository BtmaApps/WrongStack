/**
 * Backward-compatible alias for the canonical persistent mission store.
 *
 * Goal state used to be represented by two independent Zustand stores, so a
 * `goal-state.updated` frame could update the dock while legacy consumers kept
 * rendering stale data. Keep the old import path without keeping a second
 * source of truth.
 */
export { useGoalStateStore as useGoalStore } from './goal-state-store.js';
