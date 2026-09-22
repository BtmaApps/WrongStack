export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Normalize a `ctx.pct` `load` into a 0-1 context-fill fraction.
 *
 * The wire unit is a fraction of the context budget, NOT a percentage:
 * core computes `rawLoad = tokens / maxContext` and emits it as
 * `load = Math.max(0, Math.min(1, rawLoad))` — already clamped to [0, 1]
 * (see `emitContextPct` in core `agent-loop.ts`; the un-clamped value is
 * carried separately as `rawLoad`). So `load: 0.68` means 68% full and a
 * full budget is exactly `1`. The previous `load > 1 ? load / 100`
 * heuristic silently corrupted any value it mistook for a percentage and
 * could never distinguish "1% as a percent" from "100% as a fraction".
 *
 * Deterministic rule: trust the fraction and pass it through. The only
 * adjustment is a defensive clamp of non-finite/negative inputs to 0 (the
 * producer already clamps, so this is just belt-and-suspenders against a
 * malformed frame — we do NOT divide or magnitude-sniff).
 */
export function normalizeContextLoad(value: unknown): number {
  const load = finiteNumber(value);
  return load > 0 ? load : 0;
}
