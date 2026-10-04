import { Brain, Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { ModelSelectDialog } from '../ModelSelectDialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { BrainCacheSettings } from './brain-cache-settings.js';
import { BrainCouncilSettings } from './brain-council-settings.js';
import { BrainEscalationSettings } from './brain-escalation-settings.js';
import { BrainHeuristicsSettings } from './brain-heuristics-settings.js';
import { BrainLedgerSettings } from './brain-ledger-settings.js';
import { BrainModelsSettings } from './brain-models-settings.js';
import { BrainMonitorSettings } from './brain-monitor-settings.js';
import { BrainQualitySettings } from './brain-quality-settings.js';
import { BrainRulesSettings } from './brain-rules-settings.js';
import { PICK_TITLES, RISK_COPY, RISK_LEVELS, RiskDot } from './brain-section-options';
import { BrainTraceSettings } from './brain-trace-settings.js';
import { useBrainSection } from './use-brain-section.js';

export function BrainSection(): ReactElement {
  const {
    pickTarget,
    handleModelPicked,
    setPickTarget,
    loading,
    busy,
    persistError,
    riskLevel,
    handleRiskChange,
    config,
    sendPatch,
    voters,
    personaOptions,
    setVoters,
    log,
  } = useBrainSection();
  const { t } = useAppTranslation();

  return (
    <div className="space-y-4">
      <ModelSelectDialog
        open={pickTarget !== null}
        mode="provider-model"
        title={pickTarget ? t(PICK_TITLES[pickTarget].title) : ''}
        hint={pickTarget ? t(PICK_TITLES[pickTarget].hint) : undefined}
        onPick={(result) => {
          if (result.type !== 'provider-model') return;
          return handleModelPicked(result);
        }}
        onClose={() => setPickTarget(null)}
      />
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <Brain className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t('settings:brain.heading')}</h3>
          <p className="text-xs text-muted-foreground">{t('settings:brain.headingHint')}</p>
        </div>
        {(loading || busy) && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {persistError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {persistError}
        </div>
      )}

      {/* Risk ceiling */}
      <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
        <span className="text-sm font-medium">{t('settings:brain.riskHeading')}</span>
        <div className="flex gap-2 flex-wrap">
          {RISK_LEVELS.map((level) => (
            <Button
              key={level}
              variant={riskLevel === level ? 'default' : 'outline'}
              size="sm"
              className={cn('gap-1.5 text-xs', riskLevel === level && 'shadow-sm')}
              disabled={busy}
              onClick={() => handleRiskChange(level)}
            >
              <RiskDot level={level} />
              {level.toUpperCase()}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(RISK_COPY[riskLevel])}</p>
      </div>

      {config && (
        <>
          {/* Escalation */}
          <BrainEscalationSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* Deterministic rules (read-only) */}
          <BrainRulesSettings t={t} config={config} />

          {/* Heuristics */}
          <BrainHeuristicsSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* LLM quality gate */}
          <BrainQualitySettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* Replay trace */}
          <BrainTraceSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* Decision cache */}
          <BrainCacheSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* Monitor */}
          <BrainMonitorSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />

          {/* Decision models */}
          <BrainModelsSettings
            t={t}
            config={config}
            sendPatch={sendPatch}
            busy={busy}
            setPickTarget={setPickTarget}
          />

          {/* Council */}
          <BrainCouncilSettings
            t={t}
            config={config}
            sendPatch={sendPatch}
            busy={busy}
            voters={voters}
            personaOptions={personaOptions}
            setVoters={setVoters}
            setPickTarget={setPickTarget}
          />

          {/* Ledger */}
          <BrainLedgerSettings t={t} config={config} sendPatch={sendPatch} busy={busy} />
        </>
      )}

      {/* Recent decisions */}
      <div className="space-y-2 rounded-md border border-border/70 bg-card/70 p-3">
        <span className="text-sm font-medium">
          {t('settings:brain.recentHeading', { count: log.length })}
        </span>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {log.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('settings:brain.recentEmpty')}</p>
          ) : (
            log.map((entry) => (
              <div
                key={`${entry.age}-${entry.kind}-${entry.question.slice(0, 32)}`}
                className="flex items-start gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs"
              >
                <span className="text-muted-foreground shrink-0 w-8">{entry.age}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {entry.kind}
                </Badge>
                <span className="flex-1 truncate">{entry.question}</span>
                {entry.outcome && (
                  <span className="text-muted-foreground shrink-0 italic">{entry.outcome}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
