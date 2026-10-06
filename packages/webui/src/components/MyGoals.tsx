import { useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { useGoalCatalogStore } from '@/stores/goal-catalog-store';

export function MyGoals({
  sessionId,
  onSelect,
  onNew,
}: {
  sessionId?: string | undefined;
  onSelect: (goalId: string) => void;
  onNew: () => void;
}) {
  const { t } = useAppTranslation();
  const goals = useGoalCatalogStore((state) => state.goals);
  const selected = useGoalCatalogStore((state) => state.selectedGoalId);
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const visible = goals.filter(
    (goal) =>
      (!mine || goal.sessionId === sessionId) &&
      `${goal.title} ${goal.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="shrink-0 border-b bg-card/50 p-3" aria-label={t('activity:myGoals.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t('activity:myGoals.title')}</h2>
        <input
          aria-label={t('activity:myGoals.search')}
          placeholder={t('activity:myGoals.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          {t('activity:myGoals.mine')}
        </label>
        <button type="button" onClick={onNew} className="rounded border px-2 py-1 text-xs">
          {t('activity:myGoals.new')}
        </button>
      </div>
      <div className="mt-2 max-h-[min(16rem,35vh)] space-y-2 overflow-y-auto">
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('activity:myGoals.empty')}</p>
        )}
        {visible.map((goal) => (
          <article
            key={goal.id}
            className={`rounded border p-2 text-xs ${goal.id === selected ? 'border-primary' : 'border-border'}`}
          >
            <button
              type="button"
              onClick={() => onSelect(goal.id)}
              className="flex w-full items-start justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="block break-words font-medium">{goal.title}</span>
                <span className="block break-all text-muted-foreground">{goal.id}</span>
              </span>
              <span className="shrink-0">
                {goal.status} · {goal.percentComplete === null ? '—' : `${goal.percentComplete}%`}
              </span>
            </button>
            <p className="mt-1 text-muted-foreground">
              {t('activity:myGoals.counts', {
                tasks: goal.completedTasks,
                totalTasks: goal.totalTasks,
                phases: goal.completedPhases,
                totalPhases: goal.totalPhases,
              })}
            </p>
            <p className="break-all text-muted-foreground">
              {t('activity:myGoals.session')}: {goal.sessionId ?? '—'}
            </p>
            <p>
              {t('activity:myGoals.reachability')}: {t(`activity:myGoals.${goal.reachability}`)} ·{' '}
              {t('activity:myGoals.verification')}: {goal.verification}
            </p>
            {goal.branch && <p className="break-all text-muted-foreground">{goal.branch}</p>}
            {goal.blockers.map((blocker, index) => (
              <p key={`${index}:${blocker}`} className="break-words text-destructive">
                {blocker}
              </p>
            ))}
            {goal.phases.length > 0 && (
              <details className="mt-1">
                <summary>{t('activity:myGoals.phases')}</summary>
                {goal.phases.map((phase) => (
                  <p key={phase.id}>
                    {phase.name}: {phase.status} · {phase.completedTasks}/{phase.totalTasks}
                  </p>
                ))}
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
