import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainHeuristicsSettings({
  t,
  config,
  sendPatch,
  busy,
}: {
  t: ReturnType<typeof useAppTranslation>['t'];
  config: NonNullable<ReturnType<typeof useBrainSection>['config']>;
  sendPatch: ReturnType<typeof useBrainSection>['sendPatch'];
  busy: ReturnType<typeof useBrainSection>['busy'];
}): ReactElement {
  return (
    <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3">
      <span className="text-sm font-medium">{t('settings:brain.heuristicsHeading')}</span>
      <p className="text-xs text-muted-foreground">{t('settings:brain.heuristicsBody')}</p>
      <PreferenceToggle
        label={t('settings:brain.heuristicsLowRiskLabel')}
        hint={t('settings:brain.heuristicsLowRiskHint')}
        value={config.heuristics.lowRiskAutoAnswer}
        onChange={() =>
          sendPatch({
            heuristics: { lowRiskAutoAnswer: !config.heuristics.lowRiskAutoAnswer },
          })
        }
        disabled={busy}
      />
      <PreferenceToggle
        label={t('settings:brain.heuristicsBlockedLabel')}
        hint={t('settings:brain.heuristicsBlockedHint')}
        value={config.heuristics.blockedResolved}
        onChange={() =>
          sendPatch({ heuristics: { blockedResolved: !config.heuristics.blockedResolved } })
        }
        disabled={busy}
      />
      <PreferenceToggle
        label={t('settings:brain.heuristicsDeadlockLabel')}
        hint={t('settings:brain.heuristicsDeadlockHint')}
        value={config.heuristics.deadlockSkip}
        onChange={() =>
          sendPatch({ heuristics: { deadlockSkip: !config.heuristics.deadlockSkip } })
        }
        disabled={busy}
      />
      <PreferenceToggle
        label={t('settings:brain.heuristicsRetryLabel')}
        hint={t('settings:brain.heuristicsRetryHint')}
        value={config.heuristics.retryExhausted}
        onChange={() =>
          sendPatch({ heuristics: { retryExhausted: !config.heuristics.retryExhausted } })
        }
        disabled={busy}
      />
      <PreferenceToggle
        label={t('settings:brain.heuristicsPingLabel')}
        hint={t('settings:brain.heuristicsPingHint')}
        value={config.heuristics.continuePing}
        onChange={() =>
          sendPatch({ heuristics: { continuePing: !config.heuristics.continuePing } })
        }
        disabled={busy}
      />
      {config.heuristics.blockedResolvedMarkers &&
        config.heuristics.blockedResolvedMarkers.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {t('settings:brain.heuristicsMarkers', {
              markers: config.heuristics.blockedResolvedMarkers.join(', '),
            })}
          </p>
        )}
    </div>
  );
}
