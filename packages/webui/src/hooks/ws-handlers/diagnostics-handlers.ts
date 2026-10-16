import type { WSServerMessage } from '@/types';
import { replyLane, replyMeta } from '../ws-reply-lanes.js';

export function handleConfigDoctorResult(msg: WSServerMessage) {
  const p = msg.payload as {
    success: boolean;
    applied: boolean;
    changed: boolean;
    changes: Array<{ path: string; action: 'added' | 'replaced' }>;
    configPath: string;
    backupPath?: string | undefined;
    error?: string | undefined;
  };
  const chat = replyLane(msg);
  if (!p.success) {
    chat.addMessage({
      role: 'assistant',
      content: `❌ **Config Doctor failed**\n\n${p.error ?? 'Unknown config error.'}`,
      isError: true,
    });
    return;
  }
  if (!p.changed) {
    chat.addMessage({
      role: 'assistant',
      content: `✅ **Config Doctor** — active profile config is healthy.\n\n\`${p.configPath}\``,
    });
    return;
  }

  const visible = p.changes.slice(0, 40);
  const lines = [
    p.applied
      ? `✅ **Config Doctor** — repaired ${p.changes.length} field(s).`
      : `🩺 **Config Doctor** — found ${p.changes.length} repairable field(s).`,
    '',
    ...visible.map(
      (change) =>
        `- \`${change.path}\` — ${change.action === 'added' ? 'missing default' : 'invalid shape; default required'}`,
    ),
  ];
  if (p.changes.length > visible.length) {
    lines.push(`- _…and ${p.changes.length - visible.length} more_`);
  }
  lines.push('', `Config: \`${p.configPath}\``);
  if (p.applied && p.backupPath) lines.push(`Backup: \`${p.backupPath}\``);
  if (!p.applied) lines.push('', 'Run `/doctor fix` to apply these repairs.');
  chat.addMessage({ role: 'assistant', content: lines.join('\n') });
}

export function handleSkillsList(msg: WSServerMessage) {
  const p = msg.payload as {
    enabled: boolean;
    error?: string | undefined;
    skills: Array<{
      name: string;
      description: string;
      version: string;
      source: string;
      path: string;
      trigger: string;
      scope: string[];
    }>;
  };
  if (!p.enabled) {
    replyLane(msg).addMessage({
      role: 'assistant',
      content: '🎯 **Skills** \n\n_disabled (config.features.skills = false)_',
    });
    return;
  }
  const lines = [
    `🎯 **Skills** (${p.skills.length})`,
    '',
    ...(p.skills.length === 0
      ? ['_none registered_']
      : p.skills.map(
          (s) =>
            `• \`${s.name}\`${s.version ? ` v${s.version}` : ''} _(${s.source})_ — ${s.description || s.trigger || '_no description_'}`,
        )),
  ];
  if (p.error) lines.push('', `⚠ ${p.error}`);
  replyLane(msg).addMessage({ role: 'assistant', content: lines.join('\n') });
}

export function handleDiagGet(msg: WSServerMessage) {
  // `/diag` names the session it describes; the reply belongs in that tab.
  const p = msg.payload as {
    provider: string;
    model: string;
    cwd: string;
    sessionId: string;
    tools: { count: number; names: string[] };
    maxTools: number;
    droppedTools: number;
    features: { memory: boolean; skills: boolean; modelsRegistry: boolean };
    mode: string;
    usage: { input: number; output: number; cacheRead?: number | undefined };
    messages: number;
    todos: number;
  };
  // Store the dropped count for the status-bar chip (reactive).
  // Defense-in-depth: guard against maxTools=0 (no limit) even though
  // the server already sends droppedTools=0 in that case.
  replyMeta(msg).setDroppedTools((p.maxTools ?? 0) > 0 ? (p.droppedTools ?? 0) : 0);
  replyLane(msg).addMessage({
    role: 'assistant',
    content: [
      '🩺 **Runtime diagnostics**',
      '',
      `**Provider:** \`${p.provider}\` / \`${p.model}\``,
      `**Mode:** \`${p.mode}\``,
      `**Session:** \`${p.sessionId}\``,
      `**CWD:** \`${p.cwd}\``,
      '',
      `**Tools:** ${p.tools.count}`,
      `**Messages:** ${p.messages}  ·  **Todos:** ${p.todos}`,
      `**Usage:** ${p.usage.input.toLocaleString()} in · ${p.usage.output.toLocaleString()} out${p.usage.cacheRead ? ` · ${p.usage.cacheRead.toLocaleString()} cache` : ''}`,
      '',
      `**Features:** memory=${p.features.memory ? '✓' : '✗'} · skills=${p.features.skills ? '✓' : '✗'} · modelsRegistry=${p.features.modelsRegistry ? '✓' : '✗'}`,
    ].join('\n'),
  });
}

