/**
 * Rendered browser smoke for the Mailbox compose dialog.
 *
 * Boots the real WebUI source through a Vite dev server (virtual harness
 * module — same pattern as user-input-browser-smoke.mjs) and drives the
 * actual MailboxPanel + MailboxComposeDialog in headless chromium:
 *
 *   - light + dark themes × 390px + 1366px viewports
 *   - geometry: dialog must stay inside the viewport, no horizontal overflow
 *   - roster pick: clicking an agent row targets that agent
 *   - Ctrl+Enter send: emits mailbox.send, ack renders "Sent · <id>"
 *   - reply prefill: a message row's Reply threads to/from/subject/replyTo
 *   - WCAG contrast audit over every text node in the open dialog
 *     (≥12px text fails below 4.5:1 per the design brief's AA contract;
 *      sub-12px labels are reported informationally)
 *
 * Screenshots land in .temp_files/mailbox-compose-smoke/. Exits non-zero on
 * any layout/flow/contrast failure and prints a JSON summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const webuiRoot = path.resolve(here, '..');
const shotDir = path.resolve(webuiRoot, '..', '..', '.temp_files', 'mailbox-compose-smoke');
fs.mkdirSync(shotDir, { recursive: true });

function harnessPlugin(source) {
  const virtualId = 'virtual:mailbox-compose-browser-smoke';
  const resolvedId = `\0${virtualId}.tsx`;
  return {
    name: 'mailbox-compose-browser-smoke',
    resolveId(id) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id) {
      return id === resolvedId ? source : undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__mailbox_compose_smoke') return next();
        const html = await server.transformIndexHtml(
          req.url,
          '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:mailbox-compose-browser-smoke"></script></body></html>',
        );
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  };
}

const pageSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { MailboxPanel } from '/src/components/MailboxPanel.tsx';
import { ensureSessionLane, setActiveSessionLane } from '/src/stores/session-lanes.ts';
import { useMailboxStore } from '/src/stores/mailbox-store.ts';
import { useConfigStore, useFleetStore, useGitChangesStore, useGoalRunStore, useGoalStateStore, useKanbanStore, useUIStore, useWorktreeStore, useChatStore } from '/src/stores/index.ts';
import { useLocalPrefs } from '/src/stores/local-prefs.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
import { AgentsPanel } from '/src/components/SidePanel/AgentsPanel.tsx';
import { ChangesPanel } from '/src/components/SidePanel/ChangesPanel.tsx';
import { SessionPanel } from '/src/components/SidePanel/SessionPanel.tsx';
import { ActivityBar } from '/src/components/activity-bar/index.tsx';
import { WorkspaceDock } from '/src/components/WorkspaceDock.tsx';
import { InspectorPanel, InspectorTrigger } from '/src/components/InspectorPanel.tsx';
import { ContextBar, ContextFillBar } from '/src/components/ContextBar.tsx';
import { WorkbenchTopbar } from '/src/components/WorkbenchTopbar.tsx';
import { FileExplorer } from '/src/components/FileExplorer.tsx';
import { ChatHeader } from '/src/components/ChatView/ChatHeader.tsx';
import { useFileStore } from '/src/stores/file-store.ts';
import { ThemeProvider } from '/src/components/ThemeProvider.tsx';
import { useNotificationStore } from '/src/stores/notification-store.ts';
import { MessageBubble } from '/src/components/MessageBubble/index.tsx';

ensureSessionLane('browser-session');
setActiveSessionLane('browser-session');

// Socket surface stub: the panel only needs (a) an "open" status so Send is
// enabled, (b) sends recorded, (c) a dispatchable mailbox.sent ack channel.
// The real singleton would stay "connecting" without a server and Ctrl+Enter
// could never fire. No server is involved anywhere in this smoke.
window.__wsSent = [];
window.__mailHandlers = new Map();
const wsClient = getWSClient(useConfigStore.getState().wsUrl);
// 'status' is a getter on the prototype — plain assignment throws
// (TypeError: which has only a getter). Shadow it with an own property.
Object.defineProperty(wsClient, 'status', {
  value: { state: 'open' },
  configurable: true,
});
wsClient.send = (message) => { window.__wsSent.push(message); };
wsClient.onStatus = () => () => {}; // never broadcast — keep ready=true
const originalOn = wsClient.on.bind(wsClient);
wsClient.on = (type, handler) => {
  const set = window.__mailHandlers.get(type) ?? new Set();
  set.add(handler);
  window.__mailHandlers.set(type, set);
  return originalOn(type, handler);
};
window.__ackMailboxSent = (requestId) => {
  for (const handler of window.__mailHandlers.get('mailbox.sent') ?? []) {
    handler({ type: 'mailbox.sent', payload: { requestId, success: true, messageId: 'smoke-' + requestId } });
  }
};

// Real theme mechanism + class, so both light and dark render the app's own
// token set rather than a hand-toggled class fighting the store.
window.__setTheme = (theme) => {
  useConfigStore.getState().setTheme(theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

// Seed the roster (online + offline mix) and expose a live message seeder
// for the reply-prefill leg.
useMailboxStore.setState({
  messages: [],
  agents: [
    { agentId: 'worker-a1b2c3d4', name: 'Parser Worker', role: 'executor', sessionId: 'browser-session', status: 'running', currentTool: 'bash', lastSeenAt: new Date().toISOString(), online: true },
    { agentId: 'reviewer-c4d5e6f7', name: 'Chimera Reviewer', role: 'reviewer', sessionId: 'browser-session', status: 'idle', lastSeenAt: new Date(Date.now() - 3600_000).toISOString(), online: false },
  ],
  lastCompaction: null,
});
window.__seedMessages = (messages) => useMailboxStore.setState({ messages });

// Seed files across every status letter so the A/success, D/destructive and
// R/info letters render and get contrast-measured alongside M and ?.
useGitChangesStore.setState({
  files: [
    { path: 'src/app.tsx', status: 'M', added: 3, deleted: 1, staged: true },
    { path: 'src/new-module.ts', status: 'A', added: 12, deleted: 0, staged: true },
    { path: 'src/legacy.ts', status: 'D', added: 0, deleted: 8, staged: true },
    { path: 'src/renamed.ts', status: 'R', added: 2, deleted: 2, staged: false },
    { path: 'README.md', status: '?', added: 0, deleted: 0, staged: false },
  ],
});

// Seed a live worktree lane + a disk orphan so the Worktrees tab renders the
// LIVE label and the orphans-clean (bg-warning) action button.
useWorktreeStore.setState({
  worktrees: [
    {
      branch: 'wstack/ap/fix-parser',
      dir: '.worktrees/fix-parser',
      status: 'active',
      baseBranch: 'main',
      insertions: 12,
      deletions: 4,
      files: 3,
      ownerLabel: 'worker-a1b2c3d4',
    },
  ],
  orphans: [{ branch: 'wstack/ap/stale-run', dir: '.worktrees/stale-run' }],
  canClean: true,
  baseBranch: 'main',
});
window.__setChangesTab = (tab) => useUIStore.getState().setChangesPanelTab(tab);

// Goal chips: run phases drive the goal chip (idle-only — its active prop is
// hardcoded false in WorkspaceDock); goal state drives the goal-state chip
// (progress % + active pulse).
useGoalRunStore.setState({
  phases: [{ id: 'p1' }],
  activePhaseId: 'p1',
  overallPercent: 42,
});
useGoalStateStore.setState({
  goal: {
    progress: 42,
    goalState: 'active',
    goal: 'Ship the contrast sweep',
    setAt: new Date().toISOString(),
  },
});

// Kanban board + one task so TaskInspectorContent renders the column badge
// (the last inspection-only contrast fix).
useKanbanStore.setState({
  activeBoard: {
    id: 'b1',
    title: 'Smoke board',
    columns: [],
    tasks: [
      {
        id: 'T-1',
        columnId: 'review',
        title: 'Audit the contrast sweep',
        description: 'Verify every mounted surface at 4.5:1.',
        priority: 'High',
        status: 'in_progress',
      },
    ],
  },
});
window.__openTaskInspector = () =>
  useUIStore.getState().openInspectorTarget({ kind: 'task', taskId: 'T-1', boardId: 'b1' });

// One unread notification so NotificationMenu's unread badge (10px,
// bg-primary/15 — inspection-fixed) renders inside the dropdown and gets
// contrast-measured.
useNotificationStore.setState({
  notifications: [
    {
      id: 'n1',
      message: 'Smoke contrast run complete',
      variant: 'info',
      timestamp: Date.now(),
      read: false,
    },
  ],
});

// Seed the fleet store so the AgentsPanel roster, the InspectorPanel agent
// tab and the InspectorTrigger badge all render (calm chrome default).
useFleetStore.setState({
  agents: new Map([
    [
      'worker-a1b2c3d4',
      {
        id: 'worker-a1b2c3d4',
        sessionId: 'browser-session',
        name: 'Parser Worker',
        status: 'running',
        iteration: 2,
        toolCalls: 5,
        costUsd: 0.12,
        currentTool: 'bash',
        // Required field — SparklineChart crashes on undefined bins.
        sparklineBins: [1, 2, 1, 3, 2, 4, 3, 2, 1, 2, 3, 1],
        // Remaining required SubagentView fields — AgentCard slices toolLog
        // and reads the ctx/extension counters directly.
        ctxPct: 42,
        ctxTokens: 42000,
        maxContext: 100000,
        extensions: 0,
        startedAt: Date.now(),
        toolLog: [{ name: 'bash', ok: true, durationMs: 1200, at: Date.now() }],
      },
    ],
  ]),
});
window.__openInspectorAgents = () =>
  useUIStore.setState({ inspectorOpen: true, inspectorTab: 'agents' });
window.__setDockSection = (section) => useUIStore.getState().setDockSection(section);
window.__setChromeLevel = (level) => useLocalPrefs.setState({ chromeLevel: level });

// File tree aligned with the git fixture paths so TreeRow's status letters
// (its own hue-class map) render for the audit.
useFileStore.setState({
  tree: [
    {
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [
        { name: 'app.tsx', path: 'src/app.tsx', type: 'file', size: 1200, lastModified: Date.now() },
        { name: 'new-module.ts', path: 'src/new-module.ts', type: 'file', size: 800, lastModified: Date.now() },
        { name: 'legacy.ts', path: 'src/legacy.ts', type: 'file', size: 900, lastModified: Date.now() },
        { name: 'renamed.ts', path: 'src/renamed.ts', type: 'file', size: 700, lastModified: Date.now() },
      ],
    },
    { name: 'README.md', path: 'README.md', type: 'file', size: 400, lastModified: Date.now() },
  ],
});

// Mount the swept sidebar panels below the MailboxPanel: the audit walks
// all of #root, so every mounted panel surface gets contrast-measured.
createRoot(document.getElementById('root')).render(
  React.createElement(
    'div',
    { className: 'flex flex-col gap-2 p-2' },
    React.createElement(MailboxPanel),
    React.createElement(AgentsPanel),
    React.createElement(ChangesPanel),
    React.createElement(SessionPanel),
    React.createElement(ActivityBar),
    React.createElement(WorkspaceDock),
    React.createElement(InspectorTrigger),
    React.createElement(InspectorPanel),
    React.createElement(ContextFillBar, {
      pct: 42,
      tokens: 42000,
      maxTokens: 100000,
      cache: { readTokens: 8000, writeTokens: 2000, hitRatio: 0.8, coverageTokens: 6000 },
    }),
    React.createElement(ContextBar, {
      pct: 42,
      tokens: 42000,
      maxTokens: 100000,
      cache: { readTokens: 8000, writeTokens: 2000, hitRatio: 0.8, coverageTokens: 6000 },
    }),
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(WorkbenchTopbar, {
        currentView: 'chat',
        projectName: 'WrongStack',
        sessionLabel: 'browser-session',
        isLoading: false,
        iteration: 2,
        onPalette: () => {},
        onSettings: () => {},
      }),
    ),
    React.createElement(
      'div',
      { className: 'h-64 overflow-hidden' },
      React.createElement(FileExplorer),
    ),
    // The REAL ChatHeader so ContextFillBar (cache-hit readout) renders
    // inside its actual header background stack, not standalone.
    React.createElement(ChatHeader, {
      sidebarOpen: true,
      toggleSidebar: () => {},
      agentState: 'idle',
      stateTone: 'text-muted-foreground',
      sessionId: 'browser-session',
      renamingTitle: false,
      setRenamingTitle: () => {},
      titleDraft: 'Smoke session',
      setTitleDraft: () => {},
      nickname: 'Smoke',
      sessionTitle: 'Smoke session',
      setSessionNickname: () => {},
      historyEntries: [],
      switcherRef: { current: null },
      switcherOpen: false,
      setSwitcherOpen: () => {},
      handleHistorySelect: () => {},
      iteration: 2,
      autonomy: 'supervised',
      handleAutonomyChange: () => {},
      memoryPanelOpen: false,
      setMemoryPanelOpen: () => {},
      activeMemoryCount: 0,
      processOpen: false,
      setProcessOpen: () => {},
      checkpointOpen: false,
      setCheckpointOpen: () => {},
      toolStatsOpen: false,
      setToolStatsOpen: () => {},
      hasStatusContent: false,
      lastInputTokens: 42000,
      ctxPct: 42,
      maxContext: 100000,
      cacheStats: {
        readTokens: 8000,
        writeTokens: 2000,
        hitRatio: 0.8,
        coverageTokens: 6000,
      },
      setBreakdownOpen: () => {},
      contextLimitWarning: false,
      setEditorOpen: () => {},
      totalTokens: 5918,
      startTime: Date.now(),
      formatDuration: () => '2m',
      onToggleAutoCollapse: () => {},
    }),
    // ChatView transcript surfaces: text, a fenced diff block (renders via
    // markdownComponents), and a tool-use message (ToolLedgerCard). readOnly
    // withholds leader-lane actions; the audit measures every text node.
    React.createElement(MessageBubble, {
      readOnly: true,
      isFirst: true,
      message: {
        id: 'm-user',
        role: 'user',
        content: 'Ship the contrast fix and show the diff.',
        timestamp: Date.now(),
      },
    }),
    React.createElement(MessageBubble, {
      readOnly: true,
      message: {
        id: 'm-diff',
        role: 'assistant',
        content:
          'Here is the change:\\n\\n\`\`\`diff\\n- const old = text-warning;\\n+ const fixed = text-foreground;\\n\`\`\`\\n',
        timestamp: Date.now(),
      },
    }),
    React.createElement(MessageBubble, {
      readOnly: true,
      message: {
        id: 'm-tool',
        role: 'tool',
        toolName: 'bash',
        content: 'exit 0 — 3 files changed, 12 insertions(+), 4 deletions(-)',
        timestamp: Date.now(),
      },
    }),
    // Remaining card states. The error message is seeded into the chat store
    // via addMessage so isLatestAssistant resolves (it scans store messages)
    // and mounts WITHOUT readOnly — readOnly suppresses the Continue
    // recovery action. Stale timestamp disarms the auto-continue countdown.
    (() => {
      const errorMessage = {
        id: 'm-err',
        role: 'assistant',
        isError: true,
        content: 'Model request failed: provider rate limit (429). Retry the run to continue.',
        timestamp: Date.now() - 120000,
      };
      useChatStore.getState().addMessage(errorMessage);
      return React.createElement(MessageBubble, { message: errorMessage });
    })(),
    React.createElement(MessageBubble, {
      readOnly: true,
      message: {
        id: 'm-think',
        role: 'assistant',
        content: 'Applying the fix now.',
        thinkingLog: {
          text: 'Weighing the tint-carries-hue convention against neutral tokens for the status word. Neutral tokens are palette-immune; the dot already carries the warning hue.',
        },
        timestamp: Date.now(),
      },
    }),
    React.createElement(MessageBubble, {
      readOnly: true,
      message: {
        id: 'm-hunt',
        role: 'assistant',
        content: 'Bug hunt in progress.',
        bugHunt: { currentRound: 2, maxBugs: 3, scope: 'packages/webui' },
        timestamp: Date.now(),
      },
    }),
    React.createElement(MessageBubble, {
      readOnly: true,
      message: {
        id: 'm-perf',
        role: 'assistant',
        content: 'Performance run scheduled.',
        perfRun: { mode: 'ratchet', scope: 'packages/webui', metric: 'wall-ms' },
        timestamp: Date.now(),
      },
    }),
  ),
);
window.__mailboxSmokeReady = true;
`;

async function start() {
  const server = await createServer({
    root: webuiRoot,
    configFile: path.join(webuiRoot, 'vite.config.ts'),
    plugins: [harnessPlugin(pageSource)],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
  return { server, url: `http://127.0.0.1:${address.port}/__mailbox_compose_smoke` };
}

async function assertDialogGeometry(page, width, height) {
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  if (!box) throw new Error(`Dialog had no visible geometry at ${width}x${height}`);
  const epsilon = 1;
  if (
    box.x < -epsilon ||
    box.y < -epsilon ||
    box.x + box.width > width + epsilon ||
    box.y + box.height > height + epsilon
  ) {
    throw new Error(
      `Dialog escaped ${width}x${height}: ${JSON.stringify({
        box,
        viewport: await page.evaluate(() => ({ innerWidth, innerHeight })),
      })}`,
    );
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) {
    throw new Error(`Horizontal overflow of ${overflow}px at ${width}x${height}`);
  }
}

async function shot(page, name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(webuiRoot, file);
}

// Contrast audit runs inside the page: walks every text node on BOTH
// mounted surfaces — the open (portaled) dialog AND the MailboxPanel
// sidebar under #root — resolves the effective background by
// alpha-compositing ancestor layers, and computes WCAG ratios. Free
// variables don't survive page.evaluate stringification — everything is
// self-contained here.
const CONTRAST_AUDIT = `(() => {
  // The Radix dialog AND Sheet both portal to document.body with
  // role="dialog" — walk EVERY dialog root (compose dialog + inspector
  // sheet) plus the MailboxPanel surface under #root.
  const roots = [
    ...Array.from(document.querySelectorAll('[role="dialog"], [role="menu"]')).map((el, i) => ({
      el,
      surface: 'dialog-' + i,
    })),
    { el: document.getElementById('root'), surface: 'panel' },
  ];
  if (!roots.some((r) => r.surface.indexOf('dialog') === 0)) return { error: 'no dialog' };
  const parse = (s) => {
    const m = (s || '').match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?\\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const over = (t, u) => ({
    r: t.r * t.a + u.r * (1 - t.a),
    g: t.g * t.a + u.g * (1 - t.a),
    b: t.b * t.a + u.b * (1 - t.a),
    a: t.a + u.a * (1 - t.a),
  });
  const effectiveBg = (el) => {
    let acc = null;
    let node = el;
    while (node && node instanceof Element) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : c;
      if (acc && acc.a >= 0.999) break;
      node = node.parentElement;
    }
    return acc && acc.a > 0 ? over(acc, { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 255, b: 255, a: 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (fg, bg) => {
    const l1 = lum(fg); const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const rows = [];
  for (const { el: rootEl, surface } of roots) {
    if (!rootEl) continue;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || el.closest('script,style')) continue;
      // Skip decorative glyphs inside role=img spans (e.g. the sparkline's
      // '░░░' idle state) — their meaning is the aria-label, not the text,
      // and they are intentionally near-background. Same for aria-hidden
      // content (e.g. the concurrency gauge's block glyphs) — it is removed
      // from the accessibility tree by definition.
      if (el.closest('[role="img"], [aria-hidden]')) continue;
      const cs = getComputedStyle(el);
      const fgRaw = parse(cs.color);
      if (!fgRaw) continue;
      const bg = effectiveBg(el);
      // Blend alpha text (e.g. text-foreground/80) over the resolved
      // background before measuring — an unblended alpha color would
      // overstate its own contrast.
      const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
      const fontSize = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const r = ratio(fg, bg);
      rows.push({
        surface,
        text: text.slice(0, 40),
        fontSize,
        weight,
        ratio: Math.round(r * 100) / 100,
        html:
          el.outerHTML.length > 140 ? el.outerHTML.slice(0, 140) + '…' : el.outerHTML,
        fg:
          'rgb(' + Math.round(fg.r) + ',' + Math.round(fg.g) + ',' + Math.round(fg.b) + ')',
        bg:
          'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
      });
    }
  }
  return { rows };
})()`;

async function auditContrast(page) {
  // CONTRAST_AUDIT is a self-invoking expression string — evaluate it
  // directly; wrapping it in an extra ()() would call the returned object.
  const result = await page.evaluate(CONTRAST_AUDIT);
  if (!result || result.error) throw new Error(`Contrast audit failed: ${JSON.stringify(result)}`);
  const failures = [];
  for (const row of result.rows) {
    const isLarge = row.fontSize >= 24 || (row.fontSize >= 18.66 && row.weight >= 700);
    const needed = isLarge ? 3 : 4.5;
    // Uniform since 2026-10-03: every text node — including sub-12px — must
    // meet 4.5:1 (3:1 large text) in BOTH light and dark themes.
    if (row.ratio < needed) failures.push({ ...row, needed });
  }
  return { failures };
}

/**
 * Focus-indicator contract — the rendered twin of the contrast audit.
 *
 * Every control reached by Tab must show the single `--ring` indicator. Two
 * defects this catches that contrast ratios never would:
 *
 *  - an `outline-none` regression. The Tailwind `utilities` layer outranks the
 *    app's `:focus-visible` rule, so the class silently deletes the focus
 *    affordance and every text contrast ratio stays green.
 *  - a ring that falls back to `currentColor` (the icon's own colour) instead
 *    of the token — which is what a transitioned `outline-color` looks like
 *    when sampled mid-flight.
 *
 * Driven with real key presses: `:focus-visible` is a keyboard-only state and
 * cannot be asserted from a programmatic `.focus()`.
 */
