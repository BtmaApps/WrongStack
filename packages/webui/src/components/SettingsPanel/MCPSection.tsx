import { Loader2, Plus, Server, Star } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/Toaster';
import { useWebSocket } from '@/hooks/useWebSocket';
import { i18n, useAppTranslation } from '@/i18n';
import type { WSServerMessage } from '@/types';
import { confirmModal } from '../ConfirmModal';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  type MCPAuthState,
  type MCPServer,
  OfficialServerCard,
  ServerCard,
} from './MCPServerCards.js';
import { ServerDialog } from './MCPServerDialog.js';
import { OFFICIAL_SERVERS, type OfficialServer, toServerConfig } from './official-servers';

export type { MCPServer } from './MCPServerCards.js';

import type { MCPServerConfig } from './contracts.js';

export type { MCPServerConfig };

export function MCPSection(): ReactElement {
  const ws = useWebSocket();
  const { t } = useAppTranslation();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'list' | 'add' | 'recommended'>('list');
  const [editServer, setEditServer] = useState<MCPServer | undefined>();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [prefillConfig, setPrefillConfig] = useState<MCPServerConfig | undefined>();
  const [_pendingOp, setPendingOp] = useState<string | null>(null);
  const [authStates, setAuthStates] = useState<Record<string, MCPAuthState>>({});
  /** Authorization URL awaiting the user's click, keyed by server name. */
  const [authPrompt, setAuthPrompt] = useState<{ name: string; url: string } | null>(null);

  // Load server list on mount and when MCP events come in
  useEffect(() => {
    if (!ws.client) return;

    const handleMcpList = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.list') {
        const p = msg.payload as { servers: MCPServer[] };
        setServers(p.servers ?? []);
        setLoading(false);
      }
    };

    const handleMcpServerAdded = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.added') {
        const p = msg.payload as { server: MCPServer };
        setServers((prev) => [...prev.filter((s) => s.name !== p.server.name), p.server]);
        toast.success(i18n.t('settings:mcp.toastAdded', { name: p.server.name }));
      }
    };

    const handleMcpServerRemoved = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.removed') {
        const p = msg.payload as { name: string };
        setServers((prev) => prev.filter((s) => s.name !== p.name));
        toast.success(i18n.t('settings:mcp.toastRemoved', { name: p.name }));
      }
    };

    const handleMcpServerUpdated = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.updated') {
        const p = msg.payload as { server: MCPServer };
        setServers((prev) => prev.map((s) => (s.name === p.server.name ? p.server : s)));
      }
    };

    const handleMcpServerDiscovered = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.discovered') {
        const p = msg.payload as { name: string; tools: string[] };
        setServers((prev) =>
          prev.map((s) =>
            s.name === p.name ? { ...s, status: 'sleeping' as const, tools: p.tools } : s,
          ),
        );
        setPendingOp(null);
        toast.success(
          i18n.t('settings:mcp.toastDiscovered', { count: p.tools.length, name: p.name }),
        );
      }
    };

    const handleMcpServerSleeping = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.sleeping') {
        const p = msg.payload as { name: string };
        setServers((prev) =>
          prev.map((s) => (s.name === p.name ? { ...s, status: 'sleeping' as const } : s)),
        );
        setPendingOp(null);
        toast.info(i18n.t('settings:mcp.toastSleeping', { name: p.name }));
      }
    };

    const handleMcpServerWaking = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.waking') {
        const p = msg.payload as { name: string };
        setServers((prev) =>
          prev.map((s) => (s.name === p.name ? { ...s, status: 'connecting' as const } : s)),
        );
      }
    };

    const handleMcpServerConnected = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.connected') {
        const p = msg.payload as { name: string; pid?: number; toolCount?: number };
        setServers((prev) =>
          prev.map((s) =>
            s.name === p.name
              ? { ...s, status: 'connected', pid: p.pid, error: undefined, lastError: undefined }
              : s,
          ),
        );
        setPendingOp(null);
        toast.success(i18n.t('settings:mcp.toastConnected', { name: p.name }));
      }
    };

    const handleMcpServerReconnected = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.reconnected') {
        const p = msg.payload as { name: string; toolCount?: number };
        setServers((prev) =>
          prev.map((s) =>
            s.name === p.name
              ? { ...s, status: 'connected', error: undefined, lastError: undefined }
              : s,
          ),
        );
        setPendingOp(null);
        toast.success(i18n.t('settings:mcp.toastReconnected', { name: p.name }));
      }
    };

    const handleMcpServerDisconnected = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.disconnected') {
        const p = msg.payload as { name: string; reason: string };
        // Idle sleep and lazy dormancy are the designed lifecycle of a lazy
        // server, and `stop` is a user action — none of them is an error.
        const planned =
          p.reason === 'stop' || p.reason === 'idle-sleep' || p.reason.endsWith('(dormant)');
        setServers((prev) =>
          prev.map((s) =>
            s.name !== p.name
              ? s
              : planned
                ? {
                    ...s,
                    status: p.reason === 'stop' ? ('stopped' as const) : ('sleeping' as const),
                    pid: undefined,
                  }
                : { ...s, status: 'error', error: p.reason, lastError: p.reason, pid: undefined },
          ),
        );
        setPendingOp(null);
        if (!planned) {
          toast.warn(i18n.t('settings:mcp.toastDisconnected', { name: p.name, reason: p.reason }));
        }
      }
    };

    const handleMcpServerError = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.error') {
        const p = msg.payload as { name: string; error: string };
        setServers((prev) =>
          prev.map((s) => (s.name === p.name ? { ...s, status: 'error', error: p.error } : s)),
        );
        setPendingOp(null);
        toast.error(i18n.t('settings:mcp.toastError', { name: p.name, error: p.error }));
      }
    };

    const handleMcpOperationResult = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.operation_result') {
        const p = msg.payload as { success: boolean; message: string };
        if (!p.success) {
          toast.error(p.message);
        }
        setPendingOp(null);
      }
    };

    const handleMcpAuthStatus = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.auth.status') {
        const p = msg.payload as { serverName: string; state: MCPAuthState };
        setAuthStates((prev) => ({ ...prev, [p.serverName]: p.state }));
      }
    };

    const handleMcpAuthPending = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.auth.pending') {
        const p = msg.payload as { name: string; authorizationUrl: string };
        setAuthStates((prev) => ({ ...prev, [p.name]: 'pending' }));
        // The URL arrives on a WS round-trip, not inside the click handler, so
        // a popup blocker would eat window.open(). Render a link instead and
        // let the user's own click open it.
        setAuthPrompt({ name: p.name, url: p.authorizationUrl });
      }
    };

    const handleMcpAuthState = (msg: WSServerMessage) => {
      if (msg.type === 'mcp.server.auth_state') {
        const p = msg.payload as {
          name: string;
          state: 'authorized' | 'refreshed' | 'reauth_required' | 'removed' | 'failed';
          message?: string;
        };
        setAuthStates((prev) => {
          const next = { ...prev };
          if (p.state === 'removed') delete next[p.name];
          else if (p.state === 'refreshed') next[p.name] = 'authorized';
          else next[p.name] = p.state;
          return next;
        });
        if (p.state === 'authorized') {
          setAuthPrompt((prev) => (prev?.name === p.name ? null : prev));
          toast.success(
            i18n.t('settings:mcp.toastAuthorized', {
              name: p.name,
              defaultValue: `Authorized "${p.name}"`,
            }),
          );
        }
        if (p.state === 'reauth_required' || p.state === 'failed') {
          setAuthPrompt((prev) => (prev?.name === p.name ? null : prev));
          toast.error(
            i18n.t('settings:mcp.toastAuthFailed', {
              name: p.name,
              // The reason rides an interpolation so every locale keeps it.
              suffix: p.message ? `: ${p.message}` : '',
              defaultValue: `"${p.name}" needs authorization${p.message ? `: ${p.message}` : ''}`,
            }),
          );
        }
      }
    };

    const off1 = ws.client.on('mcp.list', handleMcpList);
    const off2 = ws.client.on('mcp.server.added', handleMcpServerAdded);
    const off3 = ws.client.on('mcp.server.removed', handleMcpServerRemoved);
    const off4 = ws.client.on('mcp.server.updated', handleMcpServerUpdated);
    const off5 = ws.client.on('mcp.server.discovered', handleMcpServerDiscovered);
    const off6 = ws.client.on('mcp.server.sleeping', handleMcpServerSleeping);
    const off7 = ws.client.on('mcp.server.waking', handleMcpServerWaking);
    const off8 = ws.client.on('mcp.server.connected', handleMcpServerConnected);
    const off9 = ws.client.on('mcp.server.error', handleMcpServerError);
    const off10 = ws.client.on('mcp.operation_result', handleMcpOperationResult);
    const off11 = ws.client.on('mcp.server.reconnected', handleMcpServerReconnected);
    const off12 = ws.client.on('mcp.server.disconnected', handleMcpServerDisconnected);
    const off13 = ws.client.on('mcp.auth.status', handleMcpAuthStatus);
    const off14 = ws.client.on('mcp.auth.pending', handleMcpAuthPending);
    const off15 = ws.client.on('mcp.server.auth_state', handleMcpAuthState);

    setLoading(true);
    ws.client?.listMcpServers();

    return () => {
      off1?.();
      off2?.();
      off3?.();
      off4?.();
      off5?.();
      off6?.();
      off7?.();
      off8?.();
      off9?.();
      off10?.();
      off11?.();
      off12?.();
      off13?.();
      off14?.();
      off15?.();
    };
  }, [ws.client]);

  // Ask for status once the list arrives, so an already-authorized server is
  // badged without the user clicking anything.
  useEffect(() => {
    if (!ws.client) return;
    for (const server of servers) {
      if (server.transport !== 'stdio' && server.url) {
        ws.client.send({ type: 'mcp.auth.status', payload: { name: server.name } });
      }
    }
  }, [ws.client, servers]);

  const handleAuthorize = useCallback(
    (name: string) => {
      ws.client?.send({ type: 'mcp.auth.login', payload: { name } });
    },
    [ws.client],
  );

  const handleSignOut = useCallback(
    async (name: string) => {
      const confirmed = await confirmModal({
        title: i18n.t('settings:mcp.authSignOutTitle', {
          defaultValue: 'Remove OAuth credentials',
        }),
        message: i18n.t('settings:mcp.authSignOutBody', {
          name,
          defaultValue: `Remove the stored OAuth credentials for "${name}"? You will need to authorize again.`,
        }),
      });
      if (!confirmed) return;
      ws.client?.send({ type: 'mcp.auth.logout', payload: { name } });
    },
    [ws.client],
  );

  const handleAddCustom = useCallback(
    (config: MCPServerConfig) => {
      ws.client?.addMcpServer(config);
    },
    [ws],
  );

  const handleAddOfficial = useCallback((official: OfficialServer) => {
    // Open the dialog pre-filled (disabled by default) so the user can add any
    // required credentials/env before the server starts — matches the
    // "click Add to pre-fill, then confirm" promise on the Recommended tab.
    setPrefillConfig(toServerConfig(official, false));
    setShowAddDialog(true);
  }, []);

  const handleRemove = useCallback(
    (name: string) => {
      void confirmModal({
        title: t('settings:mcp.removeConfirmTitle', { name }),
        message: t('settings:mcp.removeConfirmBody'),
        confirmLabel: t('common:action.remove'),
        danger: true,
      }).then((ok) => {
        if (ok) ws.client?.removeMcpServer(name);
      });
    },
    [ws],
  );

  const handleEdit = useCallback((server: MCPServer) => {
    setEditServer(server);
    setPrefillConfig(undefined);
    setShowEditDialog(true);
  }, []);

  const handleSaveEdit = useCallback(
    (config: MCPServerConfig) => {
      ws.client?.updateMcpServer(config);
    },
    [ws],
  );

  const handleWake = useCallback(
    (name: string) => {
      setPendingOp(name);
      ws.client?.wakeMcpServer(name);
    },
    [ws],
  );

  const handleSleep = useCallback(
    (name: string) => {
      setPendingOp(name);
      ws.client?.sleepMcpServer(name);
    },
    [ws],
  );

  const handleDiscover = useCallback(
    (name: string) => {
      setPendingOp(name);
      ws.client?.discoverMcpServer(name);
    },
    [ws],
  );

  const handleRefresh = useCallback(() => {
    setLoading(true);
    ws.client?.listMcpServers();
  }, [ws]);

  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const sleepingCount = servers.filter((s) => s.status === 'sleeping').length;

  const addedServerNames = new Set(servers.map((s) => s.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">{t('settings:mcp.heading')}</h2>
          {servers.length > 0 && (
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
              {t('settings:mcp.summary', {
                connected: connectedCount,
                sleeping: sleepingCount,
                total: servers.length,
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('common:action.refresh')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setPrefillConfig(undefined);
              setShowAddDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('settings:mcp.addCustom')}
          </Button>
        </div>
      </div>

      {authPrompt && (
        <div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium">
            {t('settings:mcp.authPromptTitle', {
              name: authPrompt.name,
              defaultValue: `Finish signing in to "${authPrompt.name}"`,
            })}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t('settings:mcp.authPromptBody', {
              defaultValue:
                'Open the authorization page and approve access. This panel updates when the provider redirects back.',
            })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {/* The URL comes from validated discovery metadata (HTTPS-only,
                origin-bound), never from free-form user input. */}
            <a
              href={authPrompt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {t('settings:mcp.authPromptOpen', { defaultValue: 'Open authorization page' })}
            </a>
            <Button variant="ghost" size="sm" onClick={() => setAuthPrompt(null)}>
              {t('common:action.dismiss', { defaultValue: 'Dismiss' })}
            </Button>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="recommended">
            <Star className="w-3.5 h-3.5 mr-1" />
            {t('settings:mcp.tabRecommended')}
          </TabsTrigger>
          <TabsTrigger value="list">{t('settings:mcp.tabServers')}</TabsTrigger>
          <TabsTrigger value="add">{t('settings:mcp.tabAddCustom')}</TabsTrigger>
        </TabsList>

        {/* Recommended tab — official MCP servers from the community */}
        <TabsContent value="recommended" className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('settings:mcp.recommendedBody')}</p>
          <div className="grid gap-2">
            {OFFICIAL_SERVERS.map((server) => (
              <OfficialServerCard
                key={server.name}
                server={server}
                isAdded={addedServerNames.has(server.name)}
                onAdd={() => handleAddOfficial(server)}
              />
            ))}
          </div>
        </TabsContent>

        {/* My Servers tab */}
        <TabsContent value="list" className="space-y-3">
          {loading && servers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t('settings:mcp.loadingServers')}
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>{t('settings:mcp.noServers')}</p>
              <p className="text-sm">{t('settings:mcp.noServersHint')}</p>
            </div>
          ) : (
            servers.map((server) => (
              <ServerCard
                key={server.name}
                server={server}
                onWake={() => handleWake(server.name)}
                onSleep={() => handleSleep(server.name)}
                onDiscover={() => handleDiscover(server.name)}
                onEdit={() => handleEdit(server)}
                onRemove={() => handleRemove(server.name)}
                authState={authStates[server.name]}
                onAuthorize={() => handleAuthorize(server.name)}
                onSignOut={() => void handleSignOut(server.name)}
              />
            ))
          )}
        </TabsContent>

        {/* Add Custom tab */}
        <TabsContent value="add">
          <div className="text-sm text-muted-foreground">
            <p>{t('settings:mcp.addCustomBody')}</p>
            <p className="mt-1">{t('settings:mcp.addCustomBodyHint')}</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add / prefill dialog — rendered at the top level (not inside a tab) so
          it opens from any tab: the header "Add Custom" button (blank) and the
          Recommended tab's "Add" button (prefilled) both drive it. */}
      <ServerDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setPrefillConfig(undefined);
          }
        }}
        prefillConfig={prefillConfig}
        onSave={handleAddCustom}
      />

      {/* Edit dialog */}
      <ServerDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        server={editServer}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
