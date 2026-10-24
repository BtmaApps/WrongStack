import {
  type StreamActivity,
  streamActivityView,
} from '@wrongstack/contracts/types/stream-activity';
import type React from 'react';
import { Text, useAnimation } from '../ink.js';
import { useMotionStatic } from '../motion.js';
import { truncateDisplay } from '../terminal-width.js';
import { theme } from '../theme.js';

/** One bounded row, driven by Ink's shared clock rather than another interval. */
export function StreamActivityLine({
  activity,
  width,
  running,
}: {
  activity: StreamActivity | null | undefined;
  width: number;
  running: boolean;
}): React.ReactElement | null {
  const motionStatic = useMotionStatic();
  const { frame } = useAnimation({ interval: 500, isActive: running });
  if (!activity) return null;
  const view = streamActivityView(activity);
  const wave =
    running && view.receiving && !motionStatic
      ? ['▂▄▆█▆▄▂', '▄▆█▆▄▂▄', '▆█▆▄▂▄▆', '█▆▄▂▄▆█'][frame % 4]
      : '▂▄▆█▆▄▂';
  // Keep the count + speed first so narrow terminals preserve the useful data.
  const line = `${wave} ${view.countLabel} · ${view.speedLabel} · ${view.elapsedLabel} · ${view.phaseLabel}`;
  return (
    <Text bold color={running ? theme.accent : theme.textMuted} wrap="truncate-end">
      {truncateDisplay(line, Math.max(1, width))}
    </Text>
  );
}
