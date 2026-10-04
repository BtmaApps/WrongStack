/**
 * Terminal dashboard — the WebUI host's tidy console surface.
 *
 * The server process talks to the terminal through raw `console.*` calls
 * scattered across dozens of modules (structured JSON warn/error lines,
 * `[WebUI] …` progress chatter) and, on top of that, a live status block
 * that used to be re-printed on every state change. With four tabs running
 * those streams interleaved into an unreadable wall of text.
 *
 * This module is the single coordinator for both hosts (standalone server
 * and the CLI-embedded `wstack --webui`):
 *
 *   - **A fixed status panel at the bottom.** Session rows (running/idle,
 *     iteration, subagents, elapsed) are redrawn IN PLACE with ANSI cursor
 *     moves instead of appended, so the stats stay visible without growing
 *     the scrollback. `setSessions` is fingerprint-gated: identical rows
 *     never rewrite the panel.
 *
 *   - **A bounded log window above the panel.** Forwarded `console.*`
 *     lines use a `HH:MM:SS LEVEL` prefix and expire after 30 seconds.
 *     Long/multiline messages fit on one terminal row.
 *     Structured JSON lines (the `{level,event,message,…}` shape the log
 *     shims emit) are rendered as readable single lines.
 *
 *   - **Noise control.** Repeated visible messages update one row with a
 *     count. Finished agents expire after 30 seconds, leader stats share
 *     the session row, and agent rows fit within the viewport. `quiet` keeps
 *     `log/info/debug` chatter out of the terminal entirely (ring-buffered
 *     for a failure dump) while `warn/error` still flow — the contract the
 *     CLI host's quiet surface used to own.
 *
 * Non-TTY output and `WEBUI_VERBOSE=1` bypass everything: redirected
 * output and log collectors keep the complete append-only log.
 */

import { format, stripVTControlCharacters } from 'node:util';