async function auditFocusRing(page) {
  const TAB_STOPS = 24;
  const seen = new Set();
  const failures = [];
  for (let i = 0; i < TAB_STOPS; i += 1) {
    await page.keyboard.press('Tab');
    const row = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      // Resolve --ring through a probe so the assertion follows the active
      // palette/theme instead of a hardcoded rgb.
      const probe = document.createElement('span');
      probe.style.color = 'hsl(var(--ring))';
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return {
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 40),
        outlineWidth: parseFloat(cs.outlineWidth) || 0,
        outlineStyle: cs.outlineStyle,
        outlineColor: cs.outlineColor,
        token,
      };
    });
    if (!row) continue;
    const key = `${row.tag}:${row.name}`;
    if (seen.has(key)) break; // wrapped around the document
    seen.add(key);
    const rgb = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b] = m[1].split(/[,/]/).map(parseFloat);
      return [r, g, b];
    };
    const actual = rgb(row.outlineColor);
    const expected = rgb(row.token);
    if (
      row.outlineWidth < 2 ||
      row.outlineStyle === 'none' ||
      /transparent/.test(row.outlineColor)
    ) {
      failures.push({ ...row, reason: 'no visible focus ring' });
    } else if (!actual || !expected || actual.some((v, idx) => Math.abs(v - expected[idx]) > 2)) {
      failures.push({ ...row, reason: 'focus ring is not the --ring token' });
    }
  }
  return { failures, stops: seen.size };
}

