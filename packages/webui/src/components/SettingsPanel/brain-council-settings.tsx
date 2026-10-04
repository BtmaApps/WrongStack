import { Plus, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  COUNCIL_CALL_TIMEOUTS,
  COUNCIL_CONCURRENCY,
  DELIBERATION_ROUNDS,
  entryLabel,
  FRACTIONS,
  JUDGE_MAX_TOKENS,
  localizeOptions,
  optionalValue,
  VOTER_MAX_TOKENS,
  withCurrent,
} from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainCouncilSettings({
  t,
  config,
  sendPatch,
  busy,
  voters,
  personaOptions,
  setVoters,
  setPickTarget,
}: {
  t: ReturnType<typeof useAppTranslation>['t'];
  config: NonNullable<ReturnType<typeof useBrainSection>['config']>;
  sendPatch: ReturnType<typeof useBrainSection>['sendPatch'];
  busy: ReturnType<typeof useBrainSection>['busy'];
  voters: ReturnType<typeof useBrainSection>['voters'];
  personaOptions: ReturnType<typeof useBrainSection>['personaOptions'];
  setVoters: ReturnType<typeof useBrainSection>['setVoters'];
  setPickTarget: ReturnType<typeof useBrainSection>['setPickTarget'];
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings:brain.councilHeading')}</span>
        <Badge variant={config.council.enabled ? 'default' : 'outline'} className="text-[10px]">
          {config.council.enabled
            ? t('settings:brain.councilConvened')
            : t('settings:brain.councilDisabled')}
        </Badge>
      </div>
      <PreferenceToggle
        label={t('settings:brain.councilEnableLabel')}
        hint={t('settings:brain.councilEnableHint')}
        value={config.council.enabled}
        onChange={() => sendPatch({ council: { enabled: !config.council.enabled } })}
        disabled={busy}
      />
      {config.council.enabled && config.councilLabels.length > 0 && voters.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('settings:brain.councilSeatsDerived', {
            seats: config.councilLabels.join(', '),
          })}
        </p>
      )}
      {voters.length > 0 && (
        <div className="space-y-1">
          {voters.map((voter, i) => (
            <div
              key={`${entryLabel(voter)}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs"
            >
              <span className="flex-1 truncate font-mono">{entryLabel(voter)}</span>
              <select
                value={voter.persona ?? personaOptions[i % personaOptions.length]?.id ?? ''}
                onChange={(e) =>
                  setVoters(voters.map((v, j) => (j === i ? { ...v, persona: e.target.value } : v)))
                }
                className="h-6 rounded border bg-background px-1 text-[10px]"
                title={
                  personaOptions.find((p) => p.id === voter.persona)?.description ??
                  t('settings:brain.councilCustomLens')
                }
              >
                {personaOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {voter.persona && !personaOptions.some((p) => p.id === voter.persona) && (
                  <option value={voter.persona}>
                    {t('settings:brain.councilCustomOption', { persona: voter.persona })}
                  </option>
                )}
              </select>
              <Button
                variant={voter.veto ? 'default' : 'outline'}
                size="sm"
                className="h-6 px-1.5 text-[10px]"
                disabled={busy}
                onClick={() =>
                  setVoters(voters.map((v, j) => (j === i ? { ...v, veto: !v.veto } : v)))
                }
              >
                {t('settings:brain.councilVeto')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive"
                disabled={busy}
                onClick={() => setVoters(voters.filter((_, j) => j !== i))}
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
        onClick={() => setPickTarget('voter')}
      >
        <Plus className="h-3.5 w-3.5" /> {t('settings:brain.councilAddVoter')}
      </Button>
      <PreferenceSelect
        label={t('settings:brain.councilRiskFloorLabel')}
        hint={t('settings:brain.councilRiskFloorHint')}
        value={config.council.minRisk}
        options={[
          { value: 'medium', label: t('settings:brain.optMediumPlus') },
          { value: 'high', label: t('settings:brain.optHighPlus') },
          { value: 'critical', label: t('settings:brain.optCriticalOnly') },
        ]}
        onChange={(minRisk) => sendPatch({ council: { minRisk } })}
        disabled={busy}
      />
      <div className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('settings:brain.councilJudge')}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t('settings:brain.councilJudgeDesc')}
          </div>
          {/*
                  On 'auto' the judge is derived from the pool, and when the
                  pool has no model left over after seating it ends up being
                  one of the voters — a tie-breaker that cast one of the tied
                  votes. Surface the resolved judge so that is visible instead
                  of implicit.
                */}
          {!config.council.judge && config.judgeLabel && (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              {t('settings:brain.councilResolved', { model: config.judgeLabel })}
              {config.judgeIsVoter && (
                <span className="ml-1 font-sans text-warning">
                  {t('settings:brain.councilAlsoVoter')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-[180px] truncate font-mono text-xs">
            {config.council.judge
              ? entryLabel(config.council.judge)
              : t('settings:brain.councilAuto')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => setPickTarget('judge')}
          >
            {t('settings:brain.councilPick')}
          </Button>
          {config.council.judge && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => sendPatch({ council: { judge: null } })}
            >
              {t('settings:brain.councilAutoReset')}
            </Button>
          )}
        </div>
      </div>
      <PreferenceSelect
        label={t('settings:brain.councilQuorumLabel')}
        hint={t('settings:brain.councilQuorumHint')}
        value={config.council.quorum !== undefined ? String(config.council.quorum) : 'default'}
        options={localizeOptions(FRACTIONS, t)}
        onChange={(v) => sendPatch({ council: { quorum: v === 'default' ? null : Number(v) } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilApprovalLabel')}
        hint={t('settings:brain.councilApprovalHint')}
        value={config.council.approval !== undefined ? String(config.council.approval) : 'default'}
        options={localizeOptions(FRACTIONS, t)}
        onChange={(v) => sendPatch({ council: { approval: v === 'default' ? null : Number(v) } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilPerSeatTimeoutLabel')}
        hint={t('settings:brain.councilPerSeatTimeoutHint')}
        value={optionalValue(config.council.perCallTimeoutMs)}
        options={localizeOptions(
          withCurrent(COUNCIL_CALL_TIMEOUTS, optionalValue(config.council.perCallTimeoutMs)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ council: { perCallTimeoutMs: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilMaxConcurrencyLabel')}
        hint={t('settings:brain.councilMaxConcurrencyHint')}
        value={optionalValue(config.council.maxConcurrency)}
        options={localizeOptions(
          withCurrent(COUNCIL_CONCURRENCY, optionalValue(config.council.maxConcurrency)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ council: { maxConcurrency: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilDistinctnessLabel')}
        hint={t('settings:brain.councilDistinctnessHint')}
        value={config.council.distinctness}
        options={[
          { value: 'none', label: t('settings:brain.optNoneDefault') },
          { value: 'model', label: t('settings:brain.optDistinctModels') },
          { value: 'provider', label: t('settings:brain.optDistinctProviders') },
        ]}
        onChange={(distinctness) => sendPatch({ council: { distinctness } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilVoterBudgetLabel')}
        hint={t('settings:brain.councilVoterBudgetHint')}
        value={optionalValue(config.council.voterMaxTokens)}
        options={localizeOptions(
          withCurrent(VOTER_MAX_TOKENS, optionalValue(config.council.voterMaxTokens)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ council: { voterMaxTokens: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilRoundsLabel')}
        hint={t('settings:brain.councilRoundsHint')}
        value={optionalValue(config.council.deliberationRounds)}
        options={localizeOptions(
          withCurrent(DELIBERATION_ROUNDS, optionalValue(config.council.deliberationRounds)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ council: { deliberationRounds: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.councilJudgeBudgetLabel')}
        hint={t('settings:brain.councilJudgeBudgetHint')}
        value={optionalValue(config.council.judgeMaxTokens)}
        options={localizeOptions(
          withCurrent(JUDGE_MAX_TOKENS, optionalValue(config.council.judgeMaxTokens)),
          t,
        )}
        onChange={(v) =>
          sendPatch({ council: { judgeMaxTokens: v === 'default' ? null : Number(v) } })
        }
        disabled={busy}
      />
      {config.council.seats.length > 0 && (
        <p className="truncate text-xs text-muted-foreground">
          {t('settings:brain.councilSeatTemplate')}{' '}
          {config.council.seats
            .map((seat) =>
              seat.veto ? `${seat.persona} (${t('settings:brain.councilVeto')})` : seat.persona,
            )
            .join(', ')}
        </p>
      )}
    </div>
  );
}
