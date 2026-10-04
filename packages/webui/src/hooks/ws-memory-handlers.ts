import type { WSServerMessage } from '@/types';
import { replyLane } from './ws-reply-lanes.js';

export function handleMemoryList(msg: WSServerMessage) {
  const p = msg.payload as { text: string; error?: string | undefined };
  const body = p.text?.trim();
  replyLane(msg).addMessage({
    role: 'assistant',
    content: p.error
      ? `Memory read failed: ${p.error}`
      : body
        ? `🧠 **Memory** \n\n${body}`
        : '🧠 **Memory** \n\n_empty — nothing remembered yet_',
  });
}

// ── Sage response handlers ─────────────────────────────────────

export function handleMemorySageList(msg: WSServerMessage) {
  const p = msg.payload as {
    memories?: Array<{
      id: string;
      kind: string;
      status: string;
      text: string;
      tags: string[];
      createdAt: string;
    }>;
    stats?: {
      total: number;
      byStatus: Record<string, number>;
      byKind: Record<string, number>;
      edges: number;
    };
    error?: string | undefined;
  };
  if (p.error) {
    replyLane(msg).addMessage({ role: 'assistant', content: `❌ ${p.error}` });
    return;
  }
  const memories = p.memories ?? [];
  const stats = p.stats;
  const lines: string[] = ['## 🧠 SAGE'];
  if (stats) {
    const active = stats.byStatus['active'] ?? 0;
    const stale = stats.byStatus['stale'] ?? 0;
    const archived = stats.byStatus['archived'] ?? 0;
    lines.push(
      `**Total:** ${stats.total} · Active: ${active} · Stale: ${stale} · Archived: ${archived} · Graph edges: ${stats.edges}`,
    );
    const kinds = Object.entries(stats.byKind)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(', ');
    if (kinds) lines.push(`**Kinds:** ${kinds}`);
    lines.push('');
  }
  if (memories.length === 0) {
    lines.push('_No entries to display._');
  } else {
    for (const mem of memories.slice(0, 20)) {
      const preview = mem.text.length > 80 ? `${mem.text.slice(0, 78)}…` : mem.text;
      const tags = mem.tags.length > 0 ? mem.tags.map((t) => `\`${t}\``).join(' ') : '';
      const date = mem.createdAt.slice(0, 10);
      lines.push(
        `- \`${mem.id.slice(0, 12)}…\` [${mem.kind}|${mem.status}] ${date} — ${preview}${tags ? ` ${tags}` : ''}`,
      );
    }
    if (memories.length > 20) lines.push(`_…and ${memories.length - 20} more_`);
  }
  lines.push('');
  lines.push('*Use `/memory` in the TUI or build a Memory Manager panel for full editing.*');
  replyLane(msg).addMessage({ role: 'assistant', content: lines.join('\n') });
}

export function handleMemorySageGet(msg: WSServerMessage) {
  const p = msg.payload as {
    memory?: {
      id: string;
      kind: string;
      status: string;
      text: string;
      tags: string[];
      createdAt: string;
      updatedAt: string;
      importance: number;
      confidence: number;
      anchors: Array<{ type: string; path?: string }>;
    };
    error?: string | undefined;
  };
  if (p.error) {
    replyLane(msg).addMessage({ role: 'assistant', content: `❌ ${p.error}` });
    return;
  }
  if (!p.memory) {
    replyLane(msg).addMessage({ role: 'assistant', content: '❌ Memory not found.' });
    return;
  }
  const m = p.memory;
  const tags = m.tags.length > 0 ? m.tags.map((t) => `\`${t}\``).join(' ') : '—';
  const anchors = m.anchors.length > 0 ? m.anchors.map((a) => a.path ?? a.type).join(', ') : '—';
  const lines = [
    `## 🧠 Memory: \`${m.id}\``,
    '',
    `**Text:** ${m.text}`,
    `**Kind:** \`${m.kind}\` · **Status:** \`${m.status}\``,
    `**Created:** ${m.createdAt.slice(0, 10)} · **Updated:** ${m.updatedAt.slice(0, 10)}`,
    `**Importance:** ${m.importance} · **Confidence:** ${m.confidence}`,
    `**Tags:** ${tags}`,
    `**Anchors:** ${anchors}`,
  ];
  replyLane(msg).addMessage({ role: 'assistant', content: lines.join('\n') });
}

