/**
 * Suspense fallback for lazy-loaded views — a quiet centered spinner so the
 * first open of the editor / terminal / office map doesn't look frozen.
 */
import { useAppTranslation } from '@/i18n';

export function PanelSuspense({ label }: { label?: string }): React.ReactElement {
  const { t } = useAppTranslation();
  return (
    <div
      role="status"
      className="flex flex-1 min-h-0 min-w-0 items-center justify-center bg-background p-4 text-muted-foreground"
    >
      <div className="flex flex-col items-center gap-3">
        <div aria-hidden="true" className="h-1 w-16 animate-pulse bg-primary/60" />
        <span className="text-xs">{label ?? t('common:action.loading')}</span>
      </div>
    </div>
  );
}
