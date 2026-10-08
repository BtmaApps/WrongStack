import { Filter, GitBranch, GitFork, RefreshCw, Search } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { HistoryRef } from './repository-history-model';

/** Title bar, current branch, refresh, commit search, and the compact branch filter. */
export function RepositoryHistoryHeader({
  currentBranch,
  loading,
  onRefresh,
  query,
  setQuery,
  activeRef,
  refs,
  onSelectRef,
}: {
  currentBranch: string | undefined;
  loading: boolean;
  onRefresh: () => void;
  query: string;
  setQuery: (value: string) => void;
  activeRef: string;
  refs: readonly HistoryRef[] | undefined;
  onSelectRef: (ref: string) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <header className="shrink-0 border-b border-border/70 bg-card/30 px-4 py-3 backdrop-blur-xl sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_22px_hsl(var(--primary)/0.12)]">
              <GitFork className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                {t('activity:repositoryHistory.title')}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {t('activity:repositoryHistory.tagline')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border/70 bg-background/55 px-2.5 py-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            <GitBranch className="mr-1.5 h-3 w-3 text-primary" />
            {currentBranch || '—'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/55 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            {t('activity:repositoryHistory.refresh')}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('activity:repositoryHistory.searchPlaceholder')}
            aria-label={t('activity:repositoryHistory.searchLabel')}
            className="h-9 w-full rounded-lg border border-border/70 bg-background/60 pl-9 pr-3 text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <label className="relative xl:hidden">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label={t('activity:repositoryHistory.filterBranchesLabel')}
            value={activeRef}
            onChange={(event) => onSelectRef(event.target.value)}
            className="h-9 max-w-[190px] appearance-none rounded-lg border border-border/70 bg-background/60 pl-8 pr-7 text-xs outline-none"
          >
            <option value="">{t('activity:repositoryHistory.allBranches')}</option>
            {refs?.map((ref) => (
              <option key={ref.name} value={ref.name}>
                {ref.shortName}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
