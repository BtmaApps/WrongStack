import { Bot } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { useLocalPrefs } from '@/stores/local-prefs';
import { PreferenceToggle } from './PreferenceToggle';

interface CompanionAgentsSectionProps {
  /** Push a pref change locally + to the server. */
  syncPref: (key: string, value: unknown) => void;
}

export function CompanionAgentsSection({ syncPref }: CompanionAgentsSectionProps) {
  const { t } = useAppTranslation();
  const localPrefs = useLocalPrefs();

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{t('settings:fleet.companionsHeading')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('settings:fleet.companionsHint')}</p>
        </div>
      </div>

      <div className="space-y-1 divide-y divide-border/50">
        <div className="pb-3">
          <PreferenceToggle
            label={t('settings:fleet.memoryCompanionLabel')}
            hint={t('settings:fleet.memoryCompanionHint')}
            value={localPrefs.memoryCompanionEnabled}
            onChange={() => syncPref('memoryCompanionEnabled', !localPrefs.memoryCompanionEnabled)}
          />
        </div>

        <div className="py-3">
          <PreferenceToggle
            label={t('settings:fleet.exploreCompanionLabel')}
            hint={t('settings:fleet.exploreCompanionHint')}
            value={localPrefs.exploreCompanionEnabled}
            onChange={() =>
              syncPref('exploreCompanionEnabled', !localPrefs.exploreCompanionEnabled)
            }
          />
        </div>

        <div className="pt-3">
          <PreferenceToggle
            label={t('settings:fleet.skillCompanionLabel')}
            hint={t('settings:fleet.skillCompanionHint')}
            value={localPrefs.skillCompanionEnabled}
            onChange={() => syncPref('skillCompanionEnabled', !localPrefs.skillCompanionEnabled)}
          />
        </div>
      </div>
    </div>
  );
}
