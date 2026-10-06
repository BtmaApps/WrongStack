import type {
  DeadCodeApplyResult,
  DeadCodeFinding,
  DeadCodePlan,
} from '@wrongstack/tools/dead-code';
import { Button } from '@/components/ui/button';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { BackupInfo } from './dead-code-panel-model.js';

/** Outcome of the last apply: rollback/undo controls, exclusions, verify output. */
export function DeadCodeApplyResultCard({
  result,
  byId,
  onUndo,
  onClose,
}: {
  result: DeadCodeApplyResult;
  byId: ReadonlyMap<string, DeadCodeFinding>;
  onUndo: (backupId: string) => void;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div
      className={cn(
        'border px-3 py-2 text-sm',
        result.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>
          {result.ok
            ? t('activity:deadCode.applied', {
                changed: result.changed.length,
                deleted: result.deleted.length,
              })
            : t('activity:deadCode.rolledBack')}
        </b>
        <div className="flex gap-2">
          {result.ok && result.backupId && (
            <Button size="sm" variant="outline" onClick={() => onUndo(result.backupId!)}>
              {t('activity:deadCode.undo')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('activity:deadCode.close')}
          </Button>
        </div>
      </div>
      {result.excluded.length > 0 && (
        <div className="mt-1 text-xs">
          {t('activity:deadCode.excluded', { count: result.excluded.length })}
          <ul className="ml-4 list-disc text-muted-foreground">
            {result.excluded.slice(0, 20).map((x) => (
              <li key={x.id}>
                {byId.get(x.id)?.name ?? x.id}: {x.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.verify.map((v) => (
        <div key={`${v.package}-${v.command}`} className="mt-1 text-xs">
          {v.ok ? '✓' : '✗'} {v.package} · <code>{v.command}</code> ·{' '}
          {(v.durationMs / 1000).toFixed(1)}s
          {!v.ok && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap bg-card p-2 font-mono text-[11px]">
              {v.output.slice(-3000)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

/** Exact diff preview of a planned apply (nothing written yet). */
export function DeadCodePlanPreview({
  plan,
  byId,
  planEdits,
  planDeletes,
  onClose,
}: {
  plan: DeadCodePlan;
  byId: ReadonlyMap<string, DeadCodeFinding>;
  planEdits: number;
  planDeletes: number;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 text-sm">
        <b>{t('activity:deadCode.previewTitle', { edits: planEdits, deletes: planDeletes })}</b>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('activity:deadCode.close')}
        </Button>
      </div>
      {plan.changes.length === 0 && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {t('activity:deadCode.previewEmpty')}
        </div>
      )}
      {plan.changes.map((c) => (
        <details
          key={c.file}
          className="border-b border-border last:border-b-0"
          open={plan.changes.length <= 8}
        >
          <summary className="cursor-pointer px-3 py-1.5 font-mono text-xs">
            {c.action === 'delete' ? '🗑 ' : '✎ '}
            {c.file}
          </summary>
          <DiffView diff={c.diff} />
        </details>
      ))}
      {(plan.skipped.length > 0 || plan.notes.length > 0) && (
        <div className="space-y-1 px-3 py-2 text-xs">
          {plan.skipped.length > 0 && (
            <div>
              <b>{t('activity:deadCode.skipped', { count: plan.skipped.length })}</b>
              <ul className="ml-4 list-disc text-muted-foreground">
                {plan.skipped.slice(0, 30).map((s) => (
                  <li key={s.id}>
                    {byId.get(s.id)?.name ?? byId.get(s.id)?.file ?? s.id}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.notes.length > 0 && (
            <div>
              <b>{t('activity:deadCode.notes')}</b>
              <ul className="ml-4 list-disc text-muted-foreground">
                {plan.notes.slice(0, 30).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Backup list with per-backup undo, plus the force-undo prompt on conflicts. */
export function DeadCodeBackupsSection({
  backups,
  undoState,
  onUndo,
  onCancelUndo,
}: {
  backups: readonly BackupInfo[];
  undoState: { id: string; conflicts: string[] } | null;
  onUndo: (backupId: string, force?: boolean) => void;
  onCancelUndo: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <>
      {backups.length > 0 && (
        <details className="border border-border text-xs">
          <summary className="cursor-pointer bg-card/60 px-3 py-1.5">
            {t('activity:deadCode.backups', { count: backups.length })}
          </summary>
          {backups.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-1.5"
            >
              <span className="font-mono">{new Date(b.createdAt).toLocaleString()}</span>
              <span className="text-muted-foreground">
                {t('activity:deadCode.backupFiles', {
                  files: b.files,
                  findings: b.findingIds.length,
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7"
                onClick={() => onUndo(b.id)}
              >
                {t('activity:deadCode.undo')}
              </Button>
            </div>
          ))}
        </details>
      )}
      {undoState && (
        <div className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {t('activity:deadCode.undoConflicts', { count: undoState.conflicts.length })}
          <ul className="ml-4 list-disc font-mono">
            {undoState.conflicts.slice(0, 20).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => onUndo(undoState.id, true)}>
              {t('activity:deadCode.forceUndo')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelUndo}>
              {t('activity:deadCode.cancel')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-96 overflow-auto bg-card px-3 py-2 font-mono text-[11px] leading-snug">
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={cn(
            line.startsWith('+') && !line.startsWith('+++') && 'bg-success/10 text-success',
            line.startsWith('-') && !line.startsWith('---') && 'bg-destructive/10 text-destructive',
            line.startsWith('@@') && 'text-info',
          )}
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}
