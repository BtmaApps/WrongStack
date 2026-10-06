import { Button } from '@/components/ui/button';
import { useAppTranslation } from '@/i18n';

/** Sticky bar for the current selection: preview, confirm/apply, send to agent, clear. */
export function DeadCodeSelectionBar({
  confirming,
  hasPlan,
  planEdits,
  planDeletes,
  verify,
  setVerify,
  applying,
  previewing,
  selectedCount,
  fixableCount,
  onApply,
  onCancelConfirm,
  onPreview,
  onConfirm,
  onSendToAgent,
  onClearSelection,
}: {
  confirming: boolean;
  hasPlan: boolean;
  planEdits: number;
  planDeletes: number;
  verify: boolean;
  setVerify: (value: boolean) => void;
  applying: boolean;
  previewing: boolean;
  selectedCount: number;
  fixableCount: number;
  onApply: () => void;
  onCancelConfirm: () => void;
  onPreview: () => void;
  onConfirm: () => void;
  onSendToAgent: () => void;
  onClearSelection: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
      {confirming && hasPlan ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {t('activity:deadCode.confirmBody', { edits: planEdits, deletes: planDeletes })}{' '}
            {verify ? t('activity:deadCode.confirmVerify') : t('activity:deadCode.confirmNoVerify')}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="destructive" onClick={onApply} disabled={applying}>
              {t('activity:deadCode.confirmApply')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelConfirm}>
              {t('activity:deadCode.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {t('activity:deadCode.selected', {
              count: selectedCount,
              fixable: fixableCount,
            })}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
            {t('activity:deadCode.verifyTypecheck')}
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onPreview}
              disabled={previewing || applying || fixableCount === 0}
            >
              {previewing ? t('activity:deadCode.previewing') : t('activity:deadCode.preview')}
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={applying || fixableCount === 0}>
              {applying ? t('activity:deadCode.applying') : t('activity:deadCode.apply')}
            </Button>
            <Button size="sm" variant="secondary" onClick={onSendToAgent} disabled={applying}>
              {t('activity:deadCode.sendToAgent')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection} disabled={applying}>
              {t('activity:deadCode.clearSelection')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
