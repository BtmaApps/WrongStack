import { BRAIN_RISK_LEVELS } from './brain.js';

/** Runtime-adjustable autonomy ceiling for the tiered brain. */
export type BrainAutoRisk = 'off' | 'low' | 'medium' | 'high' | 'all';

/** Resolve an autonomy ceiling to a level comparable against `BRAIN_RISK_LEVELS`. */
export function resolveRiskCeiling(ceiling: BrainAutoRisk | undefined): number {
  if (ceiling === 'off') return -1;
  if (ceiling === 'all') return 3;
  return BRAIN_RISK_LEVELS[ceiling ?? 'medium'] ?? 1;
}
