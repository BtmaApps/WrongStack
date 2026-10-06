/**
 * Dead-code engine: precise reachability + export usage over executable
 * source files, and a user-controlled cleanup (plan → preview → apply →
 * verify → rollback / undo).
 */

export { analyzeDeadCode, readProjectDeadCodeConfig } from './analyze.js';
export {
  applyDeadCodeFixes,
  type DeadCodeApplyOptions,
  type DeadCodeApplyResult,
  type DeadCodeBackupInfo,
  type DeadCodeFileChange,
  type DeadCodePlan,
  type DeadCodeUndoResult,
  type DeadCodeVerifyMode,
  type DeadCodeVerifyStep,
  listDeadCodeBackups,
  planDeadCodeFixes,
  undoDeadCodeFix,
} from './fix.js';
export {
  type DeadCodeFixToolInput,
  type DeadCodeScanToolInput,
  deadCodeFixTool,
  deadCodeScanTool,
} from './tools.js';
export type {
  DeadCodeCategory,
  DeadCodeConfidence,
  DeadCodeFinding,
  DeadCodeFixAction,
  DeadCodeScanOptions,
  DeadCodeScanResult,
  DeadCodeScanStats,
} from './types.js';
