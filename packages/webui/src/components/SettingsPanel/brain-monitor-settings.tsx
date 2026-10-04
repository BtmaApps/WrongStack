import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainMonitorSettings({
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
      <span className="text-sm font-medium">{t('settings:brain.monitorHeading')}</span>
      <p className="text-xs text-muted-foreground">{t('settings:brain.monitorBody')}</p>
      <PreferenceToggle
        label={t('settings:brain.monitorWatchLabel')}
        hint={t('settings:brain.monitorWatchHint')}
        value={config.monitor.enabled !== false}
        onChange={() => sendPatch({ monitor: { enabled: config.monitor.enabled === false } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.monitorPolicyLabel')}
        hint={t('settings:brain.monitorPolicyHint')}
        value={config.monitor.policy ?? 'llm'}
        options={[
          { value: 'llm', label: t('settings:brain.optConsultBrain') },
          { value: 'steer', label: t('settings:brain.optAlwaysSteer') },
          { value: 'observe', label: t('settings:brain.optObserveOnly') },
        ]}
        onChange={(policy) => sendPatch({ monitor: { policy } })}
        disabled={busy}
      />
    </div>
  );
}
