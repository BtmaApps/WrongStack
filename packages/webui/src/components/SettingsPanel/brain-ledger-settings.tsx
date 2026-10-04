import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import {
  INTERVENTION_WINDOWS,
  LEDGER_MEMORY_ENTRIES,
  localizeOptions,
  optionalValue,
  withCurrent,
} from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainLedgerSettings({
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
      <span className="text-sm font-medium">{t('settings:brain.ledgerHeading')}</span>
      <PreferenceToggle
        label={t('settings:brain.ledgerRecordLabel')}
        hint={t('settings:brain.ledgerRecordHint')}
        value={config.ledger.enabled}
        onChange={() => sendPatch({ ledger: { enabled: !config.ledger.enabled } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.ledgerAutoDenyLabel')}
        hint={t('settings:brain.ledgerAutoDenyHint')}
        value={
          config.ledger.autoDenyAfterFailures !== undefined
            ? String(config.ledger.autoDenyAfterFailures)
            : 'default'
        }
        options={[
          { value: 'default', label: t('settings:brain.optDefault3') },
          { value: '0', label: t('settings:brain.optOff') },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '5', label: '5' },
        ]}
        onChange={(v) =>
          sendPatch({
            ledger: { autoDenyAfterFailures: v === 'default' ? null : Number(v) },
          })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.ledgerMemoryEntriesLabel')}
        hint={t('settings:brain.ledgerMemoryEntriesHint')}
        value={optionalValue(config.ledger.maxMemoryEntries)}
        options={localizeOptions(
          withCurrent(LEDGER_MEMORY_ENTRIES, optionalValue(config.ledger.maxMemoryEntries)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ ledger: { maxMemoryEntries: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.ledgerRetryWindowLabel')}
        hint={t('settings:brain.ledgerRetryWindowHint')}
        value={optionalValue(config.ledger.interventionRetryWindowMs)}
        options={localizeOptions(
          withCurrent(INTERVENTION_WINDOWS, optionalValue(config.ledger.interventionRetryWindowMs)),
          t,
        )}
        onChange={(v) =>
          sendPatch({
            ledger: { interventionRetryWindowMs: v === 'default' ? null : Number(v) },
          })
        }
        disabled={busy}
      />
      {config.ledger.path && (
        <p className="truncate text-xs text-muted-foreground">{config.ledger.path}</p>
      )}
    </div>
  );
}
