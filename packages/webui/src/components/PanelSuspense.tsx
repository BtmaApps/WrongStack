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
        <svg
          className="ws-loading-art"
          viewBox="0 0 96 40"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="16" y="14" width="16" height="16" rx="4" fill="currentColor" opacity="0.4" />
          <rect x="40" y="10" width="16" height="16" rx="4" fill="currentColor" opacity="0.7" />
          <rect x="64" y="14" width="16" height="16" rx="4" fill="currentColor" />
        </svg>
        <span className="text-xs">{label ?? t('common:action.loading')}</span>
      </div>
    </div>
  );
}
