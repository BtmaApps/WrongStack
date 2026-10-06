import { estimateMessageTokens } from '../utils/token-estimate.js';

export {
  type ContentScore,
  buildSmartDigest,
  extractText,
  hasLargeToolResult,
  hasToolUse,
  scoreMessage,
} from './compaction-scoring.js';

export {
  type EliseResult,
  collapseAcknowledgedToolReceipts,
  eliseAcknowledgedToolResults,
  eliseOldToolResults,
  findPreserveStart,
  setCompactionDebugLogger,
} from './compaction-elision.js';

export {
  buildLosslessDigest,
  dedupStaleReads,
  enforceHardBudget,
  findExchangeStart,
  findSafeBoundary,
  hasTextContent,
  headTailTruncate,
} from './compaction-budget.js';

export const estimateMessages = estimateMessageTokens;
