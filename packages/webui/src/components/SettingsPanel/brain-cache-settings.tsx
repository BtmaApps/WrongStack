import type { ReactElement } from 'react';
import type { useAppTranslation } from '@/i18n';
import { Badge } from '../ui/badge';
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTLS,
  localizeOptions,
  withCurrent,
} from './brain-section-options';
import { PreferenceSelect } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';
import type { useBrainSection } from './use-brain-section.js';
export function BrainCacheSettings({
  t,
  config,
  sendPatch,
  busy,
}: {
  t: ReturnType<typeof useAppTranslation>['t'];
  config: NonNullable<ReturnType<typeof useBrainSection>['config']>;
  sendPatch: ReturnType<typeof useBrainSection>['sendPatch'];
  busy: ReturnType<typeof useBrainSection>['busy'];
}): ReactElement {
  return (
    <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings:brain.cacheHeading')}</span>
        <Badge variant="outline" className="text-[10px]">
          {t('settings:brain.cacheStats', {
            hits: config.cache.hits,
            misses: config.cache.misses,
            size: config.cache.size,
          })}
        </Badge>
      </div>
      <PreferenceToggle
        label={t('settings:brain.cacheReplayLabel')}
        hint={t('settings:brain.cacheReplayHint')}
        value={config.cache.enabled}
        onChange={() => sendPatch({ cache: { enabled: !config.cache.enabled } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.cacheLifetimeLabel')}
        hint={t('settings:brain.cacheLifetimeHint')}
        value={String(config.cache.ttlMs)}
        options={localizeOptions(withCurrent(CACHE_TTLS, String(config.cache.ttlMs)), t)}
        onChange={(v) => sendPatch({ cache: { ttlMs: Number(v) } })}
        disabled={busy}
      />
      <PreferenceSelect
        label={t('settings:brain.cacheMaxEntriesLabel')}
        hint={t('settings:brain.cacheMaxEntriesHint')}
        value={String(config.cache.maxEntries)}
        options={localizeOptions(
          withCurrent(CACHE_MAX_ENTRIES, String(config.cache.maxEntries)),
          t,
        )}
        onChange={(v) => sendPatch({ cache: { maxEntries: Number(v) } })}
        disabled={busy}
      />
    </div>
  );
}
