import type { ModelCandidate } from '@/hooks/useProviderModels';
import { useAppTranslation } from '@/i18n';
import { FallbackEditor } from './FallbackEditor';
import { ModelPicker } from './ModelPicker';

interface SddRunConfigPopoverProps {
  modelCandidates: ModelCandidate[];
  runModel: string | undefined;
  setRunModel: (model: string | undefined) => void;
  runProvider: string | undefined;
  setRunProvider: (provider: string | undefined) => void;
  runFallbacks: string[];
  setRunFallbacks: (fallbacks: string[]) => void;
  runSlots: number;
  setRunSlots: (slots: number) => void;
  runWorktrees: boolean;
  setRunWorktrees: (on: boolean) => void;
  runPlanDecompose: boolean;
  setRunPlanDecompose: (on: boolean) => void;
}

/** The run settings popover: worker model, fallback chain, parallelism, isolation. */
export function SddRunConfigPopover({
  modelCandidates,
  runModel,
  setRunModel,
  runProvider,
  setRunProvider,
  runFallbacks,
  setRunFallbacks,
  runSlots,
  setRunSlots,
  runWorktrees,
  setRunWorktrees,
  runPlanDecompose,
  setRunPlanDecompose,
}: SddRunConfigPopoverProps) {
  const { t } = useAppTranslation();
  return (
    <div className="sdd-rise absolute right-0 top-9 z-50 w-72 rounded-lg border border-border bg-popover p-3 ws-dialog">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('activity:sddWizard.defaultWorkerModel')}
      </div>
      <ModelPicker
        value={runModel}
        provider={runProvider}
        candidates={modelCandidates}
        placeholder={t('activity:sddWizard.leaderDefaultPlaceholder')}
        resetLabel={t('activity:sddWizard.useSessionDefault')}
        onPick={(model, provider) => {
          setRunModel(model);
          setRunProvider(provider);
        }}
        onReset={
          runModel
            ? () => {
                setRunModel(undefined);
                setRunProvider(undefined);
              }
            : undefined
        }
      />
      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('activity:sddWizard.fallbackChain')}
      </div>
      <FallbackEditor
        value={runFallbacks}
        candidates={modelCandidates}
        onChange={setRunFallbacks}
      />
      <p className="mt-2 text-[10px] text-muted-foreground">
        {t('activity:sddWizard.appliesToAll')}
      </p>

      {/* Parallelism + isolation */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <label
          htmlFor="sdd-slots"
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t('activity:sddWizard.parallelAgents')}
        </label>
        <input
          id="sdd-slots"
          type="number"
          min={1}
          max={16}
          value={runSlots}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            setRunSlots(Number.isFinite(n) ? Math.min(16, Math.max(1, n)) : 1);
          }}
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-xs outline-none focus:border-primary"
        />
      </div>
      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('activity:sddWizard.isolateWorktrees')}
        </span>
        <input
          type="checkbox"
          checked={runWorktrees}
          onChange={(e) => setRunWorktrees(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
        />
      </label>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {runWorktrees ? t('activity:sddWizard.worktreeOn') : t('activity:sddWizard.worktreeOff')}
      </p>
      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('activity:sddWizard.planDecompose')}
        </span>
        <input
          type="checkbox"
          checked={runPlanDecompose}
          onChange={(e) => setRunPlanDecompose(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
        />
      </label>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {runPlanDecompose
          ? t('activity:sddWizard.planDecomposeOn')
          : t('activity:sddWizard.planDecomposeOff')}
      </p>
    </div>
  );
}
