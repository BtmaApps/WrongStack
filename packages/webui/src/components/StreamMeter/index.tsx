import { startStreamActivity, streamActivityView } from '@wrongstack/webui-protocol';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readStreamActivity } from '@/lib/stream-activity';
import { DEFAULT_LANE_ID, useChatStore } from '@/stores/chat-store';
import './stream-meter.css';

/** Samples telemetry twice a second; never re-renders the transcript per token. */
export function StreamMeter() {
  const { t } = useTranslation('chat');
  const running = useChatStore((state) => state.isLoading);
  const sessionId = useChatStore((state) => state.boundSessionId) ?? DEFAULT_LANE_ID;
  const [, tick] = useState(0);
  const waiting = useMemo(() => startStreamActivity(Date.now()), [running, sessionId]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [running, sessionId]);
  const activity = readStreamActivity(sessionId);
  const current = running && (!activity || activity.endedAt !== null) ? waiting : activity;
  if (!current) return null;
  const view = streamActivityView(current);
  const phases: Record<string, string> = {
    Finished: t('chat:streamActivity.finished'),
    Thinking: t('chat:streamActivity.thinking'),
    Receiving: t('chat:streamActivity.receiving'),
    'Running tools': t('chat:streamActivity.tools'),
    'Waiting for model': t('chat:streamActivity.waiting'),
    Working: t('chat:streamActivity.working'),
  };
  return (
    <section
      className="stream-meter"
      data-receiving={running && view.receiving}
      data-active={running}
      aria-label={t('chat:streamActivity.label')}
      title={t('chat:streamActivity.description')}
    >
      <span className="stream-meter__signal" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="stream-meter__phase" role="status">
        {running
          ? phases[view.phaseLabel]
          : current.endedAt === null
            ? t('chat:streamActivity.paused')
            : t('chat:streamActivity.finished')}
      </span>
      <strong className="stream-meter__count">
        {t('chat:streamActivity.tokens', {
          value: `${view.estimated ? '≈' : ''}${view.tokens.toLocaleString()}`,
        })}
      </strong>
      <strong className="stream-meter__speed">{view.speedLabel}</strong>
      <span className="stream-meter__elapsed">{view.elapsedLabel}</span>
    </section>
  );
}
