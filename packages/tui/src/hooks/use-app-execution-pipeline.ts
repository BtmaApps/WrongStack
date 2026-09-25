import { toErrorMessage } from '@wrongstack/core/utils';
import { createAppKeyHandler } from '../app-key-handler.js';
import { createRunBlocksController } from '../run-blocks-controller.js';
import { createSubmitController } from '../submit-controller.js';
import { useStableKeyHandler } from './use-stable-key-handler.js';

export type KeyHandlerParams = Parameters<typeof createAppKeyHandler>[0];
export type RunBlocksParams = Parameters<typeof createRunBlocksController>[0];
export type SubmitParams = Parameters<typeof createSubmitController>[0];

export interface AppExecutionPipelineArgs {
  keyHandlerParams: KeyHandlerParams;
  runBlocksParams: RunBlocksParams;
  submitParams: SubmitParams;
  runBlocksRef: { current: ReturnType<typeof createRunBlocksController> };
  submitRef: { current: (text?: string) => void };
}

export function useAppExecutionPipeline(args: AppExecutionPipelineArgs) {
  const { keyHandlerParams, runBlocksParams, submitParams, runBlocksRef, submitRef } = args;

  const handleKey = createAppKeyHandler(keyHandlerParams);
  const runBlocks = createRunBlocksController(runBlocksParams);
  runBlocksRef.current = runBlocks;

  const submit = createSubmitController(submitParams);
  submitRef.current = submit;

  const { dispatch } = keyHandlerParams;
  const stableOnKey = useStableKeyHandler(handleKey, (err) => {
    dispatch({
      type: 'addEntry',
      entry: { kind: 'error', text: `Key handling failed: ${toErrorMessage(err)}` },
    });
  });

  return { handleKey, runBlocks, submit, stableOnKey };
}
