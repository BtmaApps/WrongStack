/**
 * The two non-comparison faces of {@link RefinePanel}: the in-flight card
 * shown while a refinement runs, and the recovery card shown when it fails.
 */
import { AlertTriangle, Edit3, Loader2, RotateCw, Send, Sparkles, X } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { Button } from './ui/button';

interface RefineStateCardProps {
  original: string;
  /** Provider id of the model running the refinement (e.g. "openai"). */
  provider?: string | undefined;
  /** Model name running the refinement (e.g. "gpt-4o"). */
  model?: string | undefined;
  onClose: () => void;
  onDecide: (decision: 'original' | 'edit') => void;
}

// ── In-flight state ────────────────────────────────────────────────────
// Shown while a first attempt or an extended retry is running. Keeps the
// user's message visible (it lives only in the panel) and lets them bail out.
export function RefineInFlightCard({
  original,
  provider,
  model,
  onClose,
  onDecide,
}: RefineStateCardProps) {
  const { t } = useAppTranslation();
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden animate-message">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium">
            {t('activity:refine.refining')}
            {provider && model ? (
              <span className="text-muted-foreground font-normal">
                {' '}
                on {provider}/{model}
              </span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={t('activity:refine.cancelTitle')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4">
        <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          {original.length > 200 ? original.slice(0, 200) + '…' : original}
        </div>
      </div>
      <div className="flex justify-end gap-2 px-4 py-2 border-t bg-muted/20">
        <Button variant="ghost" size="sm" onClick={() => onDecide('original')} className="text-xs">
          <Send className="h-3 w-3 mr-1" />
          {t('activity:refine.cancelRefineSendOriginal')}
        </Button>
      </div>
    </div>
  );
}

// ── Failure / recovery state ───────────────────────────────────────────
export function RefineFailedCard({
  original,
  provider,
  model,
  error,
  fallbackRef,
  onRetry,
  onRetryFallback,
  onPickModel,
  onClose,
  onDecide,
}: RefineStateCardProps & {
  /** Failure reason shown in the recovery state. */
  error?: string | undefined;
  /** One-key "retry with another model" offer (provider/model), if any. */
  fallbackRef?: string | undefined;
  /** Retry on the same model with more time. */
  onRetry?: (() => void) | undefined;
  /** Retry on the configured fallback model ref. */
  onRetryFallback?: ((ref: string) => void) | undefined;
  /** Open the model picker to retry on a chosen provider/model. */
  onPickModel?: (() => void) | undefined;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="rounded-lg border border-destructive/40 bg-card text-card-foreground shadow-sm overflow-hidden animate-message">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-destructive/10">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium">
            {t('activity:refine.failedHeader')}
            {provider && model ? (
              <span className="text-muted-foreground font-normal">
                {' '}
                on {provider}/{model}
              </span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={t('activity:refine.cancelTitle')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {error && (
          <div className="text-xs text-destructive/90 bg-destructive/5 rounded-md px-3 py-2 break-words">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {t('activity:refine.original')}
          </div>
          <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            {original.length > 200 ? original.slice(0, 200) + '…' : original}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t bg-muted/20">
        <Button variant="ghost" size="sm" onClick={() => onDecide('original')} className="text-xs">
          {t('activity:refine.sendAsIs')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDecide('edit')} className="text-xs">
          <Edit3 className="h-3 w-3 mr-1" />
          {t('activity:refine.edit')}
        </Button>
        {onPickModel && (
          <Button variant="outline" size="sm" onClick={onPickModel} className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            {t('activity:refine.pickModel')}
          </Button>
        )}
        {fallbackRef && onRetryFallback && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetryFallback(fallbackRef)}
            className="text-xs"
            title={fallbackRef}
          >
            <RotateCw className="h-3 w-3 mr-1" />
            {t('activity:refine.retryFallback', { model: fallbackRef })}
          </Button>
        )}
        {onRetry && (
          <Button size="sm" onClick={onRetry} className="text-xs">
            <RotateCw className="h-3 w-3 mr-1" />
            {t('activity:refine.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
