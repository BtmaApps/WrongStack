import { useAppTranslation } from '@/i18n';
import type { SageEntry } from '@/types';
import type { MemoryInjectorTraceMemory } from '@/stores/memory-injector-store';

export function MemoryValidity({ validity, revision, review }: {
  validity: SageEntry['validity']; revision?: number | undefined;
  review?: MemoryInjectorTraceMemory['validityReview'];
}) {
  const { t } = useAppTranslation();
  if (!validity) return null;
  const matching = revision !== undefined && review?.observedRevision === revision ? review : undefined;
  return <section className="mt-3 space-y-2 rounded border border-border bg-muted/20 p-3 text-xs break-words" aria-label={t('activity:memoryValidity.title')}>
    <h3 className="font-semibold">{t('activity:memoryValidity.title')}</h3>
    <p className="whitespace-pre-wrap">{validity.statement}</p>
    <p className="text-muted-foreground">{t('activity:memoryValidity.unknown')}</p>
    {matching ? <p className="text-muted-foreground">{t('activity:memoryValidity.observed', { revision: matching.observedRevision, at: new Date(matching.checkedAt).toLocaleString() })}</p> : <p className="text-muted-foreground">{t('activity:memoryValidity.unchecked')}</p>}
    {(validity.checks ?? []).map((check, i) => {
      const result = matching?.checks.find((c) => c.path === check.path && c.text === check.text);
      return <div key={`${check.path}-${i}`} className="min-w-0 border-t border-border pt-2">
        <p className="font-mono break-all">{check.path}</p>
        <pre className="whitespace-pre-wrap break-all text-xs">{check.text}</pre>
        <span>{t(`activity:memoryValidity.${result?.status ?? 'unknownCheck'}`)}</span>
      </div>;
    })}
  </section>;
}
