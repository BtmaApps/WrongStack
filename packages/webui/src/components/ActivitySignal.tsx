import { cn } from '@/lib/utils';

type ActivityState = 'running' | 'success' | 'error' | 'pending';

/** Small live-state vector. Its accessible label stays with the owning control. */
export function ActivitySignal({ state, className }: { state: ActivityState; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('ws-activity-signal', className)}
      data-state={state}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {state === 'running' ? (
        <g fill="currentColor" className="ws-signal-wave">
          <rect x="4" y="6" width="3" height="12" rx="1.5" />
          <rect x="10.5" y="3" width="3" height="18" rx="1.5" />
          <rect x="17" y="6" width="3" height="12" rx="1.5" />
        </g>
      ) : state === 'success' ? (
        <g
          className="ws-signal-result"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="8.5" opacity="0.35" />
          <path d="m7.5 12 3 3 6-6" />
        </g>
      ) : state === 'error' ? (
        <g
          className="ws-signal-result"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="5" opacity="0.4" />
          <path d="m9 9 6 6m0-6-6 6" />
        </g>
      ) : (
        <g fill="currentColor" className="ws-signal-pending">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </g>
      )}
    </svg>
  );
}
