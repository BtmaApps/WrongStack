import { RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { PageMotif } from '@/components/PageMotif';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

interface ChimeraReviewsHeaderProps {
  sessionList: string[];
  filterSessionId: string;
  setFilterSessionId: (sessionId: string) => void;
  filterLifecycle: string;
  setFilterLifecycle: (lifecycle: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  loading: boolean;
  fetchReports: () => unknown;
}

/** Title plus the session / lifecycle / search filters of the Chimera hub. */
export function ChimeraReviewsHeader({
  sessionList,
  filterSessionId,
  setFilterSessionId,
  filterLifecycle,
  setFilterLifecycle,
  searchQuery,
  setSearchQuery,
  loading,
  fetchReports,
}: ChimeraReviewsHeaderProps) {
  const { t } = useAppTranslation();
  return (
    <div className="ws-page-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border">
      <PageMotif kind="scan" />
      <div className="flex items-center gap-2">
        <span className="ws-page-icon" aria-hidden>
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="leading-none">Chimera Review Hub & Journal</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track agent code reviews, findings, session lineage, and audit event timeline
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Session filter */}
        <select
          value={filterSessionId}
          onChange={(e) => setFilterSessionId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label={t('activity:chimeraReport.filterBySession', {
            defaultValue: 'Filter by session',
          })}
        >
          <option value="">All Sessions ({sessionList.length})</option>
          {sessionList.map((sid) => (
            <option key={sid} value={sid}>
              Session: {sid.length > 16 ? `${sid.slice(0, 16)}…` : sid}
            </option>
          ))}
        </select>

        {/* Lifecycle filter */}
        <select
          value={filterLifecycle}
          onChange={(e) => setFilterLifecycle(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label={t('activity:chimeraReport.filterByStatus', {
            defaultValue: 'Filter by status',
          })}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="actioned">Actioned</option>
          <option value="completed">Completed</option>
          <option value="skipped">Skipped</option>
        </select>

        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search reports..."
            aria-label={t('activity:chimeraReport.searchReportsAria')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-52"
          />
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => fetchReports()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
          title="Refresh reports"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}