export function handleMemorySageUpdate(msg: WSServerMessage) {
  const p = msg.payload as { memory?: Record<string, unknown>; error?: string | undefined };
  if (p.error) {
    replyLane(msg).addMessage({ role: 'assistant', content: `❌ Update failed: ${p.error}` });
    return;
  }
  if (p.memory) {
    const id = String(p.memory['id'] ?? '');
    replyLane(msg).addMessage({ role: 'assistant', content: `✅ Memory \`${id}\` updated.` });
  }
}

export function handleMemorySageRemember(msg: WSServerMessage) {
  const p = msg.payload as { memory?: Record<string, unknown>; error?: string | undefined };
  if (p.error) {
    replyLane(msg).addMessage({
      role: 'assistant',
      content: `❌ Failed to create memory: ${p.error}`,
    });
    return;
  }
  if (p.memory) {
    const id = String(p.memory['id'] ?? '');
    replyLane(msg).addMessage({ role: 'assistant', content: `✅ Memory \`${id}\` created.` });
  }
}

export function handleMemorySageRecover(msg: WSServerMessage) {
  const p = msg.payload as {
    memory?: Record<string, unknown>;
    noop?: boolean;
    activeId?: string;
    error?: string | undefined;
  };
  const chat = replyLane(msg);
  if (p.error) {
    chat.addMessage({ role: 'assistant', content: `❌ Recover failed: ${p.error}` });
    return;
  }
  if (!p.memory) return;
  const id = String(p.memory['id'] ?? '');
  if (p.noop) {
    // Already active, or superseded — `activeId` is the head of the chain.
    const target = p.activeId ?? id;
    chat.addMessage({
      role: 'assistant',
      content: `ℹ️ Nothing to recover — \`${target}\` is already the active version.`,
    });
    return;
  }
  chat.addMessage({ role: 'assistant', content: `✅ Memory \`${id}\` recovered.` });
}

export function handleMemorySageCandidateResolve(msg: WSServerMessage) {
  const p = msg.payload as {
    candidate?: { id: string; status: string };
    resolvedAction?: 'accept' | 'reject';
    error?: string | undefined;
  };
  const chat = replyLane(msg);
  if (p.error) {
    chat.addMessage({ role: 'assistant', content: `❌ Candidate resolve failed: ${p.error}` });
    return;
  }
  if (!p.candidate) return;
  const verb = p.resolvedAction === 'reject' ? 'rejected' : 'accepted';
  chat.addMessage({
    role: 'assistant',
    content: `✅ Candidate \`${p.candidate.id}\` ${verb}.`,
  });
}

export function handleMemorySageBackfillRecoverable(msg: WSServerMessage) {
  const p = msg.payload as {
    examined?: number;
    recovered?: number;
    recoverable?: number;
    dryRun?: boolean;
    error?: string | undefined;
  };
  const chat = replyLane(msg);
  if (p.error) {
    chat.addMessage({ role: 'assistant', content: `❌ Backfill failed: ${p.error}` });
    return;
  }
  const summary = `examined ${p.examined ?? 0} · recoverable ${p.recoverable ?? 0} · recovered ${p.recovered ?? 0}`;
  chat.addMessage({
    role: 'assistant',
    content: p.dryRun
      ? `ℹ️ Backfill preview (dry-run) — ${summary}. Re-run with apply to write.`
      : `✅ Backfill applied — ${summary}.`,
  });
}
