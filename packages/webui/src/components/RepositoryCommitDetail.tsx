import {
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  FileCode2,
  GitMerge,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  COMMIT_DETAIL_PANEL_CLASS,
  type DetailPayload,
  type HistoryCommit,
  initials,
  shortHash,
} from './repository-history-model';

/** Branch/tag badge tone for a decorated ref (`tag: v1`, `origin/main`, `main`). */
export function refTone(ref: string): string {
  if (ref.startsWith('tag: ')) return 'border-amber-400/35 bg-amber-400/10 text-amber-500';
  if (ref.includes('/')) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-500';
  return 'border-violet-400/35 bg-violet-400/12 text-violet-400';
}
export function CommitDetail({
  commit,
  detail,
  loading,
  onOpenFile,
}: {
  commit: HistoryCommit | null;
  detail: DetailPayload | null;
  loading: boolean;
  onOpenFile: (
    file: NonNullable<DetailPayload['files']>[number],
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!commit) {
    return (
      <section className="ws-commit-detail flex h-[34%] min-h-[210px] shrink-0 items-center justify-center border-t border-border/70 bg-card/30 p-6 text-center text-xs text-muted-foreground">
        Select a commit to inspect its files and metadata.
      </section>
    );
  }
  const files = detail?.files ?? [];
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const deleted = files.reduce((sum, file) => sum + file.deleted, 0);
  const body = detail?.body?.split(/\r?\n/).slice(1).join('\n').trim();
  return (
    <section className={COMMIT_DETAIL_PANEL_CLASS}>
      <div className="ws-commit-metadata min-w-0 w-full max-w-none shrink-0 overflow-y-auto border-b border-border/70 px-5 py-4 sm:w-[34%] sm:min-w-[250px] sm:max-w-[440px] sm:border-b-0 sm:border-r">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5 text-primary" /> Commit details
        </div>
        <h2 className="mt-3 break-words text-sm font-semibold leading-5 text-foreground">
          {commit.subject}
        </h2>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-[10px] font-bold text-primary">
            {initials(commit.author)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{commit.author}</div>
            <div className="truncate text-[10px] text-muted-foreground">{commit.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(commit.hash);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="mt-4 flex w-full items-center justify-between rounded-lg border border-border/70 bg-background/55 px-3 py-2 font-mono text-[11px] text-muted-foreground hover:border-primary/35 hover:text-foreground"
        >
          <span>{shortHash(commit.hash)}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-border/70">
          <div className="border-r border-border/70 p-3">
            <div className="text-lg font-semibold tabular-nums">{files.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Files</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-xs">
              <span className="text-success">+{added}</span>{' '}
              <span className="text-destructive">-{deleted}</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Lines
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(commit.authoredAt),
          )}
        </div>
        {commit.parents.length > 1 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-violet-400">
            <GitMerge className="h-3.5 w-3.5" />
            Merge of {commit.parents.length} parents
          </div>
        )}
        {body && (
          <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border/60 bg-background/45 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
            {body}
          </p>
        )}
        {commit.refs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {commit.refs.map((ref) => (
              <span
                key={ref}
                className={cn('rounded-md border px-1.5 py-0.5 text-[9px]', refTone(ref))}
              >
                {ref.replace(/^tag: /, '')}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="ws-commit-files min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Changed files
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading changes…
          </div>
        ) : detail?.error ? (
          <div className="py-5 text-xs text-destructive">{detail.error}</div>
        ) : (
          <div className="mt-2 space-y-1">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={(event) => onOpenFile(file, event.currentTarget)}
                className="group w-full rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.055]"
              >
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1" title={file.path}>
                    <span className="block truncate text-xs font-medium">
                      {file.path.split('/').at(-1)}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {file.path}
                    </span>
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <div className="mt-1 pl-5 font-mono text-[10px]">
                  <span className="text-success">+{file.added}</span>
                  <span className="ml-2 text-destructive">-{file.deleted}</span>
                </div>
              </button>
            ))}
            {files.length === 0 && (
              <div className="py-5 text-xs text-muted-foreground">No file changes reported.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
