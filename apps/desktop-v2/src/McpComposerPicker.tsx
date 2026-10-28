import { Plug, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries } from './engine-values';
import { McpContentBrowser } from './McpContentBrowser';
import { Modal } from './Modal';

export function McpComposerPicker({
  command,
  onInsert,
  onClose,
}: {
  command: EngineCommand;
  onInsert: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [servers, setServers] = useState<Record<string, unknown>[]>([]),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    void command('mcp.list', {}, ['mcp.list'])
      .then((result) => {
        if (alive) setServers(entries(result['servers']));
      })
      .catch((error: unknown) => {
        if (alive) setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [command, revision]);
  if (selected)
    return (
      <McpContentBrowser
        name={selected}
        command={command}
        onClose={() => setSelected('')}
        onInsert={onInsert}
      />
    );
  return (
    <Modal title="Add MCP content to draft" onClose={onClose}>
      <div className="composer-dialog resource-dialog">
        <header>
          <div>
            <span className="eyebrow">EXTERNAL CONTEXT</span>
            <h2>MCP resources & prompts</h2>
          </div>
        </header>
        <p>
          Choose a connection, resolve its content, then review the text before appending it to this
          conversation's draft. Nothing is sent automatically.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={14} />
          Refresh connections
        </button>
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Reading MCP connections…</p>
        ) : servers.length ? (
          <div className="mcp-composer-connections">
            {servers.map((server) => (
              <button
                type="button"
                className="button secondary"
                key={String(server['name'])}
                disabled={!server['enabled']}
                onClick={() => setSelected(String(server['name']))}
              >
                <Plug size={14} />
                <span>{String(server['name'])}</span>
                <small>
                  {server['enabled'] ? String(server['status'] ?? 'Enabled') : 'Disabled'}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="quiet-state">
            No MCP connections. Add one in WrongStack settings → Connected tools.
          </p>
        )}
        <button type="button" className="button secondary" onClick={onClose}>
          Return to draft
        </button>
      </div>
    </Modal>
  );
}
