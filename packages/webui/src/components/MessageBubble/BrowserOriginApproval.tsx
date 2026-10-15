import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { Button } from '../ui/button';

const ALLOW_ORIGIN_MARKER = 'Allow this project origin with /browser allow ';

/** Extract the exact origin from browser-policy errors emitted by the host. */
export function browserBlockedOrigin(
  toolName: string | undefined,
  result: string | undefined,
  isError: boolean | undefined,
): string | null {
  if (!isError || !toolName?.startsWith('browser_') || !result?.startsWith('browser:')) return null;
  const markerIndex = result.indexOf(ALLOW_ORIGIN_MARKER);
  if (markerIndex < 0) return null;
  const raw = result
    .slice(markerIndex + ALLOW_ORIGIN_MARKER.length)
    .split(/\s/, 1)[0]
    ?.replace(/[),.;]+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === raw
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function BrowserOriginApproval({ origin }: { origin: string }) {
  const { t } = useAppTranslation();
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');

  const allow = () => {
    const client = getWSClient();
    const sent = client.send({
      type: 'browser.policy',
      payload: client.withSession({ args: `allow ${origin}` }),
    });
    setState(sent ? 'sent' : 'error');
  };

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-warning/25 bg-warning/[0.06] px-2.5 py-2">
      <ShieldCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <code
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
        title={origin}
      >
        {origin}
      </code>
      {state === 'idle' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={allow}
        >
          {t('common:action.allow')}
        </Button>
      ) : (
        <span
          className={
            state === 'sent' ? 'shrink-0 text-xs text-success' : 'shrink-0 text-xs text-destructive'
          }
          role="status"
        >
          {state === 'sent' ? t('common:status.inProgress') : t('common:status.error')}
        </span>
      )}
    </div>
  );
}
