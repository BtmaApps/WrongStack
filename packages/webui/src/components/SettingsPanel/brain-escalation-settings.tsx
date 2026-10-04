import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import {
  DECISION_LOG_SIZES,
  DECISION_TIMEOUTS,
  HUMAN_TIMEOUTS,
  localizeOptions,
  withCurrent,
} from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import type { useBrainSection } from './use-brain-section.js';
export function BrainEscalationSettings({
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
      <span className="text-sm font-medium">{t('settings:brain.escalationHeading')}</span>
      <PreferenceSelect
        label={t('settings:brain.escalationModeLabel')}
        hint={t('settings:brain.escalationModeHint')}
        value={config.mode}
        options={[
          { value: 'interactive', label: t('settings:brain.optInteractive') },
          { value: 'headless', label: t('settings:brain.optHeadless') },
        ]}
        onChange={(mode) => sendPatch({ mode })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.escalationDecisionTimeoutLabel')}
        hint={t('settings:brain.escalationDecisionTimeoutHint')}
        value={config.decisionTimeoutMs ? String(config.decisionTimeoutMs) : 'default'}
        options={localizeOptions(DECISION_TIMEOUTS, t)}
        onChange={(v) => sendPatch({ decisionTimeoutMs: v === 'default' ? null : Number(v) })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.escalationHumanTimeoutLabel')}
        hint={t('settings:brain.escalationHumanTimeoutHint')}
        value={config.humanTimeoutMs ? String(config.humanTimeoutMs) : 'off'}
        options={localizeOptions(HUMAN_TIMEOUTS, t)}
        onChange={(v) => sendPatch({ humanTimeoutMs: v === 'off' ? null : Number(v) })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.escalationTerminalPolicyLabel')}
        hint={t('settings:brain.escalationTerminalPolicyHint')}
        value={config.terminalPolicy}
        options={[
          { value: 'conservative', label: t('settings:brain.optConservative') },
          { value: 'deny-all', label: t('settings:brain.optDenyAll') },
          {
            value: 'continue-on-recommended',
            label: t('settings:brain.optContinueRecommended'),
          },
        ]}
        onChange={(terminalPolicy) => sendPatch({ terminalPolicy })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.escalationDecisionLogSizeLabel')}
        hint={t('settings:brain.escalationDecisionLogSizeHint')}
        value={String(config.decisionLogMaxEntries)}
        options={localizeOptions(
          withCurrent(DECISION_LOG_SIZES, String(config.decisionLogMaxEntries)),
          t,
        )}
        onChange={(v) => sendPatch({ decisionLogMaxEntries: Number(v) })}
        disabled={busy}
      />
    </div>
  );
}
