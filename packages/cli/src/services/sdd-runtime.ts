export {
  getActiveBuilder,
  getActiveSDDContext,
  getActiveSDDPhase,
} from './sdd/project-context.js';
export {
  autoDetectTaskCompletion,
  trySaveImplementationPlan,
  trySaveSpecFromAIOutput,
} from './sdd/spec-detection.js';
export {
  advanceToNextTask,
  getCurrentExecutingContext,
  getTaskGraphId,
  getTaskListText,
  getTaskProgress,
  getTaskTrackerExport as getTaskTracker,
  renderTaskListWithProgress,
  trySaveTasksFromAIOutput,
} from './sdd/task-manager.js';
