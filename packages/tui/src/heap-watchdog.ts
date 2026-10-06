/**
 * Backwards-compatible TUI import surface for heap diagnostics.
 *
 * The implementation lives in core so CLI, TUI and WebUI use identical
 * sampling semantics. Production TUI wiring joins the process-wide shared
 * watchdog; the independent starter remains re-exported for embedders/tests.
 */
export {
  defaultHeapLogPath,
  type HeapSample,
  startHeapWatchdog,
  startSharedHeapWatchdog,
  takeHeapSample,
} from '@wrongstack/core/utils';
