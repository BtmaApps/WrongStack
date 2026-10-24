'use client';

import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  Layers,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Tabs } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { filterResources } from '../lib/explorer-view';
import {
  fillPrompt,
  promptSlug,
  promptVariables,
  resourceDetails,
  resourceId,
} from '../lib/resource-model';
import { rows, text } from '../lib/session';
import { usePanelRequests } from '../lib/use-panel-requests';
import type { SessionController } from '../lib/use-session';
import { CodePanel } from './code-panel';
import { Modal } from './dialogs';
import { MarkdownContent } from './markdown-content';
import { usePresentation } from './presentation-mode';
import { EmptyArtwork } from './vibe-visuals';
import {
  CollectionViewSwitch,
  FriendlyIntro,
  useWorkspacePreferences,
} from './workspace-preferences';

const MemoryBrowser = dynamic(
  () => import('./memory-browser').then((module) => module.MemoryBrowser),
  { ssr: false, loading: () => <p role="status">Opening memory browser…</p> },
);

export type ResourceTab = 'prompts' | 'skills' | 'tools' | 'mcp' | 'memory';
const TITLES: Record<ResourceTab, string> = {
  prompts: 'Prompts',
  skills: 'Skills',
  tools: 'Tools',
  mcp: 'MCP',
  memory: 'Memory',
};
const SECTIONS = {
  prompts: {
    icon: Sparkles,
    title: 'A head start for your next idea',
    description: 'Reusable starting points. Pick one, make it yours, then add it to your message.',
  },
  skills: {
    icon: Layers,
    title: 'The right know-how for the job',
    description:
      'Skills give your assistant a focused way to approach a task. Choose one to see how it helps.',
  },
  tools: {
    icon: Wrench,
    title: 'See what your assistant can do',
    description:
      'Browse the tools available to this workspace and understand what each one can read or change.',
  },
  mcp: {
    icon: Plug,
    title: 'Your connected services',
    description:
      'Connections bring extra tools into your workspace. Check their status or reconnect a service here.',
  },
  memory: {
    icon: Brain,
    title: 'Good ideas deserve to be remembered',
    description:
      'Explore project knowledge, preferences and decisions your assistant has kept for future conversations.',
  },
};
export function ResourceHub({
  controller,
  initialTab,
  onClose,
}: {
  controller: SessionController;
  initialTab: ResourceTab;
  onClose: () => void;
}) {
  const { state, connection, prepareDraft } = controller;
  const { mode } = usePresentation();
  const { preferences } = useWorkspacePreferences();
  const [collectionsChoice, setCollections] = useState<boolean | null>(null);
  const collectionsOpen = collectionsChoice ?? preferences.view === 'studio';
  const { request, busy, error, setError } = usePanelRequests(controller);
  const [tab, setTab] = useState<ResourceTab>(initialTab);
  const [extraSections, setExtraSections] = useState(
    initialTab === 'tools' || initialTab === 'mcp',
  );
  const allSections = preferences.view === 'studio' || extraSections;
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [promptLevel, setPromptLevel] = useState('detailed');
  const owner = useRef(0);
  const load = useCallback(
    async (kind: ResourceTab) => {
      if (kind === 'memory') return;
      const epoch = ++owner.current;
      const p = await request(`${kind}.list`);
      if (!p || owner.current !== epoch) return;
      setEnabled(p.enabled !== false);
      setItems(rows(p[kind === 'mcp' ? 'servers' : kind]));
    },
    [request],
  );
  useEffect(() => {
    setItems([]);
    setSelected('');
    setDetail(null);
    setQuery('');
    setCategory('');
    setFavorites(false);
    setCreating(false);
    setEnabled(true);
    void load(tab);
    return () => {
      owner.current++;
    };
  }, [tab, load]);
  const row = items.find((item) => resourceId(tab, item) === selected);
  const pick = async (item: Record<string, unknown>) => {
    const id = resourceId(tab, item);
    setCreating(false);
    setSelected(id);
    setDetail(null);
    setValues({});
    setPromptLevel('detailed');
    if (tab !== 'prompts' && tab !== 'skills') return;
    const epoch = ++owner.current;
    const p = await request(
      `${tab}.content`,
      tab === 'prompts' ? { slug: id } : { name: id, source: text(item.source) },
      `${tab}.content`,
      (p) => (tab === 'prompts' ? p.slug : p.name) === id,
    );
    if (!p || owner.current !== epoch) return;
    if (p.found === false) {
      setError('This prompt is no longer available. Refresh the list.');
      return;
    }
    setDetail(p);
    setValues(
      Object.fromEntries(promptVariables(p.variables).map((v) => [v.name, v.defaultValue])),
    );
  };
  const mutate = async (
    type: string,
    payload: Record<string, unknown>,
    expected: string,
    accept?: (p: Record<string, unknown>) => boolean,
  ) => {
    const p = await request(type, payload, expected, accept);
    if (p && p.success !== false && p.ok !== false && !p.error) await load(tab);
  };
  const offline = connection !== 'open';
  const variables = promptVariables(detail?.variables);
  const titleTaken = items.some((item) => item.slug === promptSlug(title));
  const canUse = Boolean(detail) && !variables.some((v) => v.required && !values[v.name]?.trim());
  const visibleItems = filterResources(items, query, category, favorites);
  const categories = [...new Set(items.map((item) => text(item.category)).filter(Boolean))].sort();
  const SectionIcon = SECTIONS[tab].icon;
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        preferences.view === 'studio'
          ? 'Workspace resources'
          : tab === 'memory'
            ? 'Things worth remembering'
            : tab === 'mcp' || tab === 'tools'
              ? 'A few helpful extras'
              : 'Your little library'
      }
      detailToggle
      icon={<BookOpen size={20} />}
      description="A library of ideas, know-how and remembered knowledge."
      headerActions={
        tab !== 'memory' && (
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh resources"
            title="Refresh resources"
            disabled={busy || offline}
            onClick={() => void load(tab)}
          >
            <RefreshCw size={15} />
          </button>
        )
      }
      wide
    >
      <Tabs.Root
        className="resource-shell"
        value={tab}
        onValueChange={(value) => setTab(value as ResourceTab)}
      >
        <div className="hub-toolbar">
          <Tabs.List className="diff-tabs" aria-label="Resource sections">
            {Object.entries(TITLES)
              .filter(([key]) => allSections || (key !== 'tools' && key !== 'mcp'))
              .map(([key, label]) => (
                <Tabs.Trigger value={key} key={key} disabled={busy}>
                  {(() => {
                    const Icon = SECTIONS[key as ResourceTab].icon;
                    return <Icon size={14} aria-hidden="true" />;
                  })()}
                  {preferences.view !== 'studio' && key === 'prompts'
                    ? 'Ideas'
                    : preferences.view !== 'studio' && key === 'mcp'
                      ? 'Connections'
                      : label}
                </Tabs.Trigger>
              ))}
          </Tabs.List>
          {preferences.view !== 'studio' && (
            <button
              type="button"
              className="library-more"
              aria-label={
                allSections ? 'Show fewer library sections' : 'Show more library sections'
              }
              aria-expanded={allSections}
              disabled={busy}
              onClick={() => {
                if (allSections && (tab === 'tools' || tab === 'mcp')) setTab('prompts');
                setExtraSections(!allSections);
              }}
            >
              {allSections ? 'Less' : 'More'}
              <ChevronDown size={12} />
            </button>
          )}
        </div>
        <FriendlyIntro
          id={`resources-${tab}`}
          label={TITLES[tab].toLowerCase()}
          className="resource-intro"
        >
          <span className="explorer-intro-icon">
            <SectionIcon size={25} />
          </span>
          <div>
            <h2>{SECTIONS[tab].title}</h2>
            <p>{SECTIONS[tab].description}</p>
          </div>
          {tab !== 'memory' && (
            <span className="explorer-count">
              {busy ? 'Loading…' : `${items.length} ${TITLES[tab].toLowerCase()}`}
            </span>
          )}
        </FriendlyIntro>
        <Tabs.Content value={tab}>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {offline && <p role="status">Reconnect to load or change resources.</p>}
          {busy && (
            <p role="status" className="fine-print">
              Waiting for the server…
            </p>
          )}
          {!enabled && (
            <p role="status" className="panel-hint">
              {TITLES[tab]} are disabled or unavailable in this workspace.
            </p>
          )}
          <div
            className="resource-discovery"
            data-selected={Boolean(row) || creating}
            hidden={tab === 'memory'}
          >
            <div className="resource-search-wrap">
              <Search size={15} aria-hidden="true" />
              <input
                className="context-search resource-search"
                data-has-selection={Boolean(row) || creating}
                hidden={tab === 'memory'}
                aria-label="Search resources"
                placeholder={`Search ${TITLES[tab].toLowerCase()}…`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              {query && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Clear resource search"
                  onClick={() => setQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {(tab === 'prompts' || categories.length > 0) && (
              <>
                <button
                  type="button"
                  className="explorer-filter-toggle"
                  aria-expanded={collectionsOpen}
                  aria-controls="library-filters"
                  onClick={() => setCollections(!collectionsOpen)}
                >
                  <Layers size={13} /> Browse collections{' '}
                  {favorites ? '· favorites' : category ? `· ${category}` : ''}
                  <ChevronRight size={13} />
                </button>
                <fieldset
                  hidden={!collectionsOpen}
                  id="library-filters"
                  className="explorer-filters library-filters"
                  aria-label="Library filters"
                >
                  <button
                    type="button"
                    aria-pressed={!category && !favorites}
                    onClick={() => {
                      setCategory('');
                      setFavorites(false);
                    }}
                  >
                    Everything
                  </button>
                  {tab === 'prompts' && (
                    <button
                      type="button"
                      aria-pressed={favorites}
                      onClick={() => setFavorites(!favorites)}
                    >
                      <Star size={13} /> Favorites only{' '}
                      <small>{items.filter((item) => item.favorite === true).length}</small>
                    </button>
                  )}
                  {categories.slice(0, 8).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-label={`Category: ${value}`}
                      aria-pressed={category === value}
                      onClick={() => setCategory(category === value ? '' : value)}
                    >
                      {value.replaceAll('-', ' ').replaceAll('_', ' ')}
                    </button>
                  ))}
                  {(category || favorites || query) && (
                    <button
                      type="button"
                      className="explorer-clear"
                      onClick={() => {
                        setCategory('');
                        setFavorites(false);
                        setQuery('');
                      }}
                    >
                      Reset library filters
                    </button>
                  )}
                </fieldset>
              </>
            )}
            <div className="collection-result-bar">
              <p className="explorer-results" role="status">
                {busy
                  ? 'Finding your resources…'
                  : `${visibleItems.length} of ${items.length} ${TITLES[tab].toLowerCase()}`}
              </p>
              <CollectionViewSwitch />
            </div>
          </div>
          {tab === 'memory' ? (
            <MemoryBrowser controller={controller} onUse={onClose} />
          ) : (
            <div className="hub-layout" data-selected={Boolean(row) || creating}>
              <nav className="hub-list" aria-label={`${TITLES[tab]} list`}>
                {tab === 'prompts' && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!enabled || busy || offline}
                    onClick={() => {
                      setCreating(true);
                      setSelected('');
                      setDetail(null);
                    }}
                  >
                    Save a prompt
                  </button>
                )}
                {visibleItems.map((item) => (
                  <button
                    type="button"
                    className="hub-row resource-card"
                    key={resourceId(tab, item)}
                    aria-current={selected === resourceId(tab, item) ? 'true' : undefined}
                    disabled={busy || offline}
                    onClick={() => void pick(item)}
                  >
                    <span className="resource-card-symbol">
                      <SectionIcon size={17} aria-hidden="true" />
                    </span>
                    <span className="resource-card-copy">
                      <strong>
                        {text(item.title) || text(item.name)}
                        {item.favorite === true && <Star size={11} />}
                      </strong>
                      <small>
                        {text(item.description) ||
                          text(item.status) ||
                          text(item.category) ||
                          text(item.source)}
                      </small>
                      {tab === 'tools' && (
                        <small>
                          {item.disabled === true ? 'Disabled' : 'Enabled'} ·{' '}
                          {item.mutating === true ? 'Can change files or state' : 'Read / utility'}
                        </small>
                      )}
                      {text(item.category) && (
                        <span className="explorer-badge">
                          {text(item.category).replaceAll('-', ' ').replaceAll('_', ' ')}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={13} className="resource-card-arrow" aria-hidden="true" />
                  </button>
                ))}
                {!busy && !visibleItems.length && (
                  <div className="explorer-no-results">
                    <Search size={24} />
                    <strong>No matching {TITLES[tab].toLowerCase()}.</strong>
                    <p>Try another word or clear the filters to see more.</p>
                    {(query || category || favorites) && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setQuery('');
                          setCategory('');
                          setFavorites(false);
                        }}
                      >
                        Show all resources
                      </button>
                    )}
                  </div>
                )}
              </nav>
              <section className="hub-detail" aria-label="Selected resource">
                {(row || creating) && (
                  <button
                    type="button"
                    className="secondary-button resource-back"
                    onClick={() => {
                      owner.current++;
                      setCreating(false);
                      setSelected('');
                      setDetail(null);
                    }}
                  >
                    {' '}
                    <ArrowLeft size={14} /> All {TITLES[tab].toLowerCase()}
                  </button>
                )}
                {creating ? (
                  <form
                    className="provider-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (titleTaken) return;
                      const p = await request(
                        'prompts.create',
                        { title: title.trim(), content, category: 'user' },
                        'prompts.created',
                      );
                      if (p?.success === true) {
                        setCreating(false);
                        setTitle('');
                        setContent('');
                        await load('prompts');
                      }
                    }}
                  >
                    <h3>Save a reusable prompt</h3>
                    <label>
                      Title
                      <input
                        aria-label="Prompt title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Prompt
                      <textarea
                        aria-label="Saved prompt text"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={8}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={busy || offline || titleTaken || !title.trim() || !content.trim()}
                    >
                      Save to library
                    </button>
                    {titleTaken && (
                      <p className="form-error">
                        A prompt with this identifier already exists. Choose another title.
                      </p>
                    )}
                    <p className="fine-print">
                      Stored in the shared backend prompt library, alongside WebUI prompts.
                    </p>
                  </form>
                ) : !row ? (
                  <div className="file-empty">
                    <EmptyArtwork kind={tab === 'tools' || tab === 'mcp' ? 'activity' : 'files'} />
                    <h3>
                      {tab === 'prompts' ? 'Your next idea starts here' : 'Find the right support'}
                    </h3>
                    <p>
                      {tab === 'prompts'
                        ? 'Choose a starting point to read it, fill in your details and make it yours.'
                        : 'Choose a card to learn what it does and how it fits your project.'}
                    </p>
                    {categories.length > 0 && (
                      <div className="resource-spotlights">
                        {categories.slice(0, 3).map((value) => (
                          <button
                            type="button"
                            key={value}
                            disabled={busy || offline}
                            onClick={() => {
                              setCategory(value);
                              setQuery('');
                              setFavorites(false);
                            }}
                          >
                            <SectionIcon size={17} />
                            <span>Explore {value.replaceAll('-', ' ').replaceAll('_', ' ')}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <h3>{text(row.title) || text(row.name)}</h3>
                    <p className="panel-hint">{text(row.description)}</p>
                    {tab === 'prompts' && (
                      <>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy || offline}
                          onClick={() =>
                            void mutate(
                              'prompts.favorite',
                              { slug: selected, favorite: row.favorite !== true },
                              'prompts.favorite',
                              (p) => p.success === false || p.slug === selected,
                            )
                          }
                        >
                          <Star size={13} />
                          {row.favorite === true ? 'Unfavorite' : 'Favorite'}
                        </button>
                        {detail && (
                          <>
                            {detail.variants && (
                              <label className="provider-form">
                                Detail level
                                <select
                                  aria-label="Prompt detail level"
                                  value={promptLevel}
                                  onChange={(event) => setPromptLevel(event.target.value)}
                                >
                                  <option value="simple">Simple</option>
                                  <option value="detailed">Detailed</option>
                                  <option value="advanced">Advanced</option>
                                </select>
                              </label>
                            )}
                            <div className="provider-form">
                              {variables.map((variable) => (
                                <label
                                  key={variable.name}
                                  htmlFor={`prompt-variable-${variable.name}`}
                                >
                                  {variable.name}
                                  {variable.required ? ' *' : ''}
                                  {variable.description && <small>{variable.description}</small>}
                                  {variable.options.length ? (
                                    <select
                                      id={`prompt-variable-${variable.name}`}
                                      aria-label={`Prompt variable ${variable.name}`}
                                      value={values[variable.name] || ''}
                                      onChange={(e) =>
                                        setValues((v) => ({
                                          ...v,
                                          [variable.name]: e.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Choose…</option>
                                      {variable.options.map((option) => (
                                        <option key={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      id={`prompt-variable-${variable.name}`}
                                      aria-label={`Prompt variable ${variable.name}`}
                                      value={values[variable.name] || ''}
                                      onChange={(e) =>
                                        setValues((v) => ({
                                          ...v,
                                          [variable.name]: e.target.value,
                                        }))
                                      }
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                            <MarkdownContent
                              text={fillPrompt(resourceDetails(tab, detail, promptLevel), values)}
                            />
                            <button
                              type="button"
                              className="primary-button"
                              disabled={!canUse}
                              onClick={() => {
                                prepareDraft(
                                  fillPrompt(resourceDetails(tab, detail, promptLevel), values),
                                );
                                controller.send('prompts.used', { slug: selected });
                                onClose();
                              }}
                            >
                              Use prompt in draft
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {tab === 'skills' && (
                      <>
                        {detail && <MarkdownContent text={resourceDetails(tab, detail)} />}
                        <button
                          type="button"
                          className="primary-button"
                          disabled={busy || !detail}
                          onClick={() => {
                            prepareDraft(`$${selected}`);
                            onClose();
                          }}
                        >
                          Mention this skill
                        </button>
                      </>
                    )}
                    {tab === 'tools' && (
                      <>
                        <p className="fine-print">
                          {text(row.owner)} · {text(row.permission) || 'Runtime permission policy'}{' '}
                          · {row.disabled === true ? 'Disabled' : 'Enabled'}
                        </p>
                        <details className="hub-technical" key={mode} open={mode === 'extended'}>
                          <summary>Parameters</summary>
                          <CodePanel
                            label="Parameters"
                            value={
                              Array.isArray(row.params)
                                ? row.params.join(', ') || 'No parameters'
                                : 'Not reported'
                            }
                          />
                        </details>
                        <p className="fine-print">
                          Tool availability is shared by this runtime. Changes are available after
                          the current run finishes.
                        </p>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy || offline || state.running}
                          onClick={() =>
                            void mutate(
                              row.disabled === true ? 'tool.enable' : 'tool.disable',
                              { name: selected },
                              row.disabled === true ? 'tool.enabled' : 'tool.disabled',
                              (p) => p.name === selected,
                            )
                          }
                        >
                          {row.disabled === true ? 'Enable tool' : 'Disable tool'}
                        </button>
                      </>
                    )}
                    {tab === 'mcp' && (
                      <>
                        <div className="agent-summary">
                          <strong>{text(row.status) || 'Unknown status'}</strong>
                          <small>
                            {text(row.transport)} ·{' '}
                            {Array.isArray(row.tools) ? row.tools.length : 0} tools
                          </small>
                        </div>
                        {text(row.error) && <p className="form-error">{text(row.error)}</p>}
                        <details className="hub-technical" key={mode} open={mode === 'extended'}>
                          <summary>Available tools</summary>
                          <CodePanel
                            label="Available tools"
                            value={
                              Array.isArray(row.tools)
                                ? row.tools.filter((tool) => typeof tool === 'string').join('\n') ||
                                  'No tools reported'
                                : 'No tools reported'
                            }
                          />
                        </details>
                        <p className="fine-print">MCP connections are shared by the runtime.</p>
                        <div className="hub-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy || offline || state.running}
                            onClick={() =>
                              void mutate(
                                row.enabled === true ? 'mcp.disable' : 'mcp.enable',
                                { name: selected },
                                'mcp.operation_result',
                              )
                            }
                          >
                            {row.enabled === true ? 'Disable connection' : 'Enable connection'}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy || offline || state.running || row.enabled !== true}
                            onClick={() =>
                              void mutate('mcp.restart', { name: selected }, 'mcp.operation_result')
                            }
                          >
                            Reconnect
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </Modal>
  );
}
