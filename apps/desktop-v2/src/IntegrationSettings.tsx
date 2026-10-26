import { Check, Link2, Plug, Plus, Power, RefreshCw, Server, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries } from './engine-values';

export function IntegrationSettings({ command }: { command: EngineCommand }) {
  const [servers, setServers] = useState<Record<string, unknown>[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [creating, setCreating] = useState(false),
    [removing, setRemoving] = useState(''),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const result = await command('mcp.list', {}, ['mcp.list']);
    setServers(entries(result['servers']));
  }, [command]);
  useEffect(() => {
    void load().catch((error: unknown) =>
      setError(String(error instanceof Error ? error.message : error)),
    );
  }, [load]);
  const action = async (name: string, type: string, payload: Record<string, unknown> = {}) => {
    setBusy(name || 'new');
    setError('');
    setNotice('');
    try {
      const reply = await command(type, { name, ...payload }, ['mcp.operation_result']);
      await load();
      setNotice(String(reply['message'] ?? 'Integration updated.'));
      setCreating(false);
      setRemoving('');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="integration-settings">
      <header className="settings-section-heading">
        <div>
          <h2>Connected tools</h2>
          <p>
            Connect MCP servers to extend what WrongStack can read and do. These connections belong
            to your profile.
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setCreating(true)}>
          <Plus size={14} />
          Add connection
        </button>
      </header>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          <Check size={13} />
          {notice}
        </p>
      )}
      <div className="integration-grid">
        {servers.map((server) => {
          const name = String(server['name']);
          const status = String(
            server['status'] ?? (server['enabled'] ? 'Configured' : 'Disabled'),
          );
          const tools = entries(server['tools']);
          return (
            <article className="integration-card" key={name}>
              <header>
                <span className="integration-icon">
                  {server['url'] ? <Link2 size={22} /> : <Server size={22} />}
                </span>
                <div>
                  <h3>{name}</h3>
                  <span
                    className={`integration-status ${server['enabled'] === false ? 'disabled' : ''}`}
                  >
                    {status}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Refresh ${name}`}
                  disabled={Boolean(busy)}
                  onClick={() => void action(name, 'mcp.restart')}
                >
                  <RefreshCw size={14} />
                </button>
              </header>
              <p className="integration-endpoint">
                {String(
                  server['url'] ?? server['command'] ?? server['transport'] ?? 'MCP connection',
                )}
              </p>
              <div className="integration-tools-summary">
                <Plug size={14} />
                {Number(server['toolCount'] ?? tools.length)} tools available
              </div>
              {tools.length > 0 && (
                <details>
                  <summary>Available tools</summary>
                  <div className="integration-tool-list">
                    {tools.map((tool) => (
                      <div key={String(tool['name'])}>
                        <strong>{String(tool['name'])}</strong>
                        <p>{String(tool['description'] ?? '')}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <footer>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(name, server['enabled'] === false ? 'mcp.enable' : 'mcp.disable')
                  }
                >
                  <Power size={12} />
                  {server['enabled'] === false ? 'Enable' : 'Disable'}
                </button>
                {status.toLowerCase().includes('sleep') ? (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={Boolean(busy)}
                    onClick={() => void action(name, 'mcp.wake')}
                  >
                    Wake
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={Boolean(busy)}
                    onClick={() => void action(name, 'mcp.sleep')}
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Remove ${name}`}
                  disabled={Boolean(busy)}
                  onClick={() => setRemoving(name)}
                >
                  <Trash2 size={13} />
                </button>
              </footer>
              {removing === name && (
                <div className="integration-remove">
                  <p>Remove this connection from your profile?</p>
                  <button
                    type="button"
                    className="button secondary danger small"
                    onClick={() => void action(name, 'mcp.remove')}
                  >
                    Remove connection
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => setRemoving('')}
                  >
                    Keep connection
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!servers.length && (
        <div className="integration-empty">
          <Plug size={35} />
          <h3>Bring your tools into the workspace.</h3>
          <p>
            Add a remote endpoint or a local MCP server. Configure it first, then enable it when you
            are ready.
          </p>
          <button type="button" className="button secondary" onClick={() => setCreating(true)}>
            Add your first connection
          </button>
        </div>
      )}
      {creating && (
        <IntegrationDialog
          busy={Boolean(busy)}
          onClose={() => setCreating(false)}
          onSave={(payload) => void action(String(payload['name']), 'mcp.add', payload)}
        />
      )}
    </section>
  );
}
function IntegrationDialog({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [name, setName] = useState(''),
    [mode, setMode] = useState('remote'),
    [url, setUrl] = useState(''),
    [command, setCommand] = useState(''),
    [args, setArgs] = useState('');
  return (
    <dialog ref={dialog} className="modal" aria-label="Add MCP connection" onCancel={onClose}>
      <header>
        <div>
          <span className="eyebrow">MCP CONNECTION</span>
          <h2>Make your tools available.</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancel connection"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            name: name.trim(),
            enabled: false,
            ...(mode === 'remote'
              ? { url: url.trim() }
              : {
                  command: command.trim(),
                  args: args
                    .split('\n')
                    .map((arg) => arg.trim())
                    .filter(Boolean),
                }),
          });
        }}
      >
        <label>
          Name
          <input
            aria-label="Connection name"
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="project-docs"
          />
        </label>
        <label>
          Connection type
          <select
            aria-label="Connection type"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="remote">Remote endpoint</option>
            <option value="local">Local process</option>
          </select>
        </label>
        {mode === 'remote' ? (
          <label>
            Server URL
            <input
              aria-label="MCP server URL"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/mcp"
            />
          </label>
        ) : (
          <>
            <label>
              Executable
              <input
                aria-label="MCP executable"
                required
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="bun"
              />
            </label>
            <label>
              Arguments
              <textarea
                aria-label="MCP arguments"
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                rows={4}
                placeholder={'run\n/path/to/server.ts'}
              />
              <small className="field-help">
                One argument per line. The executable is launched directly.
              </small>
            </label>
          </>
        )}
        <p className="form-note">
          The connection will be saved disabled. Enable it from its card to connect.
        </p>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>
            <Plus size={14} />
            Save connection
          </button>
        </footer>
      </form>
    </dialog>
  );
}
