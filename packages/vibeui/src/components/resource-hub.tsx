'use client';

import { BookOpen, RefreshCw, Star } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fillPrompt,
  memoryWindow,
  promptSlug,
  promptVariables,
  resourceDetails,
  resourceId,
  resourceMatches,
} from '../lib/resource-model';
import { rows, text } from '../lib/session';
import { usePanelRequests } from '../lib/use-panel-requests';
import type { SessionController } from '../lib/use-session';
import { Modal } from './dialogs';
import { MarkdownContent } from './markdown-content';

export type ResourceTab = 'prompts' | 'skills' | 'tools' | 'mcp' | 'memory';
const TITLES: Record<ResourceTab, string> = {
  prompts: 'Prompts',
  skills: 'Skills',
  tools: 'Tools',
  mcp: 'MCP',
  memory: 'Memory',
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
  const { request, busy, error, setError } = usePanelRequests(controller);
  const [tab, setTab] = useState<ResourceTab>(initialTab);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [memory, setMemory] = useState('');
  const [memoryPage, setMemoryPage] = useState(0);
  const memoryView = useMemo(
    () => memoryWindow(memory, query, memoryPage),
    [memory, query, memoryPage],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const owner = useRef(0);
  const load = useCallback(
    async (kind: ResourceTab) => {
      const epoch = ++owner.current;
      const p = await request(kind === 'memory' ? 'memory.list' : `${kind}.list`);
      if (!p || owner.current !== epoch) return;
      setEnabled(p.enabled !== false);
      setItems(rows(p[kind === 'mcp' ? 'servers' : kind]));
      if (kind === 'memory') setMemory(text(p.text));
    },
    [request],
  );
  useEffect(() => {
    setItems([]);
    setSelected('');
    setDetail(null);
    setQuery('');
    setCreating(false);
    setMemory('');
    setMemoryPage(0);
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
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Workspace resources"
      description="Prompts and capabilities for this workspace."
      wide
    >
      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as ResourceTab)}>
        <div className="hub-toolbar">
          <Tabs.List className="diff-tabs" aria-label="Resource sections">
            {Object.entries(TITLES).map(([key, label]) => (
              <Tabs.Trigger value={key} key={key} disabled={busy}>
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh resources"
            disabled={busy || offline}
            onClick={() => void load(tab)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
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
          <input
            className="context-search"
            aria-label="Search resources"
            placeholder={`Search ${TITLES[tab].toLowerCase()}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMemoryPage(0);
            }}
          />
          {tab === 'memory' ? (
            <section className="hub-memory" aria-label="Workspace memory">
              <p className="fine-print">
                Read-only memory snapshot · search covers all loaded content.
              </p>
              {memory ? (
                <>
                  <div className="hub-actions">
                    <span className="fine-print">
                      Page {memoryView.page + 1} / {memoryView.pages} ·{' '}
                      {memoryView.total.toLocaleString()} characters
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={memoryView.page === 0}
                      onClick={() => setMemoryPage(memoryView.page - 1)}
                    >
                      Previous memory page
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={memoryView.page + 1 >= memoryView.pages}
                      onClick={() => setMemoryPage(memoryView.page + 1)}
                    >
                      Next memory page
                    </button>
                  </div>
                  <pre className="context-raw">
                    {memoryView.content || 'No matching memory lines.'}
                  </pre>
                </>
              ) : (
                !busy && <p className="panel-hint">No memory content reported.</p>
              )}
            </section>
          ) : (
            <div className="hub-layout">
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
                {items
                  .filter((item) => resourceMatches(item, query))
                  .map((item) => (
                    <button
                      type="button"
                      className="hub-row"
                      key={resourceId(tab, item)}
                      aria-current={selected === resourceId(tab, item) ? 'true' : undefined}
                      disabled={busy || offline}
                      onClick={() => void pick(item)}
                    >
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
                    </button>
                  ))}
                {!busy && !items.some((item) => resourceMatches(item, query)) && (
                  <p className="panel-hint">No matching {TITLES[tab].toLowerCase()}.</p>
                )}
              </nav>
              <section className="hub-detail" aria-label="Selected resource">
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
                    <BookOpen size={24} />
                    <p>Choose a resource to inspect it.</p>
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
                              text={fillPrompt(resourceDetails(tab, detail), values)}
                            />
                            <button
                              type="button"
                              className="primary-button"
                              disabled={!canUse}
                              onClick={() => {
                                prepareDraft(fillPrompt(resourceDetails(tab, detail), values));
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
                        <details className="hub-technical">
                          <summary>Parameters</summary>
                          <pre className="context-raw">
                            {Array.isArray(row.params)
                              ? row.params.join(', ') || 'No parameters'
                              : 'Not reported'}
                          </pre>
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
                        <details className="hub-technical">
                          <summary>Available tools</summary>
                          <pre className="context-raw">
                            {Array.isArray(row.tools)
                              ? row.tools.filter((tool) => typeof tool === 'string').join('\n') ||
                                'No tools reported'
                              : 'No tools reported'}
                          </pre>
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