/** Minimal console surface the dashboard can wrap (injectable for tests). */
export interface DashboardConsoleTarget {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/** Minimal stdout surface for panel drawing (injectable for tests). */
export interface DashboardStdout {
  isTTY?: boolean | undefined;
  columns?: number | undefined;
  rows?: number | undefined;
  write(chunk: string): void;
}

/** One session row on the panel. Built by the live-status logger. */
export interface DashboardSessionRow {
  id: string;
  provider: string;
  model: string;
  isRunning: boolean;
  iteration?: { index: number; max?: number | undefined } | undefined;
  runningSubagents: number;
  totalSubagents: number;
  /** Epoch ms when the current run started, for the elapsed column. */
  runningSince?: number | undefined;
  agents?: readonly DashboardAgentRow[] | undefined;
}

/** One leader/subagent row nested under a session branch. */
export interface DashboardAgentRow {
  id: string;
  label: string;
  provider: string;
  model: string;
  status: string;
  iteration?: { index: number; max?: number | undefined } | undefined;
  toolCalls: number;
  /** Epoch ms while the agent is still active. */
  startedAt?: number | undefined;
  /** Final elapsed time for completed agents. */
  durationMs?: number | undefined;
  /** Epoch ms when the agent entered a terminal status. */
  finishedAt?: number | undefined;
}

export interface TerminalDashboardOptions {
  /** Panel title, e.g. `WebUI` / `SimpleUI`. */
  title?: string | undefined;
  /** Live access URL shown in the panel header, including its auth token when configured. */
  getUrl?: (() => string | undefined) | undefined;
  stdout?: DashboardStdout | undefined;
  consoleTarget?: DashboardConsoleTarget | undefined;
  /**
   * Mute `log/info/debug` chatter into the ring buffer; only `warn/error`
   * reach the terminal. The CLI-embedded host defaults this on (the browser
   * owns the chatter), the standalone host off.
   */
  quiet?: boolean | undefined;
  /** Pass EVERYTHING through untouched — the `WEBUI_VERBOSE=1` escape hatch. */
  verbose?: boolean | undefined;
  /** Ring-buffer size for {@link TerminalDashboard.recent}. */
  bufferLines?: number | undefined;
  /** Max session rows drawn before a `+N more` overflow line. */
  maxRows?: number | undefined;
  /** Max visible log lines kept above the live status tree. */
  maxLogRows?: number | undefined;
  /** Visible logs and finished agents expire even when the host is idle. */
  logRetentionMs?: number | undefined;
  finishedAgentRetentionMs?: number | undefined;
  maxAgentRows?: number | undefined;
  now?: (() => number) | undefined;
}

export interface TerminalDashboard {
  /** `false` when the console was left untouched (non-TTY or verbose). */
  readonly enabled: boolean;
  /** Chatter lines dropped from the terminal so far (quiet mode). */
  readonly mutedCount: number;
  /** Newest muted lines, oldest first — for a diagnostic dump on failure. */
  recent(): readonly string[];
  /** Redraw the status panel in place. No-op when the rows are unchanged. */
  setSessions(rows: readonly DashboardSessionRow[]): void;
  /** Erase the panel, stop the refresh timer, restore the console. Idempotent. */
  stop(): void;
}

const DISABLED: TerminalDashboard = {
  enabled: false,
  mutedCount: 0,
  recent: () => [],
  setSessions: () => {},
  stop: () => {},
};

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

const MUTED_LEVELS = ['log', 'info', 'debug'] as const;
const ALL_LEVELS = [...MUTED_LEVELS, 'warn', 'error'] as const;
type Level = (typeof ALL_LEVELS)[number];

const DEFAULT_MAX_ROWS = 4;
const DEFAULT_MAX_LOG_ROWS = 3;
const DEFAULT_MAX_AGENT_ROWS = 3;
const DEFAULT_RETENTION_MS = 30_000;
const DEFAULT_BUFFER_LINES = 200;

export function isWebUIVerboseEnv(env: Record<string, string | undefined> = process.env): boolean {
  for (const name of ['WEBUI_VERBOSE', 'WRONGSTACK_WEBUI_VERBOSE']) {
    const value = env[name]?.trim().toLowerCase();
    if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  }
  return false;
}

function envFlag(env: Record<string, string | undefined>, name: string): boolean {
  const value = env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function hhmmss(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${pad2(minutes)}m`;
  if (minutes > 0) return `${minutes}m${pad2(seconds)}s`;
  return `${seconds}s`;
}

function truncate(plain: string, maxWidth: number): string {
  if (maxWidth <= 0 || plain.length <= maxWidth) return plain;
  return maxWidth <= 1 ? plain.slice(0, Math.max(0, maxWidth)) : `${plain.slice(0, maxWidth - 1)}…`;
}

function compactStatus(status: string): string {
  const normalized = status.trim().toUpperCase();
  return normalized || 'UNKNOWN';
}

export function isFinishedAgentStatus(status: string): boolean {
  return [
    'completed',
    'success',
    'done',
    'failed',
    'error',
    'stopped',
    'cancelled',
    'canceled',
    'aborted',
  ].includes(status.trim().toLowerCase());
}

function formatIteration(iteration: DashboardAgentRow['iteration']): string {
  if (!iteration) return '-';
  return iteration.max ? `${iteration.index}/${iteration.max}` : String(iteration.index);
}

function formatAgentElapsed(agent: DashboardAgentRow, now: number): string {
  if (typeof agent.durationMs === 'number') return formatElapsed(agent.durationMs);
  if (typeof agent.startedAt === 'number') return formatElapsed(now - agent.startedAt);
  return '-';
}

function renderAgentLine(
  agent: DashboardAgentRow,
  prefix: string,
  width: number,
  now: number,
): string {
  const target = [agent.provider, agent.model].filter(Boolean).join('/');
  const label = `${agent.label}${agent.id ? `:${agent.id.slice(0, 8)}` : ''}`;
  const parts = [
    label,
    target || 'unknown',
    compactStatus(agent.status),
    `iter ${formatIteration(agent.iteration)}`,
    `tools ${agent.toolCalls}`,
    formatAgentElapsed(agent, now),
  ];
  return truncate(`${prefix}${parts.join('  ')}`, width);
}

function levelTag(level: Level): { text: string; color: string } {
  switch (level) {
    case 'error':
      return { text: 'ERROR', color: ANSI.red };
    case 'warn':
      return { text: 'WARN ', color: ANSI.yellow };
    case 'debug':
      return { text: 'DEBUG', color: ANSI.dim };
    default:
      return { text: 'INFO ', color: ANSI.cyan };
  }
}

/**
 * Render one structured `{level,event,message,…}` JSON line into a body
 * (event, message, `sess:` tag, scalar extras) plus the record's own level.
 * The caller stamps the timestamp and level tag exactly once — returning the
 * full line here would double-stamp. Returns `null` when the line is not a
 * structured record, in which case the raw text is shown as-is.
 */
export function prettifyStructuredLine(
  raw: string,
  colorize: boolean,
): { level: string; text: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let record: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    record = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const level = typeof record['level'] === 'string' ? record['level'] : undefined;
  const message = typeof record['message'] === 'string' ? record['message'] : undefined;
  const event = typeof record['event'] === 'string' ? record['event'] : undefined;
  if (!level || (!message && !event)) return null;

  const parts: string[] = [];
  const paint = (text: string, color: string): string =>
    colorize ? color + text + ANSI.reset : text;
  if (event) parts.push(paint(event, ANSI.cyan));
  if (message && message !== event) parts.push(message);
  if (typeof record['sessionId'] === 'string' && record['sessionId']) {
    parts.push(paint(`sess:${record['sessionId'].slice(0, 8)}`, ANSI.dim));
  }
  const skip = new Set(['level', 'event', 'message', 'timestamp', 'sessionId']);
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(paint(`${key}=${value}`, ANSI.dim));
    }
  }
  return { level, text: parts.join(' ') };
}

/**
 * Build the panel lines for the current session rows. Pure — exported for
 * tests. Lines are plain (no ANSI); the caller colorizes.
 */
export function renderSessionPanelLines(
  rows: readonly DashboardSessionRow[],
  options: {
    title: string;
    url?: string | undefined;
    maxRows?: number | undefined;
    width?: number | undefined;
    now?: number | undefined;
    maxAgentRows?: number | undefined;
    finishedAgentRetentionMs?: number | undefined;
    maxLines?: number | undefined;
  },
): string[] {
  const width = Math.max(1, options.width ?? 100);
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxAgentRows = options.maxAgentRows ?? DEFAULT_MAX_AGENT_ROWS;
  const retentionMs = options.finishedAgentRetentionMs ?? DEFAULT_RETENTION_MS;
  const now = options.now ?? Date.now();
  const runningCount = rows.filter((r) => r.isRunning).length;
  const agentCount =
    runningCount + rows.reduce((sum, r) => sum + Math.max(0, r.runningSubagents), 0);

  const headerLeft = [options.title, options.url].filter(Boolean).join(' · ');
  const headerRight = `${runningCount}/${rows.length} running · ${agentCount} agent${agentCount === 1 ? '' : 's'}`;
  const headerBody = ` ${truncate(headerLeft, Math.max(1, width - headerRight.length - 7))}  ${headerRight} `;
  const fill = Math.max(0, width - headerBody.length - 3);
  const header = `──${headerBody}${'─'.repeat(fill)}`;

  const lines: string[] = [truncate(header, width)];
  if (rows.length === 0) {
    lines.push(truncate('  no open sessions', width));
    return lines;
  }

  const shown = [...rows]
    .sort(
      (a, b) =>
        Number(b.isRunning || b.runningSubagents > 0) -
        Number(a.isRunning || a.runningSubagents > 0),
    )
    .slice(0, maxRows);
  // Reserve one row per session and an overflow notice before spending space on agents.
  let agentBudget = Math.max(
    0,
    (options.maxLines ?? Infinity) - 1 - shown.length - Number(rows.length > shown.length),
  );
  for (const [rowIndex, row] of shown.entries()) {
    // The FULL session id, not a prefix. This panel is how a user connects a
    // tab in the browser to a journal on disk — for `--resume`, for `/rewind`,
    // for finding the JSONL — and eight characters is not something you can
    // resume with. `truncate` below still protects a narrow terminal.
    const id = row.id;
    const target = [row.provider, row.model].filter(Boolean).join('/');
    const status = row.isRunning ? 'RUNNING' : 'IDLE';
    const segments: string[] = [id, target, status];
    if (row.isRunning && row.runningSince) segments.push(formatElapsed(now - row.runningSince));
    if (row.isRunning && row.iteration) {
      segments.push(
        `iter ${row.iteration.index}${row.iteration.max ? `/${row.iteration.max}` : ''}`,
      );
    }
    if (row.totalSubagents > 0) {
      segments.push(`sub ${row.runningSubagents}/${row.totalSubagents}`);
    }
    const leader = row.agents?.find((agent) => agent.id === 'leader');
    if (leader?.toolCalls) segments.push(`tools ${leader.toolCalls}`);
    const isLastSession = rowIndex === shown.length - 1 && rows.length <= shown.length;
    const sessionPrefix = isLastSession ? '  `-- ' : '  |-- ';
    lines.push(truncate(`${sessionPrefix}${segments.join('  ')}`, width));
    const eligible = (row.agents ?? []).filter(
      (agent) =>
        agent.id !== 'leader' &&
        (!isFinishedAgentStatus(agent.status) ||
          (agent.finishedAt !== undefined && now - agent.finishedAt < retentionMs)),
    );
    eligible.sort(
      (a, b) =>
        Number(isFinishedAgentStatus(a.status)) - Number(isFinishedAgentStatus(b.status)) ||
        (b.finishedAt ?? 0) - (a.finishedAt ?? 0),
    );
    const limit = Math.min(maxAgentRows, agentBudget);
    const hasOverflow = eligible.length > limit;
    const agents = eligible.slice(0, Math.max(0, limit - Number(hasOverflow)));
    agentBudget -= agents.length + Number(hasOverflow && limit > 0);
    for (const [agentIndex, agent] of agents.entries()) {
      const isLastAgent = agentIndex === agents.length - 1 && !hasOverflow;
      const branchPad = isLastSession ? '      ' : '  |   ';
      const agentPrefix = `${branchPad}${isLastAgent ? '`-- ' : '|-- '}`;
      lines.push(renderAgentLine(agent, agentPrefix, width, now));
    }
    if (hasOverflow && limit > 0) {
      lines.push(
        truncate(
          `${isLastSession ? '      ' : '  |   '}\`-- +${eligible.length - agents.length} more agents (${options.title})`,
          width,
        ),
      );
    }
  }
  if (rows.length > shown.length) {
    lines.push(truncate(`  +${rows.length - shown.length} more sessions`, width));
  }
  return lines;
}

function colorizePanelLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('──')) {
    const head = line.slice(0, line.indexOf('──') + 2);
    return `${ANSI.dim}${head}${line.slice(head.length)}${ANSI.reset}`;
  }
  if (
    trimmed === 'no open sessions' ||
    trimmed.startsWith('+') ||
    trimmed.includes('more sessions')
  ) {
    return `${ANSI.dim}${line}${ANSI.reset}`;
  }
  const running = trimmed.includes(' RUNNING');
  const idle = trimmed.includes(' IDLE');
  if (!running && !idle) return line;
  const token = running ? 'RUNNING' : 'IDLE';
  const idx = line.indexOf(token);
  const color = running ? ANSI.green : ANSI.dim;
  return `${line.slice(0, idx)}${color}${token}${ANSI.reset}${line.slice(idx + token.length)}`;
}