async function runCombo(browser, url, theme, width, height) {
  // Pin the browser locale: accessible-name assertions expect English.
  const context = await browser.newContext({ locale: 'en-US', viewport: { width, height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack ? error.stack : String(error)));
  // Module-load failures fire on the script element, NOT window.onerror —
  // capture console errors + failed requests so a dead ready-flag run
  // still reports its cause.
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push('CONSOLE: ' + msg.text());
  });
  page.on('requestfailed', (req) =>
    pageErrors.push('REQFAIL: ' + req.url() + ' ' + (req.failure()?.errorText ?? '')),
  );
  const screenshots = [];
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__mailboxSmokeReady === true);
    await page.evaluate((t) => window.__setTheme(t), theme);

    // ── Compose open ──
    await page.getByRole('button', { name: /compose message/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await assertDialogGeometry(page, width, height);
    // Both cache-hit readouts — standalone bars AND inside the real
    // ChatHeader — must render so both contexts get measured.
    const cacheLines = await page.getByText(/hit/i).count();
    if (cacheLines < 2) throw new Error('cache-hit readouts missing (standalone + ChatHeader)');
    const contrastOpen = await auditContrast(page);
    screenshots.push(await shot(page, `compose-open-${theme}-${width}`));

    // ── Guard states: audience=leaders, then assign-with-'*' ──
    await page.getByLabel('Audience').selectOption('leaders');
    await page.getByText(/only leader agents/i).waitFor();
    await assertDialogGeometry(page, width, height);
    const contrastLeaders = await auditContrast(page);
    screenshots.push(await shot(page, `hint-leaders-${theme}-${width}`));
    await page.getByLabel('Audience').selectOption('all');

    await page.getByRole('button', { name: 'Broadcast', exact: true }).click();
    await page.getByLabel('Type').selectOption('assign');
    await page.getByText(/specific recipient/i).waitFor();
    if (!(await page.getByRole('button', { name: /^send$/i }).isDisabled())) {
      throw new Error(`assign-with-'*' guard did not disable Send at ${theme}/${width}`);
    }
    await assertDialogGeometry(page, width, height);
    const contrastAssign = await auditContrast(page);
    screenshots.push(await shot(page, `hint-assign-${theme}-${width}`));
    // Reset to the defaults the roster-pick leg below expects.
    await page.getByLabel('Type').selectOption('note');
    await page.getByRole('button', { name: 'leader', exact: true }).click();

    // ── Roster pick ──
    await page.getByRole('button', { name: /worker-a1b2c3d4/i }).click();
    const picked = await page.getByPlaceholder('leader').inputValue();
    if (picked !== 'worker-a1b2c3d4') {
      throw new Error(`Roster pick failed at ${theme}/${width}: input=${picked}`);
    }

    // ── Ctrl+Enter send + ack ──
    await page.getByPlaceholder('Message body').fill('Roster pick smoke');
    await page.keyboard.press('Control+Enter');
    const sent = await page.evaluate(() => window.__wsSent.find((m) => m.type === 'mailbox.send'));
    if (sent?.payload?.to !== 'worker-a1b2c3d4' || sent.payload?.body !== 'Roster pick smoke') {
      throw new Error(
        `Ctrl+Enter send wrong payload at ${theme}/${width}: ${JSON.stringify(sent?.payload)}`,
      );
    }
    await page.evaluate((requestId) => window.__ackMailboxSent(requestId), sent.payload.requestId);
    await page.getByText(/sent · smoke-/i).waitFor();

    // ── Reply prefill ──
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      // Two messages: the reviewer ask (leaders audience + session-scoped
      // recipient → renders the leaders and session badges) and a broadcast
      // (project badge) — so every 9px row badge gets contrast-measured too.
      window.__seedMessages([
        {
          id: 'smoke-reply-1',
          from: 'reviewer-c4d5e6f7',
          to: '@session:browser-session',
          type: 'ask',
          subject: 'Deploy window?',
          body: 'Can I deploy now?',
          priority: 'normal',
          audience: 'leaders',
          readBy: {},
          readByCount: 0,
          completed: false,
          timestamp: new Date().toISOString(),
          senderSessionId: 'browser-session',
        },
        {
          id: 'smoke-broadcast-1',
          from: 'worker-a1b2c3d4',
          to: '*',
          type: 'broadcast',
          subject: 'Fleet status',
          body: 'All systems nominal.',
          priority: 'normal',
          readBy: {},
          readByCount: 0,
          completed: false,
          timestamp: new Date().toISOString(),
          senderSessionId: 'browser-session',
        },
      ]);
    });
    await page.getByRole('button', { name: 'Reply' }).first().click();
    await dialog.waitFor();
    await assertDialogGeometry(page, width, height);
    const replyTo = await page.getByPlaceholder('leader').inputValue();
    const replySubject = await page.getByPlaceholder('Subject (optional)').inputValue();
    if (replyTo !== 'reviewer-c4d5e6f7' || replySubject !== 'Re: Deploy window?') {
      throw new Error(
        `Reply prefill wrong at ${theme}/${width}: to=${replyTo} subject=${replySubject}`,
      );
    }
    const contrastReply = await auditContrast(page);
    screenshots.push(await shot(page, `reply-prefill-${theme}-${width}`));

    // ── Worktrees tab: live row + orphans-clean button ──
    await page.evaluate(() => window.__setChangesTab('worktrees'));
    await page.getByText(/clean orphans/i).waitFor();
    const contrastWorktrees = await auditContrast(page);
    screenshots.push(await shot(page, `worktrees-${theme}-${width}`));

    // ── Inspector sheet (calm chrome): agent tab chips + badges ──
    await page.evaluate(() => window.__openInspectorAgents());
    // The sheet portals to body; disambiguate from the compose dialog (which
    // also lists the agent in its roster) via its stable test id.
    const sheet = page.getByTestId('inspector-drawer');
    await sheet.waitFor();
    // Select the agent → the selected-row chip (sub-12px primary tint) renders.
    await sheet.getByText('Parser Worker').first().click();
    await page.waitForTimeout(150);
    const contrastInspectorA = await auditContrast(page);
    // Filter to 'completed' (no completed agents) → active filter chip +
    // clear-filter link render.
    const completedFilter = sheet.getByRole('button', { name: /^completed$/i }).first();
    if (await completedFilter.count()) {
      await completedFilter.click();
      await page.waitForTimeout(150);
    }
    const contrastInspectorB = await auditContrast(page);
    screenshots.push(await shot(page, `inspector-${theme}-${width}`));

    // ── Dock active chip (full chrome; closes the sheet as a side effect) ──
    await page.evaluate(() => {
      window.__setChromeLevel('full');
      window.__setDockSection('work');
    });
    // Opening the sheet dismissed the compose dialog (Radix outside-
    // interaction) and setDockSection closed the sheet — reopen the dialog
    // so the audit still covers both surfaces.
    await page.getByRole('button', { name: /compose message/i }).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(300);
    const contrastDock = await auditContrast(page);
    screenshots.push(await shot(page, `dock-active-${theme}-${width}`));

    // Active variants of the kept taxonomy pairs: goal-state (destructive)
    // and fleet (success). The goal chip itself is idle-only by design.
    for (const section of ['goal-state', 'fleet']) {
      await page.evaluate((s) => window.__setDockSection(s), section);
      await page.waitForTimeout(150);
      const more = await auditContrast(page);
      contrastDock.failures.push(...more.failures);
    }

    // ── Task inspector: column badge + detail readouts ──
    await page.evaluate(() => window.__openTaskInspector());
    const taskSheet = page.getByTestId('inspector-drawer');
    await taskSheet.waitFor();
    await taskSheet.getByText('Audit the contrast sweep').first().waitFor();
    const contrastTask = await auditContrast(page);
    screenshots.push(await shot(page, `task-inspector-${theme}-${width}`));

    // ── Notification dropdown: unread badge + item rows (menu root) ──
    // Close BOTH layers first: the inspector sheet (topmost) and the
    // compose dialog beneath it (programmatic sheet-opening never fired
    // Radix's outside-pointer dismissal, so the dialog + its z-50 overlay
    // still intercept the bell).
    await page.keyboard.press('Escape');
    await page.getByTestId('inspector-drawer').waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // The topbar renders two chrome layouts (responsive); target the
    // actually-visible trigger — .first() alone can resolve to a hidden one.
    await page.locator('[data-testid="notification-menu-trigger"] >> visible=true').first().click();
    await page.getByRole('menu').first().waitFor();
    await page.waitForTimeout(150);
    const contrastNotif = await auditContrast(page);
    screenshots.push(await shot(page, `notifications-${theme}-${width}`));
    await page.keyboard.press('Escape');

    // Focus indicator: every control reached by Tab must show the single
    // --ring affordance. Runs after the dropdown is dismissed so the sweep
    // starts from a clean document.
    const focusRing = await auditFocusRing(page);

    const contrast = {
      failures: [
        ...contrastOpen.failures,
        ...contrastLeaders.failures,
        ...contrastAssign.failures,
        ...contrastReply.failures,
        ...contrastWorktrees.failures,
        ...contrastInspectorA.failures,
        ...contrastInspectorB.failures,
        ...contrastDock.failures,
        ...contrastTask.failures,
        ...contrastNotif.failures,
      ],
    };
    return {
      theme,
      viewport: `${width}x${height}`,
      checks: 'passed',
      screenshots,
      contrast,
      focusRing,
      pageErrors,
    };
  } catch (error) {
    await shot(page, `FAILURE-${theme}-${width}`).catch(() => undefined);
    return {
      theme,
      viewport: `${width}x${height}`,
      checks: 'failed',
      error: String(error),
      screenshots,
      pageErrors,
    };
  } finally {
    await page.close();
    await context.close();
  }
}

const { server, url } = await start();
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [1366, 768],
    ]) {
      results.push(await runCombo(browser, url, theme, width, height));
    }
  }
  const failed = results.filter((r) => r.checks === 'failed');
  const contrastFailures = results.flatMap((r) =>
    (r.contrast?.failures ?? []).map((f) => ({ combo: `${r.theme}/${r.viewport}`, ...f })),
  );
  // Focus-indicator contract, enforced by the same rendered gate as the
  // contrast ratios: an `outline-none` regression or a ring that falls back
  // to currentColor must fail here, not ship.
  const focusRingFailures = results.flatMap((r) =>
    (r.focusRing?.failures ?? []).map((f) => ({ combo: `${r.theme}/${r.viewport}`, ...f })),
  );
  const pageErrors = results.flatMap((r) => r.pageErrors ?? []);
  const passed =
    failed.length === 0 &&
    contrastFailures.length === 0 &&
    focusRingFailures.length === 0 &&
    pageErrors.length === 0;
  process.stdout.write(
    `${JSON.stringify({ passed, results, contrastFailures, focusRingFailures, pageErrors, screenshotDir: path.relative(webuiRoot, shotDir) }, null, 2)}\n`,
  );
  if (!passed) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
