import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { Badge } from '../ui/badge';
import {
  LLM_MAX_TOKENS,
  localizeOptions,
  MIN_CONFIDENCE,
  optionalValue,
  withCurrent,
} from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainQualitySettings({
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings:brain.qualityHeading')}</span>
        {config.circuit && (
          <Badge
            variant={config.circuit.state === 'closed' ? 'outline' : 'default'}
            className="text-[10px]"
          >
            {t('settings:brain.qualityCircuit', {
              state: config.circuit.state,
              count: config.circuit.consecutiveFailures,
            })}
          </Badge>
        )}
      </div>
      <PreferenceSelect
        label={t('settings:brain.qualityResponseBudgetLabel')}
        hint={t('settings:brain.qualityResponseBudgetHint')}
        value={optionalValue(config.llm.maxTokens)}
        options={localizeOptions(
          withCurrent(LLM_MAX_TOKENS, optionalValue(config.llm.maxTokens)),
          t,
        )}
        onChange={(v) => sendPatch({ llm: { maxTokens: v === 'default' ? null : Number(v) } })}
        disabled={busy}
      />
      <PreferenceToggle
        label={t('settings:brain.qualityRejectLabel')}
        hint={t('settings:brain.qualityRejectHint')}
        value={config.llm.rejectUncertain}
        onChange={() => sendPatch({ llm: { rejectUncertain: !config.llm.rejectUncertain } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.qualityMinConfidenceLabel')}
        hint={t('settings:brain.qualityMinConfidenceHint')}
        value={String(config.llm.minConfidence)}
        options={localizeOptions(withCurrent(MIN_CONFIDENCE, String(config.llm.minConfidence)), t)}
        onChange={(v) => sendPatch({ llm: { minConfidence: Number(v) } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.qualityDenyTerminalLabel')}
        hint={t('settings:brain.qualityDenyTerminalHint')}
        value={config.llm.denyIsTerminal}
        options={[
          { value: 'never', label: t('settings:brain.optNeverDefault') },
          { value: 'when-decided', label: t('settings:brain.optWhenDecided') },
          { value: 'always', label: t('settings:brain.optAlways') },
        ]}
        onChange={(denyIsTerminal) => sendPatch({ llm: { denyIsTerminal } })}
        disabled={busy}
      />
    </div>
  );
}
