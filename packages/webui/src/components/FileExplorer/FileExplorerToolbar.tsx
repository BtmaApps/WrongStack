import { ArrowDownWideNarrow, Folders, Minimize2, Search } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/** Expand/collapse-all, sort toggle and filename search above the file tree. */
export function FileExplorerToolbar({
  dirCount,
  sortBySize,
  searchQuery,
  onExpandAll,
  onCollapseAll,
  onToggleSort,
  onSearchChange,
}: {
  dirCount: number;
  sortBySize: boolean;
  searchQuery: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onToggleSort: () => void;
  onSearchChange: (query: string) => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="flex items-center gap-0.5 px-2 py-0.5 border-b shrink-0">
      <button
        type="button"
        onClick={onExpandAll}
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
          'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
        )}
        title={t('activity:fileExplorer.expandAllTitle')}
      >
        <Folders className="h-3 w-3" />
        <span>{t('activity:fileExplorer.expandAll')}</span>
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
          'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
        )}
        title={t('activity:fileExplorer.collapseAllTitle')}
      >
        <Minimize2 className="h-3 w-3" />
        <span>{t('activity:fileExplorer.collapse')}</span>
      </button>
      <button
        type="button"
        onClick={onToggleSort}
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
          'hover:bg-muted/60',
          sortBySize ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
        title={
          sortBySize
            ? t('activity:fileExplorer.sortByNameTitle')
            : t('activity:fileExplorer.sortBySizeTitle')
        }
      >
        <ArrowDownWideNarrow className="h-3 w-3" />
        <span>
          {sortBySize
            ? t('activity:fileExplorer.sortBySize')
            : t('activity:fileExplorer.sortByName')}
        </span>
      </button>
      <div className="relative flex items-center">
        <Search className="absolute left-1 h-3 w-3 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('activity:fileExplorer.searchPlaceholder')}
          className="w-28 rounded bg-muted/40 px-1 py-0.5 pl-4 text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:w-40 focus:bg-muted/70 focus:ring-1 focus:ring-primary/30 transition-all"
          aria-label={t('activity:fileExplorer.search')}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-0.5 text-muted-foreground/60 hover:text-foreground text-[10px]"
            aria-label={t('common:action.clear')}
          >
            ✕
          </button>
        )}
      </div>
      <span className="ml-auto text-[9px] text-muted-foreground/70 tabular-nums">
        {t('activity:fileExplorer.folders', { count: dirCount })}
      </span>
    </div>
  );
}
