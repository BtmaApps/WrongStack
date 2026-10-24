import {
  BUG_HUNT_LIMITS,
  BUG_HUNT_MODE_DESCRIPTIONS,
  BUG_HUNT_MODE_LABELS,
  BUG_HUNT_MODE_SLUGS,
  type BugHuntLimit,
  type BugHuntMode,
  buildBugHuntMessage,
} from '@/lib/bug-hunt-message';
import { launchBuiltinRound, type RoundLauncherClient } from '@/lib/launch-builtin-round';
import { useBugHuntRunStore } from '@/stores/bug-hunt-run-store';
import { useLocalPrefs } from '@/stores/local-prefs';
import type { ChatAssistantMessage, SlashRoutingClient } from './slash-routing-types.js';

interface HuntSlashCommandRoute {
  mode: BugHuntMode;
  canonicalCmd: string;
}

const HUNT_COMMAND_ROUTES: Readonly<Record<string, HuntSlashCommandRoute>> = {
  '/bughunt': { mode: 'bughunt', canonicalCmd: '/bughunt' },
  '/sechunt': { mode: 'sechunt', canonicalCmd: '/sechunt' },
  '/secproof': { mode: 'sechunt', canonicalCmd: '/sechunt' },
  '/racehunt': { mode: 'racehunt', canonicalCmd: '/racehunt' },
  '/leakhunt': { mode: 'racehunt', canonicalCmd: '/racehunt' },
  '/flakehunt': { mode: 'racehunt', canonicalCmd: '/racehunt' },
  '/debloat': { mode: 'debloat', canonicalCmd: '/debloat' },
  '/deadcode': { mode: 'debloat', canonicalCmd: '/debloat' },
  '/excise': { mode: 'debloat', canonicalCmd: '/debloat' },
  '/uipolish': { mode: 'uipolish', canonicalCmd: '/uipolish' },
  '/a11yhunt': { mode: 'uipolish', canonicalCmd: '/uipolish' },
  '/uihunt': { mode: 'uipolish', canonicalCmd: '/uipolish' },
  '/typehunt': { mode: 'typehunt', canonicalCmd: '/typehunt' },
  '/boundaryhunt': { mode: 'typehunt', canonicalCmd: '/typehunt' },
  '/testgap': { mode: 'testgap', canonicalCmd: '/testgap' },
  '/covhunt': { mode: 'testgap', canonicalCmd: '/testgap' },
  '/invarianthunt': { mode: 'testgap', canonicalCmd: '/testgap' },
};

export function resolveHuntSlashCommand(cmd: string): HuntSlashCommandRoute | undefined {
  return HUNT_COMMAND_ROUTES[cmd.toLowerCase()];
}

function isBugHuntLimit(value: number): value is BugHuntLimit {
  return (BUG_HUNT_LIMITS as readonly number[]).includes(value);
}

export function parseWebUIHuntSlashArgs(
  rawArgs: string,
):
  | { kind: 'stop' }
  | { kind: 'help' }
  | { kind: 'error' }
  | { kind: 'start'; maxBugs: BugHuntLimit; scope: string } {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return { kind: 'start', maxBugs: 1, scope: '' };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'stop') {
    return { kind: 'stop' };
  }
  if (lower === 'help' || lower === '--help' || lower === '-h') {
    return { kind: 'help' };
  }

  const tokens = trimmed.split(/\s+/);
  let maxBugs: BugHuntLimit = 1;
  const scopeParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '--rounds' || token === '-n') {
      const next = tokens[i + 1];
      if (!next || !/^\d+$/.test(next)) {
        return { kind: 'error' };
      }
      const parsed = Number.parseInt(next, 10);
      if (!isBugHuntLimit(parsed)) {
        return { kind: 'error' };
      }
      maxBugs = parsed;
      i++;
      continue;
    }
    if (token.startsWith('--rounds=')) {
      const value = token.slice('--rounds='.length);
      if (!/^\d+$/.test(value)) {
        return { kind: 'error' };
      }
      const parsed = Number.parseInt(value, 10);
      if (!isBugHuntLimit(parsed)) {
        return { kind: 'error' };
      }
      maxBugs = parsed;
      continue;
    }
    scopeParts.push(token);
  }

  return {
    kind: 'start',
    maxBugs,
    scope: scopeParts.join(' ').trim(),
  };
}

function isFullRoundLauncherClient(
  client: SlashRoutingClient | null | undefined,
): client is SlashRoutingClient & RoundLauncherClient {
  return Boolean(
    client &&
      typeof client.on === 'function' &&
      typeof client.sendMessage === 'function' &&
      typeof client.send === 'function',
  );
}

export interface RunHuntSlashCommandOptions {
  cmd: string;
  args: string;
  sessionId?: string | null | undefined;
  isLoading: boolean;
  client: SlashRoutingClient | null | undefined;
  addMessage: (message: ChatAssistantMessage) => void;
  setLoading: (loading: boolean) => void;
}

