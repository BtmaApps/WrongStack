import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainTraceSettings({
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
      <span className="text-sm font-medium">{t('settings:brain.traceHeading')}</span>
      <PreferenceToggle
        label={t('settings:brain.traceRecordLabel')}
        hint={t('settings:brain.traceRecordHint')}
        value={config.trace.enabled}
        onChange={() => sendPatch({ trace: { enabled: !config.trace.enabled } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.traceContentLabel')}
        hint={t('settings:brain.traceContentHint')}
        value={config.trace.content}
        options={[
          { value: 'full', label: t('settings:brain.optFullDefault') },
          { value: 'redacted', label: t('settings:brain.optRedacted') },
          { value: 'none', label: t('settings:brain.optMetadataOnly') },
        ]}
        onChange={(content) => sendPatch({ trace: { content } })}
        disabled={busy}
      />
      {config.trace.path && (
        <p className="truncate text-xs text-muted-foreground">{config.trace.path}</p>
      )}
    </div>
  );
}
