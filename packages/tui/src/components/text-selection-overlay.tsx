import { type CellRange, selectedRuns, type TextRun } from '../cell-selection.js';
import { Box, Text } from '../ink.js';

/** Absolute text-only feedback: never contributes rows to the managed viewport. */
export function TextSelectionOverlay({
  runs,
  range,
}: {
  runs: readonly TextRun[];
  range: CellRange | null;
}) {
  if (!range) return null;
  return selectedRuns(runs, range).map((run, index) => (
    <Box key={`${run.row}:${run.col}:${index}`} position="absolute" top={run.row} left={run.col}>
      <Text inverse>{run.text}</Text>
    </Box>
  ));
}
