import { ArrowDown, ChevronRight, GitCommitHorizontal, GitMerge, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { showPanel } from '@/lib/view-navigation';
import { useConfigStore, useGitChangesStore } from '@/stores';
import { CommitDetail, refTone } from './RepositoryCommitDetail';
import { RepositoryFileDiffDialog } from './RepositoryFileDiffDialog';
import { RepositoryHistoryHeader } from './RepositoryHistoryHeader';
import { RepositoryRefList } from './RepositoryRefList';
import {
  type DetailPayload,
  type FileDiffPayload,
  type GraphLayout,
  type HistoryCommit,
  type HistoryPayload,
  initials,
  LANE_GAP,
  layoutCommitGraph,
  ROW_HEIGHT,
  relativeTime,
  shortHash,
} from './repository-history-model';

export { COMMIT_DETAIL_PANEL_CLASS, layoutCommitGraph } from './repository-history-model';

const LANE_COLORS = ['#9b87f5', '#37c9a2', '#f2b95f', '#67a7ff', '#e879b8', '#f07178'];

function GraphCanvas({ commits, layout }: { commits: HistoryCommit[]; layout: GraphLayout }) {
  const width = 22 + layout.laneCount * LANE_GAP;
  return (
    <svg
      aria-label="Commit topology"
      className="pointer-events-none absolute inset-y-0 left-0"
      width={width}
      height={commits.length * ROW_HEIGHT}
      viewBox={`0 0 ${width} ${commits.length * ROW_HEIGHT}`}
    >
      {layout.edges.map((edge, index) => {
        const x1 = 14 + edge.fromLane * LANE_GAP;
        const x2 = 14 + edge.toLane * LANE_GAP;
        const y1 = edge.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const bend = Math.min(18, Math.max(8, (y2 - y1) * 0.35));
        return (
          <path
            key={`${edge.fromRow}-${edge.toRow}-${index}`}
            d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`}
            fill="none"
            stroke={LANE_COLORS[edge.fromLane % LANE_COLORS.length]}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.9"
          />
        );
      })}
      {commits.map((commit, row) => {
        const lane = layout.lanes[row] ?? 0;
        const merge = commit.parents.length > 1;
        return (
          <g key={commit.hash}>
            <circle
              cx={14 + lane * LANE_GAP}
              cy={row * ROW_HEIGHT + ROW_HEIGHT / 2}
              r={merge ? 5 : 4}
              fill="hsl(var(--background))"
              stroke={LANE_COLORS[lane % LANE_COLORS.length]}
              strokeWidth={merge ? 2.5 : 2}
            />
            {!merge && (
              <circle
                cx={14 + lane * LANE_GAP}
                cy={row * ROW_HEIGHT + ROW_HEIGHT / 2}
                r="1.5"
                fill={LANE_COLORS[lane % LANE_COLORS.length]}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
export function RepositoryHistoryView() {
  const { client } = useWebSocket();
  const connected = useConfigStore((state) => state.wsConnected);
  const changedFiles = useGitChangesStore((state) => state.files);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [activeRef, setActiveRef] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fileDiff, setFileDiff] = useState<FileDiffPayload | null>(null);
  const [fileDiffOpen, setFileDiffOpen] = useState(false);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const selectedHashRef = useRef<string | null>(null);
  const fileDiffTargetRef = useRef<string | null>(null);
  const fileDiffTriggerRef = useRef<HTMLButtonElement | null>(null);
  selectedHashRef.current = selectedHash;

  const requestHistory = useCallback(
    (ref: string, skip = 0) => {
      if (!client || !connected) return;
      setLoading(true);
      client.getGitHistory({ ...(ref ? { ref } : {}), limit: 160, skip });
      client.getGitChanges();
    },
    [client, connected],
  );

  useEffect(() => {
    if (!client) return;
    const offHistory = client.on('git.history', (message) => {
      setHistory((previous) =>
        message.payload.skip > 0 && previous
          ? {
              ...message.payload,
              commits: [...previous.commits, ...message.payload.commits],
              refs: previous.refs,
            }
          : message.payload,
      );
      setLoading(false);
      const first = message.payload.commits[0]?.hash ?? null;
      setSelectedHash((current) =>
        message.payload.skip > 0
          ? current
          : current && message.payload.commits.some((commit) => commit.hash === current)
            ? current
            : first,
      );
    });
    const offDetail = client.on('git.commit_detail', (message) => {
      if (message.payload.hash !== selectedHashRef.current) return;
      setDetail(message.payload);
      setDetailLoading(false);
    });
    const offFileDiff = client.on('git.commit_file_diff', (message) => {
      if (`${message.payload.hash}:${message.payload.path}` !== fileDiffTargetRef.current) return;
      setFileDiff(message.payload);
      setFileDiffLoading(false);
    });
    requestHistory('');
    return () => {
      offHistory();
      offDetail();
      offFileDiff();
    };
  }, [client, requestHistory]);

  useEffect(() => {
    if (!selectedHash || !client) return;
    setDetail(null);
    setDetailLoading(true);
    client.getGitCommitDetail(selectedHash);
  }, [client, selectedHash]);

  const visibleCommits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return history?.commits ?? [];
    return (history?.commits ?? []).filter((commit) =>
      `${commit.subject} ${commit.author} ${commit.email} ${commit.hash} ${commit.refs.join(' ')}`
        .toLowerCase()
        .includes(needle),
    );
  }, [history?.commits, query]);
  const layout = useMemo(() => layoutCommitGraph(visibleCommits), [visibleCommits]);
  const graphWidth = 22 + layout.laneCount * LANE_GAP;
  const selected = history?.commits.find((commit) => commit.hash === selectedHash) ?? null;
  const insights = useMemo(() => {
    const commits = history?.commits ?? [];
    return {
      commits: commits.length,
      contributors: new Set(commits.map((commit) => commit.email || commit.author)).size,
      merges: commits.filter((commit) => commit.parents.length > 1).length,
      branches: (history?.refs ?? []).filter((ref) => ref.kind !== 'tag').length,
    };
  }, [history]);

  const selectRef = (ref: string) => {
    setActiveRef(ref);
    setSelectedHash(null);
    setDetail(null);
    requestHistory(ref);
  };
  const moveSelection = (direction: number) => {
    if (visibleCommits.length === 0) return;
    const index = Math.max(
      0,
      visibleCommits.findIndex((commit) => commit.hash === selectedHash),
    );
    setSelectedHash(
      visibleCommits[Math.max(0, Math.min(visibleCommits.length - 1, index + direction))]?.hash ??
        null,
    );
  };
  const openCommitFile = (
    file: NonNullable<DetailPayload['files']>[number],
    trigger: HTMLButtonElement,
  ) => {
    if (!client || !selectedHash) return;
    fileDiffTriggerRef.current = trigger;
    fileDiffTargetRef.current = `${selectedHash}:${file.path}`;
    setFileDiff(null);
    setFileDiffLoading(true);
    setFileDiffOpen(true);
    client.getGitCommitFileDiff(selectedHash, file.path, file.previousPath);
  };

  return (
    <div
      className="ws-history-view relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_48%_-20%,hsl(var(--primary)/0.10),transparent_42%),hsl(var(--background))]"
      data-testid="repository-history-view"
    >
      <div className="ws-history-browser flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <RepositoryRefList refs={history?.refs ?? []} activeRef={activeRef} onSelect={selectRef} />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <RepositoryHistoryHeader
            currentBranch={history?.currentBranch}
            loading={loading}
            onRefresh={() => requestHistory(activeRef)}
            query={query}
            setQuery={setQuery}
            activeRef={activeRef}
            refs={history?.refs}
            onSelectRef={selectRef}
          />

          <div className="grid h-10 shrink-0 grid-cols-4 divide-x divide-border/60 border-b border-border/70 bg-card/20">
            {[
              ['Commits', insights.commits],
              ['Branches', insights.branches],
              ['Contributors', insights.contributors],
              ['Merges', insights.merges],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-center gap-2 px-2">
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {value}
                </span>
                <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {changedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => showPanel('changes')}
              className="group flex h-10 shrink-0 items-center gap-3 border-b border-border/70 bg-primary/[0.055] px-4 text-left text-xs hover:bg-primary/[0.09]"
            >
              <span className="h-2 w-2 animate-pulse rounded-full border border-primary bg-background" />
              <span className="font-medium">Working changes</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {changedFiles.length}
              </span>
              <span className="text-muted-foreground">Your next chapter starts here</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          )}

          <div className="ws-history-columns grid h-7 shrink-0 grid-cols-[minmax(0,1fr)_120px_82px_48px] items-center border-b border-border/70 bg-muted/20 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:grid-cols-[minmax(0,1fr)_160px_92px_58px]">
            <span className="truncate" style={{ paddingLeft: graphWidth + 10 }}>
              Graph / commit message
            </span>
            <span>Author</span>
            <span>Commit</span>
            <span>When</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading && !history ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Mapping repository history…
              </div>
            ) : history?.error ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-destructive">
                {history.error}
              </div>
            ) : visibleCommits.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <GitCommitHorizontal className="h-7 w-7 opacity-45" />
                No commits match this view.
              </div>
            ) : (
              <div
                className="relative min-w-[700px]"
                style={{ height: visibleCommits.length * ROW_HEIGHT }}
              >
                <GraphCanvas commits={visibleCommits} layout={layout} />
                {visibleCommits.map((commit, row) => {
                  const active = commit.hash === selectedHash;
                  return (
                    <button
                      key={commit.hash}
                      type="button"
                      onClick={() => setSelectedHash(commit.hash)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'j') {
                          event.preventDefault();
                          moveSelection(1);
                        }
                        if (event.key === 'ArrowUp' || event.key === 'k') {
                          event.preventDefault();
                          moveSelection(-1);
                        }
                      }}
                      className={cn(
                        'ws-history-columns absolute left-0 grid w-full grid-cols-[minmax(0,1fr)_120px_82px_48px] items-center border-b border-border/45 pr-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_160px_92px_58px]',
                        active
                          ? 'bg-primary/[0.075] shadow-[inset_2px_0_hsl(var(--primary))]'
                          : 'hover:bg-muted/35',
                      )}
                      style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                    >
                      <div
                        className="flex min-w-0 items-center gap-2"
                        style={{ paddingLeft: graphWidth + 10 }}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {commit.refs.slice(0, 2).map((ref) => (
                            <span
                              key={ref}
                              className={cn(
                                'hidden max-w-[170px] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[9px] font-medium md:inline',
                                refTone(ref),
                              )}
                            >
                              {ref.replace(/^tag: /, '')}
                            </span>
                          ))}
                          <span
                            className={cn(
                              'truncate text-xs',
                              active ? 'font-semibold text-foreground' : 'text-foreground/90',
                            )}
                          >
                            {commit.subject}
                          </span>
                          {commit.parents.length > 1 && (
                            <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
                          {initials(commit.author)}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {commit.author}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {shortHash(commit.hash)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(commit.authoredAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <footer className="flex h-7 shrink-0 items-center border-t border-border/70 bg-card/25 px-4 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Commit
            </span>
            <span className="ml-4 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full border border-emerald-400" />
              Merge
            </span>
            <span className="ml-auto font-mono">
              {visibleCommits.length} commits · topological order
            </span>
            {history?.hasMore && !query && (
              <button
                type="button"
                onClick={() => requestHistory(activeRef, history.commits.length)}
                disabled={loading}
                className="ml-3 rounded border border-border/70 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider hover:border-primary/40 hover:text-primary disabled:opacity-50"
              >
                Load more
              </button>
            )}
            <ArrowDown className="ml-2 h-3 w-3" />
          </footer>
        </section>
      </div>
      <CommitDetail
        commit={selected}
        detail={detail}
        loading={detailLoading}
        onOpenFile={openCommitFile}
      />{' '}
      <RepositoryFileDiffDialog
        open={fileDiffOpen}
        onOpenChange={setFileDiffOpen}
        fileDiff={fileDiff}
        loading={fileDiffLoading}
        triggerRef={fileDiffTriggerRef}
      />
    </div>
  );
}
