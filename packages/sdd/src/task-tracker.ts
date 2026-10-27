// Re-export of Core's TaskTracker for sdd's internal test
// suite and consumers. The core package owns the implementation; this
// file only exists so tests under packages/sdd/tests/ can do
// `import { TaskTracker } from '../src/task-tracker.js'` (vitest loads
// TypeScript source directly without going through the exports field).
//
// If a consumer outside sdd wants TaskTracker, import it from the declared
// Core tasking subpath. A deeper task-tracker file path does not work because
// the package exports only the whole tasking boundary, not individual
// files under it (Node 16+ refuses to fall back to the dist tree
// when an undeclared subpath is requested).
export {
  type TaskStore,
  TaskTracker,
  type TaskTrackerChange,
  type TaskTrackerListener,
  type TaskTrackerOptions,
  type TaskTransition,
} from '@wrongstack/core/tasking';
