import type { PressureLevel } from './compaction-thresholds.js';

/** Mutable bookkeeping for one conversation only. */
export class AutoCompactionState {
  lastNoopAttempt: { level: PressureLevel; tokens: number } | null = null;
  lastHygieneTokens: number | null = null;
  _cachedCalibrationKey = '';
  _cachedCalibrationRatio = -1;
  _cachedCalibrated = false;
  _cachedTokens = -1;
  _cachedMsgCount = -1;
  _cachedToolCount = -1;
  _cachedRevision = -1;
  _cachedSystemRef: unknown = null;
  _cachedToolsRef: unknown = null;
}
