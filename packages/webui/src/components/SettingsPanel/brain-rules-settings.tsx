import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { Badge } from '../ui/badge';
import type { useBrainSection } from './use-brain-section.js';
export function BrainRulesSettings({
  t,
  config,
}: {
  t: ReturnType<typeof useAppTranslation>['t'];
  config: NonNullable<ReturnType<typeof useBrainSection>['config']>;
}): ReactElement {
  return (
    <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings:brain.rulesHeading')}</span>
        <Badge variant="outline" className="text-[10px]">
          {t('settings:brain.rulesConfigured', { count: config.rules.length })}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings:brain.rulesBody')}</p>
      {config.rules.length > 0 && (
        <div className="space-y-1">
          {config.rules.map((rule, i) => (
            <div
              key={`${rule.id}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
              <span className="flex-1 truncate font-mono">{rule.id}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {rule.then.action}
              </Badge>
              {rule.enabled === false && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t('settings:brain.rulesOff')}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
      {config.ruleErrors.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5">
          <span className="text-xs font-medium text-warning">
            {t('settings:brain.rulesDropped', { count: config.ruleErrors.length })}
          </span>
          {config.ruleErrors.map((err) => (
            <p key={err} className="text-xs text-warning">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
