import { useAppTranslation } from '@/i18n';
import type { WorktreeDiffSummary } from '@/types';

/** Compact "View changes" result for one worktree checkout (commits ahead + numstat). */
export function WorktreeDiffSummaryView({
  diff,
  maxFiles = 12,
}: {
  diff: WorktreeDiffSummary | null;
  maxFiles?: number;
}): React.ReactElement {
  const { t } = useAppTranslation();
  return (
    <div className="rounded bg-muted/50 p-1.5 text-[10px]">
      {diff === null || diff.files.length === 0 ? (
        <span className="text-muted-foreground">
          {t('activity:worktrees.noUncommitted')}
          {diff && diff.commits > 0
            ? ` · ${t('activity:worktrees.commitsAhead', { count: diff.commits })}`
            : ''}
          .
        </span>
      ) : (
        <>
          <div className="mb-1 text-muted-foreground">
            {diff.commits > 0
              ? `${t('activity:worktrees.commitsAhead', { count: diff.commits })} · `
              : ''}
            <span className="text-success">+{diff.insertions}</span>{' '}
            <span className="text-destructive">−{diff.deletions}</span>
          </div>
          {diff.files.slice(0, maxFiles).map((f) => (
            <div key={f.path} className="truncate font-mono">
              <span className="text-success">+{f.insertions}</span>{' '}
              <span className="text-destructive">−{f.deletions}</span> {f.path}
            </div>
          ))}
          {diff.files.length > maxFiles && (
            <div className="text-muted-foreground">
              {t('activity:worktrees.more', { count: diff.files.length - maxFiles })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
