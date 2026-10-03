/**
 * Plan quota in the chat side panel — only what the work in progress draws
 * on: the providers of the open session tabs and the running subagents, and
 * of an OmniRoute gateway only the pool accounts that serve the routed models
 * in use. Everything else is one click away on the Plan Quota page
 * (`provider-quota`), which has the room for every account.
 *
 * The readings come from the shared quota feed (`useQuotaFeed`), which reads
 * the account endpoints — none of them a model call — when the section
 * mounts, every few minutes while it is on screen, and on the refresh button.
 */

import { ChevronRight, Gauge, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useIsFullChrome } from '@/hooks/useChromeLevel';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { openMainView } from '@/lib/view-navigation';
import { cardsInUse, countAccounts } from '../Quota/quota-model';
import { QuotaCardView } from '../Quota/quota-parts';
import { useModelsInUse } from '../Quota/use-models-in-use';
import { useQuotaFeed } from '../Quota/use-quota-feed';

/** The quota section of the chat side panel. */
export function ProviderQuotaPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useAppTranslation();
  const { cards, now, refreshing, refresh, wsConnected } = useQuotaFeed();
  const inUse = useModelsInUse();
  const shown = useMemo(() => cardsInUse(cards, inUse), [cards, inUse]);
  const fullChrome = useIsFullChrome();

  // Calm chrome: with no quota-reporting provider configured there is nothing
  // to read here — the Plan Quota page (activity bar) still explains why.
  if (!fullChrome && cards.length === 0 && !embedded) return null;

  return (
    <div className={cn('space-y-1.5 px-3 pb-2.5', !embedded && 'border-b border-border/70 pt-2.5')}>
      <div className="flex items-center justify-between">
        {!embedded && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
            <Gauge className="h-3 w-3" />
            {t('activity:quotaPanel.title')}
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={!wsConnected || refreshing}
          title={t('activity:quotaPanel.refreshTitle')}
          aria-label={t('activity:quotaPanel.refresh')}
          className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
        </button>
      </div>
      {cards.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">{t('activity:quotaPanel.none')}</div>
      ) : shown.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          {t('activity:quotaPanel.noneInUse')}
        </div>
      ) : (
        shown.map((card) => <QuotaCardView key={card.providerId} card={card} now={now} />)
      )}
      {cards.length > 0 && (
        <button
          type="button"
          onClick={() => openMainView('provider-quota')}
          className="flex w-full items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <span>{t('activity:quotaPanel.viewAll', { count: countAccounts(cards) })}</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
