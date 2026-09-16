/** Browser-safe compatibility entry; Core and all clients share one parser. */
export {
  indexInsideCodeFence,
  isFinalTurnStopReason,
  type ParsedNextStep,
  type ParseNextStepsOptions,
  type ParseNextStepsResult,
  parseNextSteps,
  projectNextStepsToolInput,
  stripNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/core/utils/next-steps';