/**
 * Start the dashboard. Disabled (console untouched, panel never drawn) on a
 * non-TTY stdout or when `verbose` is set — redirected output and log
 * collectors keep the complete append-only log.
 */
export function startTerminalDashboard(options: TerminalDashboardOptions = {}): TerminalDashboard {
  const stdout: DashboardStdout = options.stdout ?? (process.stdout as unknown as DashboardStdout);
  const target: DashboardConsoleTarget = options.consoleTarget ?? console;
  const verbose = options.verbose ?? isWebUIVerboseEnv();
  const isTTY = stdout.isTTY === true;
  if (!isTTY || verbose) return DISABLED;

  const quiet = options.quiet ?? envFlag(process.env, 'WEBUI_QUIET');
  const bufferLines = Math.max(1, Math.trunc(options.bufferLines ?? DEFAULT_BUFFER_LINES));
  const maxRows = Math.max(1, Math.trunc(options.maxRows ?? DEFAULT_MAX_ROWS));
  const maxLogRows = Math.max(1, Math.trunc(options.maxLogRows ?? DEFAULT_MAX_LOG_ROWS));
  const logRetentionMs = Math.max(0, options.logRetentionMs ?? DEFAULT_RETENTION_MS);
  const finishedAgentRetentionMs = Math.max(
    0,
    options.finishedAgentRetentionMs ?? DEFAULT_RETENTION_MS,
  );
  const nowFn = options.now ?? (() => Date.now());
  const title = options.title ?? 'WebUI';

  const originals: Record<Level, (...args: unknown[]) => void> = {
    log: target.log,
    info: target.info,
    warn: target.warn,
    error: target.error,
    debug: target.debug,
  };
  const wrappers = {} as Record<Level, (...args: unknown[]) => void>;
  const muted: string[] = [];
  let mutedCount = 0;
  let stopped = false;
  let writeFailed = false;

  // Frame state: the dashboard owns a bounded terminal region containing the
  // recent log window plus the live tree. Repaint that region in place so the
  // visible CLI surface does not grow forever while WebUI is open.
  let frameHeight = 0;
  let frameFingerprint = '';
  let lastRows: readonly DashboardSessionRow[] = [];
  const visibleLogs: { level: Level; text: string; at: number; count: number }[] = [];

  const write = (chunk: string): void => {
    if (writeFailed) return;
    try {
      stdout.write(chunk);
    } catch {
      // A closed/piped stdout must never take the server down mid-write.
      writeFailed = true;
    }
  };

  const clearFrame = (): void => {
    if (frameHeight === 0) return;
    write(`\x1b[${frameHeight}A\r\x1b[0J`);
    frameHeight = 0;
    frameFingerprint = '';
  };

  const drawFrame = (rows: readonly DashboardSessionRow[]): void => {
    const now = nowFn();
    for (let i = visibleLogs.length - 1; i >= 0; i--) {
      if (now - visibleLogs[i]!.at >= logRetentionMs) visibleLogs.splice(i, 1);
    }
    // Leave room for the trailing cursor and separation line. Avoid scrolling
    // an owned frame off-screen, where cursor-up can no longer erase it.
    const height = Math.max(1, (stdout.rows ?? 24) - 2);
    const width = Math.max(1, (stdout.columns ?? 100) - 1);
    const logLimit = Math.min(maxLogRows, Math.max(0, height - 3));
    const logRows = logLimit > 0 ? visibleLogs.slice(-logLimit) : [];
    const visibleLogLines = logRows.map((entry) => {
      const tag = levelTag(entry.level);
      const repeat = entry.count > 1 ? `×${entry.count} ` : '';
      const body = truncate(`${hhmmss(entry.at)} ${tag.text} ${repeat}${entry.text}`, width);
      return `${tag.color}${body}${ANSI.reset}`;
    });
    const panelBudget = height - visibleLogLines.length;
    const panel = renderSessionPanelLines(rows, {
      title,
      ...(options.getUrl ? { url: options.getUrl() } : {}),
      maxRows: Math.min(maxRows, Math.max(1, panelBudget - 2)),
      width,
      now,
      maxAgentRows: options.maxAgentRows,
      finishedAgentRetentionMs,
      maxLines: panelBudget,
    });
    const lines = [...visibleLogLines, ...panel.map(colorizePanelLine)].slice(0, height);
    const fingerprint = lines.join('\n');
    if (fingerprint === frameFingerprint && frameHeight > 0) return;
    clearFrame();
    // The leading blank line separates the owned frame from any boot output
    // above it. It is counted in frameHeight and cleared on the next redraw.
    write(`\n${lines.join('\n')}\n`);
    frameHeight = lines.length + 1;
    frameFingerprint = fingerprint;
  };

  const emit = (level: Level, args: unknown[]): void => {
    const raw = format(...args);
    // Respect the record's severity before applying quiet-mode filtering.
    const structured = prettifyStructuredLine(raw, false);
    const effectiveLevel: Level =
      structured && (ALL_LEVELS as readonly string[]).includes(structured.level)
        ? (structured.level as Level)
        : level;
    if (quiet && (MUTED_LEVELS as readonly string[]).includes(effectiveLevel)) {
      mutedCount += 1;
      muted.push(raw);
      if (muted.length > bufferLines) muted.shift();
      return;
    }
    const text = stripVTControlCharacters(structured ? structured.text : raw)
      .replace(/\s+/g, ' ')
      .trim();
    const at = nowFn();
    const duplicate = visibleLogs.findIndex(
      (entry) =>
        entry.level === effectiveLevel && entry.text === text && at - entry.at < logRetentionMs,
    );
    const entry =
      duplicate >= 0
        ? visibleLogs.splice(duplicate, 1)[0]!
        : { level: effectiveLevel, text, at, count: 0 };
    entry.at = at;
    entry.count += 1;
    visibleLogs.push(entry);
    while (visibleLogs.length > maxLogRows) visibleLogs.shift();
    drawFrame(lastRows);
  };

  // Expire logs and finished agents even with no events or active sessions.
  const refreshTimer = setInterval(() => {
    if (!stopped && !writeFailed && frameHeight > 0) drawFrame(lastRows);
  }, 1_000);
  refreshTimer.unref();
  for (const level of ALL_LEVELS) {
    const wrapper = (...args: unknown[]): void => {
      if (stopped) {
        originals[level](...args);
        return;
      }
      emit(level, args);
    };
    wrappers[level] = wrapper;
    target[level] = wrapper;
  }

  return {
    enabled: true,
    get mutedCount() {
      return mutedCount;
    },
    recent: () => [...muted],
    setSessions: (rows) => {
      if (stopped || writeFailed) return;
      lastRows = rows;
      drawFrame(rows);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(refreshTimer);
      clearFrame();
      for (const level of ALL_LEVELS) {
        if (target[level] === wrappers[level]) target[level] = originals[level];
      }
    },
  };
}
