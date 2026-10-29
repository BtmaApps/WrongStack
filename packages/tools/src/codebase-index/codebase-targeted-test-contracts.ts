/** Leaf contracts shared by the tool implementation and its result guidance. */

export interface TargetedTestOutput {
  status: 'passed' | 'failed' | 'no_tests_found';
  discoveredSuites: string[];
  testsRun: number;
  passed: number;
  failed: number;
  durationMs: number;
  output: string;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
