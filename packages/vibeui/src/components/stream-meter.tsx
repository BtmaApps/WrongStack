'use client';

import {
  type StreamActivity,
  startStreamActivity,
  streamActivityView,
} from '@wrongstack/webui-protocol';
import { useEffect, useMemo, useState } from 'react';
import './stream-meter.css';

/** Samples telemetry twice a second; never re-renders the transcript per token. */
export function StreamMeter({
  activity,
  running,
}: {
  activity: StreamActivity | null | undefined;
  running: boolean;
}) {
  const [, tick] = useState(0);
  const waiting = useMemo(() => startStreamActivity(Date.now()), [running]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [running]);
  const current = running && (!activity || activity.endedAt !== null) ? waiting : activity;
  if (!current) return null;
  const view = streamActivityView(current);
  return (
    <section
      className="stream-meter"
      data-receiving={running && view.receiving}
      data-active={running}
      aria-label="Model output activity"
      title="Live tokens and speed are estimated from received text (4 characters per token), including thinking. Completed counts use provider usage when available."
    >
      <span className="stream-meter__signal" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="stream-meter__phase" role="status">
        {running ? view.phaseLabel : current.endedAt === null ? 'Paused' : 'Finished'}
      </span>
      <strong className="stream-meter__count">{view.countLabel}</strong>
      <strong className="stream-meter__speed">{view.speedLabel}</strong>
      <span className="stream-meter__elapsed">{view.elapsedLabel}</span>
    </section>
  );
}
