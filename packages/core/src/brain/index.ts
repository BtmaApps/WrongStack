/** The brain arbiter, its ledger, monitor, telemetry and trace. Public as `@wrongstack/core/brain`. */

export {
  type BrainArbiter,
  type BrainDecision,
  type BrainDecisionOption,
  BrainDecisionQueue,
  type BrainDecisionRequest,
  type BrainDecisionSource,
  type BrainEscalationMode,
  type BrainFallback,
  type BrainRisk,
  type BrainTerminalPolicy,
  DefaultBrainArbiter,
  type DefaultBrainArbiterOptions,
  EscalationRoutingBrainArbiter,
  formatHumanPrompt,
  HumanEscalatingBrainArbiter,
  ObservableBrainArbiter,
  terminalPolicyDecision,
} from './brain.js';
export {
  type BrainCacheStats,
  BrainDecisionCache,
  type BrainDecisionCacheOptions,
  brainCacheKey,
  type CachingBrainArbiterOptions,
  createCachingBrainArbiter,
} from './brain-cache.js';
export {
  type BrainDecisionExplanation,
  type BrainDecisionStepExplanation,
  type BrainDecisionTierName,
  type BrainExplainContext,
  type BrainExplainLedgerHost,
  explainBrainDecision,
} from './brain-explain.js';
export {
  BLOCKED_RESOLVED_MARKERS,
  type BrainHeuristicsConfig,
  compileResolutionMarkers,
  DEFAULT_BRAIN_HEURISTICS,
  isBlockedResolved,
  type ResolvedBrainHeuristics,
  resolveBrainHeuristics,
} from './brain-heuristics.js';
export {
  BrainDecisionLedger,
  type BrainDecisionLedgerOptions,
  type BrainLedgerEntry,
  brainDecisionKey,
  createLedgerGuardBrainArbiter,
  type LedgerGuardBrainArbiterOptions,
} from './brain-ledger.js';
export {
  type BrainInterventionInput,
  BrainMonitor,
  type BrainMonitorOptions,
  type BrainMonitorPolicy,
  type BrainMonitorSignalToggles,
  DEFAULT_FILE_EDIT_TOOLS,
} from './brain-monitor.js';
export {
  applyRule,
  BRAIN_RULE_PATTERN_MAX,
  BRAIN_RULE_SUBJECT_MAX,
  type BrainRule,
  type BrainRuleAction,
  type BrainRuleCompileResult,
  type BrainRuleMatch,
  type CompiledBrainRule,
  compileBrainRules,
  createRuleBrainArbiter,
  evaluateBrainRules,
  type RuleBrainArbiterOptions,
  ruleMatches,
} from './brain-rules.js';
export {
  type BrainDecisionTier,
  BrainTierCounter,
  type BrainTierStats,
  DETERMINISTIC_BRAIN_TIERS,
  emitBrainTierTransition,
  isDeterministicTier,
  markDecisionTier,
  readDecisionTier,
} from './brain-telemetry.js';
export {
  applyContentMode,
  BRAIN_TRACE_REDACTED_MAX,
  BRAIN_TRACE_VERSION,
  type BrainTraceContentMode,
  type BrainTraceCouncilResolution,
  type BrainTraceCouncilVote,
  type BrainTraceLlmCall,
  type BrainTraceRecord,
  BrainTraceRecorder,
  type BrainTraceRecorderOptions,
  type BrainTraceTierStep,
  readBrainTrace,
  sanitizeDecision,
  sanitizeRequest,
} from './brain-trace.js';
