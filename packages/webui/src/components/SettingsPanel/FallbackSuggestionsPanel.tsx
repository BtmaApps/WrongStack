import { Brain, Check, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/Toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { i18n, useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { cn, safeId } from '@/lib/utils';
import { useConfigStore } from '@/stores';
import { useLocalPrefs } from '@/stores/local-prefs';
import type { FallbackSuggestion, WSFallbackSuggestions, WSServerMessage } from '@/types';
import {
  findProfileWithChain,
  formatContextWindow,
  formatPricePair,
  sameChain,
  suggestionProfileName,
} from './fallback-suggestions';

type Mode = 'heuristic' | 'llm';

interface FallbackSuggestionsPanelProps {
  profiles: Record<string, string[]>;
  activeChain: string[];
  /** Persist a new named profile. */
  onAddProfile: (name: string, chain: string[]) => void;
  /** Replace the active fallback chain. */
  onUseChain: (chain: string[]) => void;
}

/**
 * Suggested fallback profiles (strong / balanced / fast / budget) computed on
 * the server from the saved providers' models.dev catalogs — never from a
 * hand-kept model list. One click turns a suggestion into a named profile.
 */
export function FallbackSuggestionsPanel({
  profiles,
  activeChain,
  onAddProfile,
  onUseChain,
}: FallbackSuggestionsPanelProps) {
  const { t } = useAppTranslation();
  const wsUrl = useConfigStore((s) => s.wsUrl);
  const disabledModels = useLocalPrefs((s) => s.disabledModels);
  const disabledProviders = useLocalPrefs((s) => s.disabledProviders);
  const [mode, setMode] = useState<Mode>('heuristic');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WSFallbackSuggestions['payload'] | null>(null);
  const pendingRequest = useRef<string | null>(null);

  useEffect(() => {
    const client = getWSClient(wsUrl);
    return client.on('fallback.suggestions', (msg: WSServerMessage) => {
      const payload = (msg as WSFallbackSuggestions).payload;
      // Another tab's (or a superseded) request — not ours to render.
      if (!payload || payload.requestId !== pendingRequest.current) return;
      pendingRequest.current = null;
      setLoading(false);
      setResult(payload);
    });
  }, [wsUrl]);

  const request = useCallback(
    (nextMode: Mode) => {
      const requestId = safeId();
      pendingRequest.current = requestId;
      setLoading(true);
      getWSClient(wsUrl).suggestFallbacks({
        requestId,
        mode: nextMode,
        disabledModels,
        disabledProviders,
      });
    },
    [wsUrl, disabledModels, disabledProviders],
  );

  // The heuristic pass is free and instant: show suggestions on open, and
  // rebuild them whenever a model or provider is disabled/enabled.
  useEffect(() => {
    request('heuristic');
  }, [request]);

  const generate = () => request(mode);

  const addProfile = (suggestion: FallbackSuggestion) => {
    const name = suggestionProfileName(suggestion.id, profiles);
    onAddProfile(name, suggestion.chain);
    toast.success(i18n.t('settings:fallbackSuggest.profileAdded', { name }));
  };

  const suggestions = result?.suggestions ?? [];

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t('settings:fallbackSuggest.heading')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings:fallbackSuggest.body')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <fieldset
            aria-label={t('settings:fallbackSuggest.modeLabel')}
            className="m-0 inline-flex min-w-0 rounded-md border border-border p-0.5"
          >
            {(['heuristic', 'llm'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                  mode === value
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'llm' ? <Brain className="h-3.5 w-3.5" /> : null}
                {t(
                  value === 'llm'
                    ? 'settings:fallbackSuggest.modeLlm'
                    : 'settings:fallbackSuggest.modeHeuristic',
                )}
              </button>
            ))}
          </fieldset>
          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            {t('settings:fallbackSuggest.generate')}
          </Button>
        </div>
      </div>

      {mode === 'llm' ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {t('settings:fallbackSuggest.llmHint')}
        </p>
      ) : null}

      {result ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {t('settings:fallbackSuggest.poolSummary', { count: result.candidateCount })}
          {result.llmModel
            ? ` · ${t('settings:fallbackSuggest.rankedBy', { model: result.llmModel })}`
            : ''}
        </p>
      ) : null}

      {result?.error ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('settings:fallbackSuggest.llmFailed', { error: result.error })}</span>
        </p>
      ) : null}

      {loading && !result ? (
        <p className="text-xs text-muted-foreground">{t('settings:fallbackSuggest.loading')}</p>
      ) : null}

      {result && suggestions.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          {t('settings:fallbackSuggest.empty')}
        </p>
      ) : null}

      <div className={cn('grid gap-3 md:grid-cols-2', loading && result ? 'opacity-60' : '')}>
        {suggestions.map((suggestion) => {
          const savedAs = findProfileWithChain(suggestion.chain, profiles);
          const isActive = sameChain(suggestion.chain, activeChain);
          return (
            <div
              key={suggestion.id}
              className="flex flex-col rounded-lg border border-border/70 bg-muted/30 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t(`settings:fallbackSuggest.archetype.${suggestion.id}`)}
                </span>
                <Badge variant={suggestion.source === 'llm' ? 'default' : 'secondary'}>
                  {t(
                    suggestion.source === 'llm'
                      ? 'settings:fallbackSuggest.sourceLlm'
                      : 'settings:fallbackSuggest.sourceHeuristic',
                  )}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t('settings:fallbackSuggest.providerCount', {
                    count: suggestion.providerCount,
                  })}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {suggestion.rationale ??
                  t(`settings:fallbackSuggest.archetypeHint.${suggestion.id}`)}
              </p>
              <ol className="mb-4 space-y-1.5">
                {suggestion.entries.map((entry, index) => {
                  const price = formatPricePair(entry.inputCost, entry.outputCost);
                  const context = formatContextWindow(entry.contextWindow);
                  return (
                    <li key={entry.ref} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-muted-foreground">
                        {index + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={entry.ref}>
                          {entry.name}
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                          <span className="truncate font-mono">{entry.provider}</span>
                          {context ? <span>{context}</span> : null}
                          {price ? (
                            <span>
                              {price === 'free' ? t('settings:fallbackSuggest.free') : price}
                            </span>
                          ) : null}
                          {entry.reasoning ? (
                            <span>{t('settings:fallbackSuggest.reasoning')}</span>
                          ) : null}
                          {entry.releaseDate ? <span>{entry.releaseDate}</span> : null}
                          {entry.unstable ? (
                            <span className="text-warning">
                              {t('settings:fallbackSuggest.unstable')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-auto flex flex-wrap gap-2">
                {savedAs ? (
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    {t('settings:fallbackSuggest.savedAs', { name: savedAs })}
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => addProfile(suggestion)}>
                    {t('settings:fallbackSuggest.addAsProfile')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isActive}
                  onClick={() => onUseChain(suggestion.chain)}
                >
                  {isActive
                    ? t('settings:fallbackSuggest.chainActive')
                    : t('settings:fallbackSuggest.useAsChain')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
