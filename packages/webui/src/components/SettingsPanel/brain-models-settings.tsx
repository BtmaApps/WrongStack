import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { entryLabel } from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainModelsSettings({
  t,
  config,
  sendPatch,
  busy,
  setPickTarget,
}: {
  t: ReturnType<typeof useAppTranslation>['t'];
  config: NonNullable<ReturnType<typeof useBrainSection>['config']>;
  sendPatch: ReturnType<typeof useBrainSection>['sendPatch'];
  busy: ReturnType<typeof useBrainSection>['busy'];
  setPickTarget: ReturnType<typeof useBrainSection>['setPickTarget'];
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings:brain.modelsHeading')}</span>
        <Badge variant="outline" className="text-[10px]">
          {config.usingSessionModel
            ? t('settings:brain.modelsSessionBadge')
            : t('settings:brain.modelsResolvedBadge', {
                resolved: config.poolLabels.length,
                total: config.models.length,
              })}
        </Badge>
      </div>
      <PreferenceToggle
        label={t('settings:brain.modelsUseSessionLabel')}
        hint={t('settings:brain.modelsUseSessionHint')}
        value={config.usingSessionModel}
        onChange={() => {
          if (!config.usingSessionModel) sendPatch({ models: null });
        }}
        disabled={busy}
      />
      {config.models.length > 0 && (
        <div className="space-y-1">
          {config.models.map((entry, i) => (
            <div
              key={`${entryLabel(entry)}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
              <span className="flex-1 truncate font-mono">{entryLabel(entry)}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={busy || i === 0}
                onClick={() => {
                  const next = config.models.map(entryLabel);
                  const item = next.splice(i, 1)[0];
                  if (item) next.splice(i - 1, 0, item);
                  sendPatch({ models: next });
                }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={busy || i === config.models.length - 1}
                onClick={() => {
                  const next = config.models.map(entryLabel);
                  const item = next.splice(i, 1)[0];
                  if (item) next.splice(i + 1, 0, item);
                  sendPatch({ models: next });
                }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive"
                disabled={busy}
                onClick={() => {
                  const next = config.models.map(entryLabel).filter((_, j) => j !== i);
                  sendPatch({ models: next.length > 0 ? next : null });
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        disabled={busy}
        onClick={() => setPickTarget('pool')}
      >
        <Plus className="h-3.5 w-3.5" /> {t('settings:brain.modelsAddModel')}
      </Button>
      {config.models.length > 1 && (
        <PreferenceSelect
          label={t('settings:brain.modelsPoolStrategyLabel')}
          hint={t('settings:brain.modelsPoolStrategyHint')}
          value={config.strategy}
          options={[
            { value: 'fallback', label: t('settings:brain.optFallback') },
            { value: 'round-robin', label: t('settings:brain.optRoundRobin') },
          ]}
          onChange={(strategy) => sendPatch({ strategy })}
          disabled={busy}
        />
      )}
    </div>
  );
}
