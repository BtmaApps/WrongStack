import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  KeyRound,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
} from 'lucide-react';

import { useState } from 'react';

import { useAppTranslation } from '@/i18n';

import { Badge } from '../ui/badge';

import { Button } from '../ui/button';

import type { OfficialServer } from './official-servers';

/** Non-secret OAuth state pushed by the server for an HTTP MCP endpoint. */
export type MCPAuthState =
  | 'not_authorized'
  | 'pending'
  | 'authorized'
  | 'expired'
  | 'reauth_required'
  | 'failed';

export interface MCPServer {
  name: string;
  transport: string;
  status: 'stopped' | 'connecting' | 'connected' | 'sleeping' | 'discovering' | 'error';
  enabled: boolean;
  description?: string;
  tools?: string[];
  error?: string;
  lastError?: string;
  pid?: number;
  lazy?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  health?: {
    healthState: 'disabled' | 'dormant' | 'connecting' | 'healthy' | 'degraded' | 'failed';
    consecutiveFailures: number;
    failures: { transport: number; protocol: number; tool: number };
    reconnectCount: number;
    wakeCount: number;
    sleepCount: number;
    restartCount: number;
    inFlightCalls: number;
    peakInFlightCalls: number;
    callLatency: { count: number; lastMs?: number; p50Ms?: number; p95Ms?: number };
  };
}

/** Map server status to a human-readable label and color */
export function statusInfo(status: MCPServer['status']): { color: string } {
  switch (status) {
    case 'connected':
      return { color: 'bg-success' };
    case 'connecting':
      return { color: 'bg-warning animate-pulse' };
    case 'sleeping':
      return { color: 'bg-info' };
    case 'discovering':
      return { color: 'bg-primary animate-pulse' };
    case 'error':
      return { color: 'bg-destructive' };
    case 'stopped':
      return { color: 'bg-muted-foreground' };
    default:
      return { color: 'bg-muted-foreground/70' };
  }
}

