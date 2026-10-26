import { Check, Power, RefreshCw, Search, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries } from './engine-values';

export function ToolAccessSettings({ command }: { command: EngineCommand }) {
  const [tools, setTools] = useState<Record<string, unknown>[]>([]),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [owner, setOwner] = useState('all'),
    [busy, setBusy] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const result = await command('tools.list', {}, ['tools.list']);
    const rows = entries(result['tools']);
    setTools(rows);
    return rows;
  }, [command]);
  useEffect(() => {
    let active = true;
    void load()
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  const toggle = async (tool: Record<string, unknown>) => {
    const name = String(tool['name']),
      disabled = tool['disabled'] !== true;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await command(disabled ? 'tool.disable' : 'tool.enable', { name }, [
        disabled ? 'tool.disabled' : 'tool.enabled',
      ]);
      const actual = (await load()).find((row) => row['name'] === name);
      if (!actual || actual['disabled'] !== disabled)
        throw Error(
          'The tool catalog did not confirm the requested state. Refresh before retrying.',
        );
      setNotice(
        name +
          ' ' +
          (disabled ? 'disabled' : 'enabled') +
          ' and verified in the profile tool catalog.',
      );
    } catch (e) {
      setError('Could not update ' + name + ': ' + String(e instanceof Error ? e.message : e));
    } finally {
      setBusy('');
    }
  };
  const filtered = tools.filter(
    (tool) =>
      (status === 'all' || (status === 'disabled') === (tool['disabled'] === true)) &&
      (owner === 'all' || tool['owner'] === owner) &&
      [tool['name'], tool['owner'], tool['description']]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const disabled = tools.filter((tool) => tool['disabled'] === true).length,
    direct = tools.filter((tool) => tool['disabled'] !== true && tool['direct'] === true).length;
  return (
    <section className="tool-access-settings" aria-label="Tool availability settings">
      <header className="settings-section-heading">
        <div>
          <span className="eyebrow">REGISTERED TOOL CATALOG</span>
          <h2>Tool availability</h2>
          <p>
            Choose which registered tools this profile exposes. Saved choices are loaded by new
            runtimes; this profile runtime updates immediately.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={!!busy || loading}
          onClick={() => {
            setLoading(true);
            void load()
              .then(() => setError(''))
              .catch((e) => setError(String(e)))
              .finally(() => setLoading(false));
          }}
        >
          <RefreshCw size={14} />
          Refresh tools
        </button>
      </header>
      <p className="settings-defaults-note">
        Availability switches do not grant permissions or cancel calls already in progress.
        Permission policy remains enforced.
      </p>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          <Check size={14} />
          {notice}
        </p>
      )}
      <div className="tool-access-counts">
        <strong>{tools.length}</strong> registered · {direct} direct ·{' '}
        {tools.length - disabled - direct} on demand · {disabled} disabled
      </div>
      <div className="tool-access-filters">
        <label>
          <Search size={14} />
          <input
            aria-label="Search registered tools"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a tool, owner, or capability…"
          />
        </label>
        <select
          aria-label="Tool availability filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All tools</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          aria-label="Tool owner filter"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">All owners</option>
          {[...new Set(tools.map((tool) => String(tool['owner'] ?? 'core')))]
            .sort()
            .map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
      </div>
      {loading && !tools.length ? (
        <p className="quiet-state">Loading registered tools…</p>
      ) : (
        <section className="tool-access-list" aria-label="Registered tools">
          {filtered.map((tool) => (
            <article className="tool-access-card" key={String(tool['name'])}>
              <header>
                <Wrench size={16} />
                <div>
                  <strong>{String(tool['name'])}</strong>
                  <span>
                    {String(tool['owner'] ?? 'core')} ·{' '}
                    {tool['disabled'] === true
                      ? 'Disabled'
                      : tool['direct'] === true
                        ? 'Direct provider tool'
                        : 'On-demand catalog tool'}
                  </span>
                </div>
                <button
                  type="button"
                  className="button secondary small"
                  aria-label={(tool['disabled'] === true ? 'Enable ' : 'Disable ') + tool['name']}
                  disabled={!!busy}
                  onClick={() => void toggle(tool)}
                >
                  <Power size={13} />
                  {busy === tool['name']
                    ? 'Updating…'
                    : tool['disabled'] === true
                      ? 'Enable'
                      : 'Disable'}
                </button>
              </header>
              <div className="tool-access-badges">
                <span>{tool['mutating'] === true ? 'Can change data' : 'Read only'}</span>
                <span>Permission: {String(tool['permission'] ?? 'auto')}</span>
              </div>
              <details>
                <summary>Tool details</summary>
                <p>{String(tool['description'] ?? 'No description reported.')}</p>
                {Array.isArray(tool['params']) && tool['params'].length > 0 && (
                  <div className="tool-input-names">
                    <span>Inputs</span>
                    {tool['params'].map((param) => (
                      <code key={String(param)}>{String(param)}</code>
                    ))}
                  </div>
                )}
              </details>
            </article>
          ))}
        </section>
      )}
      {!loading && !filtered.length && <p className="quiet-state">No tools match these filters.</p>}
    </section>
  );
}