export function runHuntSlashCommand(options: RunHuntSlashCommandOptions): boolean {
  const route = resolveHuntSlashCommand(options.cmd);
  if (!route) return false;

  const { mode, canonicalCmd } = route;
  const label = BUG_HUNT_MODE_LABELS[mode];
  const slug = BUG_HUNT_MODE_SLUGS[mode];
  const parsed = parseWebUIHuntSlashArgs(options.args);

  if (parsed.kind === 'help') {
    options.addMessage({
      role: 'assistant',
      content: `Usage: \`${canonicalCmd} [--rounds 1..10] [scope]\` or \`${canonicalCmd} stop\` — **${label}** (${BUG_HUNT_MODE_DESCRIPTIONS[mode]})`,
    });
    return true;
  }

  if (parsed.kind === 'error') {
    options.addMessage({
      role: 'assistant',
      content: `Usage: \`${canonicalCmd} [--rounds 1..10] [scope]\` — WebUI supports 1 to 10 rounds per run.`,
    });
    return true;
  }

  if (parsed.kind === 'stop') {
    const store = useBugHuntRunStore.getState();
    const targetSessionId =
      (options.sessionId && store.runs[options.sessionId] ? options.sessionId : undefined) ??
      Object.keys(store.runs)[0];
    const activeRun = targetSessionId ? store.runs[targetSessionId] : undefined;
    if (!targetSessionId || !activeRun) {
      options.addMessage({
        role: 'assistant',
        content: 'No Proof-Driven Hunt is currently active in this session.',
      });
      return true;
    }
    const activeLabel =
      activeRun.mode && activeRun.mode !== 'bughunt' ? BUG_HUNT_MODE_LABELS[activeRun.mode] : label;
    store.clear(targetSessionId);
    options.addMessage({
      role: 'assistant',
      content: `🛑 Stopping **${activeLabel}** after round ${activeRun.currentRound}/${activeRun.totalRounds} finishes. (Use \`/stop\` to abort the in-flight turn immediately.)`,
    });
    return true;
  }

  if (options.isLoading) {
    options.addMessage({
      role: 'assistant',
      content: `⏳ Wait for the current turn to finish (or use \`/stop\`) before starting **${label}**.`,
    });
    return true;
  }

  if (options.client?.isConnected === false) {
    options.addMessage({
      role: 'assistant',
      content: `⚠️ Not connected to the WrongStack server. Reconnect before starting **${label}**.`,
    });
    return true;
  }

  const { maxBugs, scope } = parsed;
  const modePatch = mode === 'bughunt' ? {} : { mode };
  const resolvedSessionId = options.sessionId ?? undefined;

  if (isFullRoundLauncherClient(options.client)) {
    const prefsState = useLocalPrefs.getState();
    launchBuiltinRound({
      client: options.client,
      slug,
      requireSoloSession: true,
      keepCompanions: true,
      subagentsAllowed: prefsState.subagentsAllowed,
      sessionId: resolvedSessionId,
      setPrefs: (patch) => useLocalPrefs.getState().set(patch),
      compose: (content) => {
        const scopeText = scope ? `${scope} and all of its descendants` : 'the whole project';
        return buildBugHuntMessage(
          `${content}

## WebUI run configuration (mandatory)
This is round 1/${maxBugs}. Investigate at most one proven bug in this round: discovery, proof, fix, verification, and cleanup. If no legitimate proof is possible, report no-proven-bug or blocked without changing production code. Stop after the round report; the WebUI will start another round only after this one finishes successfully and only while below the configured limit. Stay strictly within ${scopeText}.`,
          { scope, maxBugs, currentRound: 1, ...modePatch },
        );
      },
      onSent: (id, content) => {
        if (resolvedSessionId) {
          useBugHuntRunStore.getState().start(resolvedSessionId, {
            scope,
            totalRounds: maxBugs,
            currentRound: 1,
            requestId: id,
            ...modePatch,
          });
        }
        options.addMessage({
          id,
          role: 'user',
          content,
          bugHunt: { scope, maxBugs, currentRound: 1, ...modePatch },
        });
        options.setLoading(true);
      },
      onSettle: (state) => {
        if (state === 'error') {
          options.addMessage({
            role: 'assistant',
            content: `⚠️ Could not launch **${label}** (builtin prompt \`${slug}\` unavailable or connection timed out).`,
          });
        }
      },
    });
    return true;
  }

  const sessionKey = resolvedSessionId ?? 'default';
  useBugHuntRunStore.getState().start(sessionKey, {
    scope,
    totalRounds: maxBugs,
    currentRound: 1,
    requestId: null,
    ...modePatch,
  });
  options.client?.send?.({ type: 'prompts.content', payload: { slug } });
  options.addMessage({
    role: 'assistant',
    content: `🎯 Launching **${label}** (round 1/${maxBugs}, scope: ${scope || 'whole project'})…`,
  });
  return true;
}