export function handleStatsGet(msg: WSServerMessage) {
  // Every write below is addressed (`replyMeta` / `replyLane`), so the answer
  // lands in the tab that asked. The gate that used to sit here dropped a
  // background tab's own `stats.get` reply — the panel it had just opened
  // stayed blank.
  const p = msg.payload as {
    sessionId: string;
    provider: string;
    model: string;
    usage: {
      input: number;
      output: number;
      cacheRead?: number | undefined;
      cacheWrite?: number | undefined;
    };
    cache: {
      readTokens: number;
      writeTokens: number;
      hitRatio: number;
      providers?: Array<{
        provider: string;
        input: number;
        cacheRead: number;
        cacheWrite: number;
        hitRatio: number;
      }>;
      last?: { input: number; cacheRead: number; cacheWrite: number; hitRatio: number };
    } | null;
    currentRequest?: { input: number; cacheRead: number; cacheWrite: number } | undefined;
    cost: number;
    messages: number;
    readFiles: number;
    tools: number;
    sideEffectCount?: number | undefined;
    elapsedMs: number;
  };
  const elapsedSec = Math.floor(p.elapsedMs / 1000);
  const elapsed =
    elapsedSec < 60
      ? `${elapsedSec}s`
      : elapsedSec < 3600
        ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
        : `${Math.floor(elapsedSec / 3600)}h ${Math.floor((elapsedSec % 3600) / 60)}m`;

  // Live cache snapshot — drives the topbar cache badge and the
  // ContextBreakdownModal coverage bar. `currentRequest.cacheRead` is
  // the cached prefix of the most recent prompt (per-request), capped
  // at the live request size so the coverage figure never overshoots
  // what was actually sent. `usage.cacheRead` would be cumulative and
  // misleading here. `null` clears the field when the server reports
  // no cache yet.
  const lastInputTokens = replyMeta(msg).data.lastInputTokens;
  const currentRequestCacheRead = p.currentRequest?.cacheRead ?? 0;
  replyMeta(msg).setCacheStats(
    p.cache
      ? {
          readTokens: p.cache.readTokens,
          writeTokens: p.cache.writeTokens,
          hitRatio: p.cache.hitRatio,
          providers: p.cache.providers ?? [],
          coverageTokens: Math.max(0, Math.min(lastInputTokens, currentRequestCacheRead)),
          last: p.cache.last
            ? {
                hitRatio: p.cache.last.hitRatio,
                promptTokens: p.cache.last.input + p.cache.last.cacheRead + p.cache.last.cacheWrite,
              }
            : replyMeta(msg).data.cacheStats?.last,
        }
      : null,
  );

  replyLane(msg).addMessage({
    role: 'assistant',
    content: [
      '📈 **Session stats**',
      '',
      `**Session:** \`${p.sessionId}\``,
      `**Provider/Model:** \`${p.provider}\` / \`${p.model}\``,
      `**Elapsed:** ${elapsed}`,
      '',
      `**Usage:** ${p.usage.input.toLocaleString()} in · ${p.usage.output.toLocaleString()} out`,
      ...(p.cache && p.cache.readTokens > 0
        ? [
            `**Cache:** ${p.cache.readTokens.toLocaleString()} read · ${p.cache.writeTokens.toLocaleString()} write · hit ratio ${(p.cache.hitRatio * 100).toFixed(1)}% session${p.cache.last ? `, ${(p.cache.last.hitRatio * 100).toFixed(1)}% last request` : ''}`,
          ]
        : []),
      `**Cost:** ${p.cost.toFixed(4)}`,
      '',
      `**Messages:** ${p.messages}  ·  **Files read:** ${p.readFiles}  ·  **Tools available:** ${p.tools}`,
      ...(p.sideEffectCount ? [`**Side effects:** ⚠ ${p.sideEffectCount}`] : []),
    ].join('\n'),
  });
}
