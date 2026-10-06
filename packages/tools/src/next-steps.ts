/** Browser-safe compatibility entry; Core and all clients share one parser. */
export {
  hasNextStepsCompleteMarker,
  indexInsideCodeFence,
  isFinalTurnStopReason,
  NEXT_STEPS_COMPLETE_MARKER,
  type ParsedNextStep,
  type ParseNextStepsOptions,
  type ParseNextStepsResult,
  parseNextSteps,
  projectNextStepsToolInput,
  stripNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/core/utils/next-steps';