/** Small colored dot for status indication */
export function StatusDot({ status }: { status: MCPServer['status'] }) {
  const { color } = statusInfo(status);
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

/** Expandable server card */
export function ServerCard({
  server,
  authState,
  onWake,
  onSleep,
  onDiscover,
  onEdit,
  onRemove,
  onAuthorize,
  onSignOut,
}: {
  server: MCPServer;
  authState?: MCPAuthState | undefined;
  onWake: () => void;
  onSleep: () => void;
  onDiscover: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAuthorize: () => void;
  onSignOut: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { color } = statusInfo(server.status);
  const { t } = useAppTranslation();
  // Only an HTTP transport can carry OAuth; a stdio server authenticates
  // through its own env, which the edit dialog already covers.
  const supportsOAuth = server.transport !== 'stdio' && !!server.url;
  const needsAuth = authState === 'reauth_required' || authState === 'expired';

  return (
    <div className="rounded-md border border-border/70 bg-card/70 p-3 transition-colors hover:bg-card">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <StatusDot status={server.status} />
          <span className="min-w-0 truncate font-medium">{server.name}</span>
          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
            {server.transport}
          </span>
          {!server.enabled && (
            <Badge variant="outline" className="text-xs">
              {t('settings:mcp.disabled')}
            </Badge>
          )}
          {supportsOAuth && needsAuth && (
            <Badge variant="destructive" className="text-xs">
              {t('settings:mcp.authRequired', { defaultValue: 'Sign-in required' })}
            </Badge>
          )}
          {supportsOAuth && authState === 'authorized' && (
            <Badge variant="outline" className="text-xs">
              {t('settings:mcp.authorized', { defaultValue: 'Authorized' })}
            </Badge>
          )}
        </button>
        <div className="flex items-center gap-1">
          {server.status === 'sleeping' && (
            <Button variant="ghost" size="sm" onClick={onWake} title={t('settings:mcp.wakeTitle')}>
              <Sun className="w-4 h-4" />
            </Button>
          )}
          {(server.status === 'connected' || server.status === 'connecting') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSleep}
              title={t('settings:mcp.sleepTitle')}
            >
              <Moon className="w-4 h-4" />
            </Button>
          )}
          {(server.status === 'stopped' || server.status === 'sleeping') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscover}
              title={t('settings:mcp.discoverTitle')}
            >
              <Search className="w-4 h-4" />
            </Button>
          )}
          {supportsOAuth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={authState === 'authorized' ? onSignOut : onAuthorize}
              title={
                authState === 'authorized'
                  ? t('settings:mcp.authSignOutTitle', { defaultValue: 'Remove OAuth credentials' })
                  : t('settings:mcp.authorizeTitle', { defaultValue: 'Authorize with OAuth' })
              }
              className={needsAuth ? 'text-destructive hover:text-destructive' : undefined}
            >
              <KeyRound className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit} title={t('settings:mcp.editTitle')}>
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            title={t('settings:mcp.removeTitle')}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border/60 pl-6 pt-3 text-sm">
          <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">{t('settings:mcp.statusLabel')}</span>
            <span className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
              {t(`settings:mcp.status.${server.status}`, { defaultValue: server.status })}
            </span>
            <span className="text-muted-foreground">{t('settings:mcp.enabledLabel')}</span>
            <span>{server.enabled ? t('settings:mcp.yes') : t('settings:mcp.no')}</span>
            {server.description && (
              <>
                <span className="text-muted-foreground">{t('settings:mcp.descriptionLabel')}</span>
                <span>{server.description}</span>
              </>
            )}
            {server.pid && (
              <>
                <span className="text-muted-foreground">{t('settings:mcp.pidLabel')}</span>
                <span>{server.pid}</span>
              </>
            )}
            {server.error && (
              <>
                <span className="text-muted-foreground">{t('settings:mcp.errorLabel')}</span>
                <span className="text-destructive">{server.error}</span>
              </>
            )}
            {server.health && (
              <>
                <span className="text-muted-foreground">
                  {t('activity:mCPSection.operationalHealth')}
                </span>
                <span>{server.health.healthState}</span>
                <span className="text-muted-foreground">
                  {t('activity:mCPSection.failuresTransportProtocolTool')}
                </span>
                <span>
                  {server.health.failures.transport}/{server.health.failures.protocol}/
                  {server.health.failures.tool}
                </span>
                <span className="text-muted-foreground">
                  {t('activity:mCPSection.callLatencyP50P95')}
                </span>
                <span>
                  {server.health.callLatency.p50Ms ?? '-'}ms /{' '}
                  {server.health.callLatency.p95Ms ?? '-'}ms
                </span>
                <span className="text-muted-foreground">
                  {t('activity:mCPSection.reconnectWakeSleep')}
                </span>
                <span>
                  {server.health.reconnectCount} / {server.health.wakeCount} /{' '}
                  {server.health.sleepCount}
                </span>
                <span className="text-muted-foreground">
                  {t('activity:mCPSection.callsInFlightPeak')}
                </span>
                <span>
                  {server.health.inFlightCalls} / {server.health.peakInFlightCalls}
                </span>
              </>
            )}
          </div>
          {server.tools && server.tools.length > 0 && (
            <div>
              <span className="text-muted-foreground">
                {t('settings:mcp.toolsLabel', { count: server.tools.length })}
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {server.tools.map((tool) => (
                  <Badge key={tool} variant="secondary" className="text-xs">
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {(!server.tools || server.tools.length === 0) && server.status === 'connected' && (
            <span className="text-muted-foreground">{t('settings:mcp.noTools')}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Official/recommended server card */
export function OfficialServerCard({
  server,
  isAdded,
  onAdd,
}: {
  server: OfficialServer;
  isAdded: boolean;
  onAdd: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-card/70 p-3 transition-colors hover:bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{server.name}</span>
          {server.badge && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {server.badge}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs shrink-0">
            {server.transport}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{server.description}</p>
        {server.requiresEnvVars && server.requiresEnvVars.length > 0 && (
          <p className="mt-1 text-xs text-warning">
            {t('settings:mcp.requires', { vars: server.requiresEnvVars.join(', ') })}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {isAdded ? (
          <Button variant="ghost" size="sm" disabled>
            <Check className="w-4 h-4 mr-1" />
            {t('settings:mcp.added')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" />
            {t('common:action.add')}
          </Button>
        )}
      </div>
    </div>
  );
}
