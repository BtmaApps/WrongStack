import { useState } from 'react';
import { ProviderSection } from '@/components/SettingsPanel/ProviderSection';
import { ProviderKeyCard } from '@/components/SetupScreen/ProviderKeyCard';
import { DEFAULT_POPULAR_PROVIDERS } from '@/components/SetupScreen/popular-providers';
import { getWSClient } from '@/lib/ws-client';

export function ProviderBrandWorkbench() {
  const [tab, setTab] = useState<'catalog' | 'saved'>('catalog');
  const [active, setActive] = useState('openai');
  const [query, setQuery] = useState('');
  const catalog = DEFAULT_POPULAR_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    family: p.family,
    envVars: [],
    modelCount: 2,
    hasApiKey: false,
  }));
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8" data-testid="provider-brand-workbench">
      <div className="mx-auto max-w-5xl space-y-8">
        <section data-testid="provider-key-cards" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEFAULT_POPULAR_PROVIDERS.map((popular) => (
            <ProviderKeyCard key={popular.id} popular={popular} onKeySaved={() => {}} />
          ))}
        </section>
        <section
          data-testid="provider-brand-settings"
          className="rounded-xl border border-border bg-card p-4"
        >
          <ProviderSection
            activeProvider={active}
            onSelectProvider={setActive}
            catalogProviders={catalog}
            isLoadingCatalog={false}
            savedProviders={[
              { id: 'office', family: 'openai', baseUrl: 'https://api.openai.com/v1', apiKeys: [] },
              { id: 'zai-coding-plan-2', family: 'openai-compatible', apiKeys: [] },
              {
                id: 'custom',
                family: 'openai-compatible',
                baseUrl: 'https://custom.example/v1',
                apiKeys: [],
              },
            ]}
            isLoadingSaved={false}
            providerTab={tab}
            setProviderTab={setTab}
            onAddKey={() => {}}
            onDeleteKey={() => {}}
            onSetActiveKey={() => {}}
            onAddProvider={() => {}}
            onRemoveProvider={() => {}}
            onPickProviderModel={() => {}}
            disabledProviders={[]}
            onToggleProviderDisabled={() => {}}
            ws={getWSClient()}
            catalogQuery={query}
            setCatalogQuery={setQuery}
          />
        </section>
      </div>
    </div>
  );
}
