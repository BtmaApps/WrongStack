import {
  Bell,
  CheckCircle2,
  Circle,
  FileText,
  HelpCircle,
  Lock,
  Mail,
  MailOpen,
  MailPlus,
  MessageSquare,
  Reply,
  RotateCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { useWebSocket } from '@/hooks/useWebSocket';
import { i18n, useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { showPanel } from '@/lib/view-navigation';
import { useActiveSessionId, useMailboxStore, useUIStore } from '@/stores';
import { onLaneDisposed } from '@/stores/chat-lanes';
import { classifyMailboxRecipient, type MailboxMessage } from '@/stores/mailbox-store';
import type { MailboxComposeRequest } from '@/stores/ui-store';
import { confirmModal } from './ConfirmModal';
import {
  MailboxComposeDialog,
  type MailboxComposeType,
  type MailboxSendState,
} from './MailboxComposeDialog';

type MailboxPanelChrome = {
  collapsed: boolean;
  deleting: boolean;
  purging: boolean;
  compacting: boolean;
  composeOpen: boolean;
  composeTo: string;
  composeType: MailboxComposeType;
  composeAudience: 'all' | 'leaders';
  composePriority: 'low' | 'normal' | 'high';
  composeSubject: string;
  composeBody: string;
  composeReplyTo: string | null;
  sendState: MailboxSendState;
};

const MAILBOX_PANEL_NO_SESSION = '__no_session__';
const mailboxPanelChromeBySession = new Map<string, MailboxPanelChrome>();
const disposedMailboxPanelSessions = new Set<string>();

onLaneDisposed((sessionId) => {
  mailboxPanelChromeBySession.delete(sessionId);
  disposedMailboxPanelSessions.add(sessionId);
});

// ── Helpers ───────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
  note: FileText,
  ask: HelpCircle,
  assign: Send,
  steer: RotateCw,
  btw: Bell,
  broadcast: Send,
  status: Circle,
  result: CheckCircle2,
  review: Search,
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return i18n.t('activity:mailbox.timeNow');
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h`;
  return d.toLocaleDateString();
}

function mailboxMessageBelongsToSession(
  message: MailboxMessage,
  sessionId: string | null,
): boolean {
  if (!sessionId) return true;
  if (message.senderSessionId === sessionId || message.recipientSessionId === sessionId)
    return true;
  if (
    message.to.includes(`@session:${sessionId}`) ||
    message.from.includes(`@session:${sessionId}`)
  ) {
    return true;
  }
  const classified = classifyMailboxRecipient(message.to);
  if (classified.scope === 'project') return true;
  return classified.recipientSessionId === sessionId;
}

// ── Component ─────────────────────────────────────────────────────────

export function MailboxPanel({ className }: { className?: string }) {
  const sessionId = useActiveSessionId();
  // Messages/agents live in the central mailbox store — populated by the
  // ws-handlers registry, refreshed on every mailbox.event. This panel
  // only triggers an extra refresh when (re)mounted.
  const messages = useMailboxStore((s) => s.messages);
  const agents = useMailboxStore((s) => s.agents);
  const lastCompaction = useMailboxStore((s) => s.lastCompaction);
  const [collapsed, setCollapsed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('leader');
  const [composeType, setComposeType] = useState<MailboxComposeType>('note');
  const [composeAudience, setComposeAudience] = useState<'all' | 'leaders'>('all');
  const [composePriority, setComposePriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);
  const [sendState, setSendState] = useState<MailboxSendState>({ phase: 'idle' });
  const chromeSessionRef = useRef<string>(sessionId ?? MAILBOX_PANEL_NO_SESSION);
  const { client } = useWebSocket();
  const { t } = useAppTranslation();

  useLayoutEffect(() => {
    if (!disposedMailboxPanelSessions.has(chromeSessionRef.current)) {
      mailboxPanelChromeBySession.set(chromeSessionRef.current, {
        collapsed,
        deleting,
        purging,
        compacting,
        composeOpen,
        composeTo,
        composeType,
        composeAudience,
        composePriority,
        composeSubject,
        composeBody,
        composeReplyTo,
        sendState,
      });
    }

    const next = sessionId ?? MAILBOX_PANEL_NO_SESSION;
    const parked = mailboxPanelChromeBySession.get(next);
    disposedMailboxPanelSessions.delete(next);
    setCollapsed(parked?.collapsed ?? false);
    setDeleting(parked?.deleting ?? false);
    setPurging(parked?.purging ?? false);
    setCompacting(parked?.compacting ?? false);
    setComposeOpen(parked?.composeOpen ?? false);
    setComposeTo(parked?.composeTo ?? 'leader');
    setComposeType(parked?.composeType ?? 'note');
    setComposeAudience(parked?.composeAudience ?? 'all');
    setComposePriority(parked?.composePriority ?? 'normal');
    setComposeSubject(parked?.composeSubject ?? '');
    setComposeBody(parked?.composeBody ?? '');
    setComposeReplyTo(parked?.composeReplyTo ?? null);
    setSendState(parked?.sendState ?? { phase: 'idle' });
    chromeSessionRef.current = next;
  }, [sessionId]);
  // Track the socket lifecycle so the initial queries fire once the
  // connection is actually open (client.send drops messages otherwise).
  const [ready, setReady] = useState(client.status.state === 'open');
  useEffect(() => {
    const off = client.onStatus((s) => setReady(s.state === 'open'));
    return () => off();
  }, [client]);

  useEffect(() => {
    return client.on('mailbox.sent', (message) => {
      const payload = message.payload as {
        requestId?: string;
        success?: boolean;
        messageId?: string;
        error?: string;
      };
      setSendState((current) => {
        if (current.phase !== 'sending' || payload.requestId !== current.requestId) return current;
        if (payload.success === true) {
          // Reset the draft — body, subject and any reply threading — so the
          // next compose starts clean. Draft survives only while unsent.
          setComposeBody('');
          setComposeSubject('');
          setComposeReplyTo(null);
          return { phase: 'sent', messageId: payload.messageId };
        }
        return { phase: 'error', message: payload.error ?? t('activity:mailbox.sendFailed') };
      });
    });
  }, [client, t]);

  // Cross-surface compose requests (detail-view Reply, command palette):
  // consume exactly once — apply the prefill, then clear so the request
  // cannot re-fire on remount or session switches.
  const mailboxComposeRequest = useUIStore((s) => s.mailboxComposeRequest);
  useEffect(() => {
    if (!mailboxComposeRequest) return;
    openComposeWithPrefill(mailboxComposeRequest);
    useUIStore.getState().setMailboxComposeRequest(null);
  }, [mailboxComposeRequest]);

  // Query mailbox on mount and when WS becomes ready
  useEffect(() => {
    if (!ready) return;
    client.send({ type: 'mailbox.messages', payload: { limit: 30 } });
    client.send({ type: 'mailbox.agents', payload: {} });
  }, [ready, client]);

  const selectedMailMessage = useUIStore((s) => s.selectedMailMessage);
  const setSelectedMailMessage = useUIStore((s) => s.setSelectedMailMessage);

  function handleMessageClick(m: (typeof messages)[number]) {
    // Re-clicking the same message deselects and goes back to chat
    if (selectedMailMessage?.id === m.id) {
      setSelectedMailMessage(null);
      showPanel('chat');
      return;
    }
    setSelectedMailMessage(m);
    // Ensure the mailbox panel is open and the main area shows the detail
    showPanel('mailbox');
  }

  const scopedMessages = messages.filter((message) =>
    mailboxMessageBelongsToSession(message, sessionId),
  );
  const scopedAgents = sessionId ? agents.filter((agent) => agent.sessionId === sessionId) : agents;
  const unreadCount = scopedMessages.filter((m) => !m.completed).length;
  const onlineCount = scopedAgents.filter((a) => a.online).length;
  const messagePage = usePagination(scopedMessages, 8);
  const onlineAgents = scopedAgents.filter((agent) => agent.online);
  const agentPage = usePagination(onlineAgents, 5);

  async function handleDeleteAll() {
    if (scopedMessages.length === 0) return;
    const ok = await confirmModal({
      title: t('activity:mailbox.deleteAllConfirmTitle', { count: scopedMessages.length }),
      message: t('activity:mailbox.deleteAllConfirmBody'),
      confirmLabel: t('activity:mailbox.deleteAll'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    client.send({ type: 'mailbox.clear' });
  }

  // Reset deleting state once messages are cleared (after server confirms).
  useEffect(() => {
    if (deleting && scopedMessages.length === 0) setDeleting(false);
  }, [deleting, scopedMessages.length]);
  // Timeout fallback like the purge/compact siblings below: if the clear
  // fails server-side (or a new message lands before the confirm), the
  // success condition above never fires and the button stayed disabled
  // with its spinner forever.
  useEffect(() => {
    if (deleting) {
      const t = setTimeout(() => setDeleting(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [deleting]);

  async function handlePurge() {
    const ok = await confirmModal({
      title: t('activity:mailbox.purgeConfirmTitle'),
      message: t('activity:mailbox.purgeConfirmBody'),
      confirmLabel: t('activity:mailbox.purge'),
      danger: false,
    });
    if (!ok) return;
    setPurging(true);
    client.send({ type: 'mailbox.purge' });
  }

  // Reset purging state after server confirms (ws-handlers re-queries mailbox).
  useEffect(() => {
    if (purging) {
      const t = setTimeout(() => setPurging(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [purging]);

  async function handleCompact() {
    setCompacting(true);
    client.send({ type: 'mailbox.compact' });
  }

  // Reset compacting state after server confirms.
  useEffect(() => {
    if (compacting) {
      const t = setTimeout(() => setCompacting(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [compacting]);

  function handleSendMail() {
    const body = composeBody.trim();
    const to = composeType === 'broadcast' ? '*' : composeTo.trim();
    if (!ready || body.length === 0 || to.length === 0 || sendState.phase === 'sending') return;
    const requestId = `webui-mail-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setSendState({ phase: 'sending', requestId });
    client.send({
      type: 'mailbox.send',
      payload: {
        requestId,
        to,
        type: composeType,
        audience: composeAudience,
        subject: composeSubject.trim() || t('activity:mailbox.defaultSubject'),
        body,
        priority: composePriority,
        ...(composeReplyTo ? { replyTo: composeReplyTo } : {}),
        ...(sessionId ? { sessionId } : {}),
      },
    });
  }

  /**
   * Shared prefill entry for the compose dialog. Local row-Reply and
   * cross-surface requests (detail view, command palette) funnel through
   * here; the request carries already-resolved values, only the broadcast
   * lock needs undoing for replies.
   */
  function openComposeWithPrefill(request: MailboxComposeRequest) {
    if (request.replyTo) {
      setComposeType((current) => (current === 'broadcast' ? 'note' : current));
      setComposeReplyTo(request.replyTo);
    } else {
      setComposeReplyTo(null);
    }
    if (request.to !== undefined) setComposeTo(request.to);
    if (request.subject !== undefined) setComposeSubject(request.subject);
    setSendState({ phase: 'idle' });
    setCollapsed(false); // the dialog renders inside the expanded panel body
    setComposeOpen(true);
  }

  /**
   * Reply to `m`: recipient = sender, subject gets the locale reply prefix,
   * and `replyTo` threads the payload so the server and detail view can
   * correlate the conversation.
   */
  function handleReply(m: MailboxMessage) {
    const prefix = t('activity:mailbox.replyPrefix');
    openComposeWithPrefill({
      to: m.from,
      subject: m.subject.startsWith(prefix) ? m.subject : `${prefix}${m.subject}`,
      replyTo: m.id,
    });
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card/60 backdrop-blur-sm', className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40 rounded-t-lg transition-colors"
      >
        <Mail className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground flex-1 min-w-0 truncate">
          {t('activity:nav.mailbox')}
        </span>
        {unreadCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-foreground">
            {unreadCount}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {t('activity:mailbox.onlineCount', { count: onlineCount })}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          <div className="border-b border-border pb-2">
            <button
              type="button"
              onClick={() => {
                // Opening fresh drops any reply threading from a prior reply.
                if (!composeOpen) setComposeReplyTo(null);
                setComposeOpen(!composeOpen);
              }}
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5"
              aria-expanded={composeOpen}
              aria-haspopup="dialog"
            >
              <MailPlus className="h-3.5 w-3.5" />
              {t('activity:mailbox.compose')}
              <span className="ml-auto text-muted-foreground">{composeOpen ? '−' : '+'}</span>
            </button>
            <MailboxComposeDialog
              open={composeOpen}
              onOpenChange={setComposeOpen}
              sessionId={sessionId}
              agents={agents}
              to={composeTo}
              onToChange={setComposeTo}
              type={composeType}
              onTypeChange={setComposeType}
              audience={composeAudience}
              onAudienceChange={setComposeAudience}
              priority={composePriority}
              onPriorityChange={setComposePriority}
              subject={composeSubject}
              onSubjectChange={setComposeSubject}
              body={composeBody}
              onBodyChange={setComposeBody}
              replyTo={composeReplyTo}
              ready={ready}
              sendState={sendState}
              onSend={handleSendMail}
            />
          </div>

          {/* Messages */}
          {scopedMessages.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('activity:mailbox.messages')}
                </span>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={deleting}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                  title={t('activity:mailbox.deleteAllTitle')}
                >
                  <Trash2 className="h-3 w-3" />
                  {deleting ? t('activity:mailbox.deleting') : t('activity:mailbox.deleteAll')}
                </button>
                <button
                  type="button"
                  onClick={handlePurge}
                  disabled={purging}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                  title={t('activity:mailbox.purgeTitle')}
                >
                  <Sparkles className="h-3 w-3" />
                  {purging ? t('activity:mailbox.purging') : t('activity:mailbox.purge')}
                </button>
                <button
                  type="button"
                  onClick={handleCompact}
                  disabled={compacting}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                  title={t('activity:mailbox.compactTitle')}
                >
                  <Zap className="h-3 w-3" />
                  {compacting ? t('activity:mailbox.compacting') : t('activity:mailbox.compact')}
                </button>
              </div>
              {/* Compaction result badge */}
              {lastCompaction && lastCompaction.totalRemoved > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] bg-primary/5 text-primary/70 border border-primary/10">
                  <Zap className="h-3 w-3 shrink-0" />
                  <span>
                    {t('activity:mailbox.compactRemoved', { count: lastCompaction.totalRemoved })}
                    {lastCompaction.expiredRemoved > 0 &&
                      ` (${t('activity:mailbox.compactExpired', { count: lastCompaction.expiredRemoved })})`}
                    {lastCompaction.readByAllRemoved > 0 &&
                      ` (${t('activity:mailbox.compactReadByAll', { count: lastCompaction.readByAllRemoved })})`}
                    {lastCompaction.stalePurged > 0 &&
                      ` (${t('activity:mailbox.compactStale', { count: lastCompaction.stalePurged })})`}
                    {' — '}
                    {t('activity:mailbox.compactRemaining', { count: lastCompaction.remaining })}
                  </span>
                </div>
              )}
              {messagePage.pageItems.map((m) => {
                const Icon = TYPE_ICONS[m.type] ?? MessageSquare;
                const isRead = m.readByCount > 0;
                const isSelected = selectedMailMessage?.id === m.id;
                const recipient = m.scope
                  ? { scope: m.scope, recipientSessionId: m.recipientSessionId }
                  : classifyMailboxRecipient(m.to);
                return (
                  <div key={m.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleMessageClick(m)}
                      className={cn(
                        'flex items-start gap-2 px-2 py-1.5 pr-7 rounded text-xs w-full text-left cursor-pointer transition-colors hover:bg-accent/60',
                        !isRead && 'bg-warning/8',
                        isSelected && 'ring-1 ring-primary bg-primary/5',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-3.5 w-3.5 mt-0.5 shrink-0',
                          isRead ? 'text-muted-foreground' : 'text-warning',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'truncate font-medium text-foreground',
                              !isRead && 'font-semibold',
                            )}
                          >
                            {m.from}
                          </span>
                          {m.completed && (
                            <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                          )}
                          {m.audience === 'leaders' && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[9px] font-semibold text-foreground">
                              <Lock className="h-2.5 w-2.5 text-primary" />
                              {t('activity:mailbox.leadersLabel')}
                            </span>
                          )}
                          {!isRead && (
                            <span className="text-[9px] font-bold text-foreground">
                              {t('activity:mailbox.newLabel')}
                            </span>
                          )}
                          {recipient.scope === 'session' && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-warning/12 text-foreground"
                              title={t('activity:mailbox.sessionScopeTitle', {
                                sid: recipient.recipientSessionId ?? '',
                              })}
                            >
                              <Lock className="h-2.5 w-2.5 text-warning" />
                              {t('activity:mailbox.sessionLabel')}
                            </span>
                          )}
                          {recipient.scope === 'project' && (
                            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold bg-primary/12 text-foreground">
                              {t('activity:mailbox.projectLabel')}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate">{m.subject}</div>
                        <div className="text-[10px] text-muted-foreground/70 truncate">
                          {m.body.slice(0, 60)}
                          {m.body.length > 60 ? '…' : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-muted-foreground flex flex-col items-end gap-0.5">
                        <span>{fmtTime(m.timestamp)}</span>
                        {isRead && (
                          <span className="flex items-center gap-0.5">
                            <UserCheck className="h-3 w-3" />
                            {m.readByCount}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 text-muted-foreground hover:text-primary transition-colors"
                      title={t('activity:mailbox.replyAction')}
                      aria-label={t('activity:mailbox.replyAction')}
                      onClick={() => handleReply(m)}
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              <Pagination
                page={messagePage.page}
                pageSize={messagePage.pageSize}
                totalItems={messagePage.totalItems}
                onPageChange={messagePage.setPage}
                compact
                itemLabel="messages"
              />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2 text-center">
              <MailOpen className="h-4 w-4 mx-auto mb-1 opacity-40" />
              {t('activity:mailbox.empty')}
            </div>
          )}

          {/* Online agents */}
          {scopedAgents.length > 0 && (
            <div className="border-t border-border pt-2">
              <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Users className="h-3 w-3" /> {t('activity:nav.agents')}
              </div>
              {agentPage.pageItems.map((a) => (
                <div
                  key={a.agentId}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-0.5"
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      a.online ? 'bg-success' : 'bg-muted-foreground/30',
                    )}
                  />
                  <span className="font-medium text-foreground/80">{a.name}</span>
                  {a.role && <span className="opacity-60">({a.role})</span>}
                  <span className="opacity-50">{a.status}</span>
                  {a.currentTool && <span className="text-primary">{a.currentTool}</span>}
                  <span className="ml-auto opacity-50">{fmtTime(a.lastSeenAt)}</span>
                </div>
              ))}
              <Pagination
                page={agentPage.page}
                pageSize={agentPage.pageSize}
                totalItems={agentPage.totalItems}
                onPageChange={agentPage.setPage}
                compact
                itemLabel="online agents"
              />
              {scopedAgents.filter((a) => !a.online).length > 0 && (
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {t('activity:mailbox.offlineCount', {
                    count: scopedAgents.filter((a) => !a.online).length,
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
