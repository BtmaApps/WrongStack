import type { DeadCodeCategory, DeadCodeFinding } from '@wrongstack/tools/dead-code';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  CATEGORY_KEY,
  CATEGORY_ORDER,
  CONFIDENCE_CLASS,
  type ConfidenceFilter,
  PAGE,
} from './dead-code-panel-model.js';

/** Category chips, confidence/search/fixable filters, and "select visible". */
export function DeadCodeFilters({
  category,
  setCategory,
  categoryCounts,
  minConfidence,
  setMinConfidence,
  query,
  setQuery,
  onlyFixable,
  setOnlyFixable,
  filtered,
  toggle,
}: {
  category: DeadCodeCategory | 'all';
  setCategory: (category: DeadCodeCategory | 'all') => void;
  categoryCounts: ReadonlyMap<DeadCodeCategory, number>;
  minConfidence: ConfidenceFilter;
  setMinConfidence: (value: ConfidenceFilter) => void;
  query: string;
  setQuery: (value: string) => void;
  onlyFixable: boolean;
  setOnlyFixable: (value: boolean) => void;
  filtered: readonly DeadCodeFinding[];
  toggle: (ids: string[], on: boolean) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
          {t('activity:deadCode.filterAll')} (
          {[...categoryCounts.values()].reduce((a, b) => a + b, 0)})
        </FilterChip>
        {CATEGORY_ORDER.filter((c) => categoryCounts.has(c)).map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {t(`activity:deadCode.categories.${CATEGORY_KEY[c]}`)} ({categoryCounts.get(c)})
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <select
          value={minConfidence}
          onChange={(e) => setMinConfidence(e.target.value as ConfidenceFilter)}
          aria-label={t('activity:deadCode.confidenceLabel')}
          className="h-8 border border-input bg-card px-2"
        >
          <option value="high">{t('activity:deadCode.confidenceHigh')}</option>
          <option value="medium">{t('activity:deadCode.confidenceMediumUp')}</option>
          <option value="low">{t('activity:deadCode.confidenceAll')}</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('activity:deadCode.searchPlaceholder')}
          aria-label={t('activity:deadCode.searchPlaceholder')}
          className="h-8 w-56 border border-input bg-card px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyFixable}
            onChange={(e) => setOnlyFixable(e.target.checked)}
          />
          {t('activity:deadCode.onlyFixable')}
        </label>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={() =>
            toggle(
              filtered.filter((f) => f.fix).map((f) => f.id),
              true,
            )
          }
        >
          {t('activity:deadCode.selectVisible', {
            count: filtered.filter((f) => f.fix).length,
          })}
        </button>
      </div>
    </>
  );
}

/** Findings grouped by file with per-file and per-finding selection. */
export function DeadCodeFindingsList({
  filtered,
  groups,
  visible,
  selected,
  toggle,
  setVisible,
}: {
  filtered: readonly DeadCodeFinding[];
  groups: ReadonlyArray<{ file: string; items: DeadCodeFinding[] }>;
  visible: number;
  selected: ReadonlySet<string>;
  toggle: (ids: string[], on: boolean) => void;
  setVisible: (update: (v: number) => number) => void;
}) {
  const { t } = useAppTranslation();
  return filtered.length === 0 ? (
    <div className="py-8 text-center text-sm text-muted-foreground">
      {t('activity:deadCode.noFindings')}
    </div>
  ) : (
    <div className="flex flex-col border border-border">
      {groups.map((g) => {
        const fixable = g.items.filter((f) => f.fix).map((f) => f.id);
        const allOn = fixable.length > 0 && fixable.every((id) => selected.has(id));
        return (
          <div key={g.file} className="border-b border-border last:border-b-0">
            <label className="flex items-center gap-2 bg-card/60 px-3 py-1.5 font-mono text-xs">
              <input
                type="checkbox"
                checked={allOn}
                disabled={fixable.length === 0}
                onChange={(e) => toggle(fixable, e.target.checked)}
                aria-label={g.file}
              />
              <span className="truncate">{g.file}</span>
              <span className="ml-auto text-muted-foreground">{g.items.length}</span>
            </label>
            {g.items.map((f) => (
              <label
                key={f.id}
                className={cn(
                  'flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-accent/40',
                  !f.fix && 'cursor-default',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(f.id)}
                  onChange={(e) => toggle([f.id], e.target.checked)}
                  aria-label={`${f.category} ${f.name ?? f.file}`}
                />
                <span
                  className={cn(
                    'shrink-0 border px-1 text-[10px] uppercase',
                    CONFIDENCE_CLASS[f.confidence],
                  )}
                >
                  {t(`activity:deadCode.confidence.${f.confidence}`)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {t(`activity:deadCode.categories.${CATEGORY_KEY[f.category]}`)}
                  </span>
                  {f.name && (
                    <code className="ml-1.5 text-foreground">
                      {f.name}
                      {f.kind && <span className="text-muted-foreground"> · {f.kind}</span>}
                    </code>
                  )}
                  {f.line !== undefined && (
                    <span className="ml-1.5 text-muted-foreground">:{f.line}</span>
                  )}
                  <span className="block text-muted-foreground">{f.reason}</span>
                  {!f.fix && f.manualReason && (
                    <span className="block text-warning">
                      {t('activity:deadCode.manual')}: {f.manualReason}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        );
      })}
      {filtered.length > visible && (
        <button
          type="button"
          className="px-3 py-2 text-xs text-primary hover:bg-accent/40"
          onClick={() => setVisible((v) => v + PAGE)}
        >
          {t('activity:deadCode.showMore', { count: filtered.length - visible })}
        </button>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'border px-2 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/40',
      )}
    >
      {children}
    </button>
  );
}
