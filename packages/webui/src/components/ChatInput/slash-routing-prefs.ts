import { useLocalPrefs } from '@/stores';
import type {
  ChatAssistantMessage,
  SlashRoutingClient,
  SlashRoutingClientMessage,
} from './slash-routing-types.js';

const NEXT_STEPS_LIMIT_PRESETS = [5, 10, 20, 50, 100, 0] as const;
const UNLIMITED_WORDS = new Set(['unlimited', 'inf', 'infinite', '∞', 'sonsuz', '0']);

function formatNextStepsLimit(n: number): string {
  return n <= 0 ? 'unlimited' : `${n} turns`;
}

/**
 * `/nextsteps [optional|required] [limit]` and `/nextsteps limit <n>` —
 * mirrors the CLI command. Both values are session-scoped prefs, so they go
 * through `prefs.update` stamped with this tab's session.
 */
export function runNextStepsModeCommand(
  args: string,
  client: SlashRoutingClient | null | undefined,
  addMessage: (message: ChatAssistantMessage) => void,
): boolean {
  const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const prefs = useLocalPrefs.getState();
  if (parts.length === 0 || parts[0] === 'status') {
    addMessage({
      role: 'assistant',
      content: `Next steps: **${prefs.nextStepsMode}** · auto-continue limit: **${formatNextStepsLimit(prefs.autoProceedMaxIterations)}**.`,
    });
    return true;
  }
  const [first, second] = parts;
  let mode: 'optional' | 'required' | undefined;
  let limitArg: string | undefined;
  if (first === 'optional' || first === 'required') {
    mode = first;
    limitArg = second;
  } else if ((first === 'limit' || first === 'max') && second) {
    limitArg = second;
  } else {
    const presets = NEXT_STEPS_LIMIT_PRESETS.map((n) => (n === 0 ? 'unlimited' : n)).join(' | ');
    addMessage({
      role: 'assistant',
      content: `Usage: \`/nextsteps optional\` · \`/nextsteps required [limit]\` · \`/nextsteps limit <${presets}>\`.`,
    });
    return true;
  }
  let limit: number | undefined;
  if (limitArg !== undefined) {
    limit = UNLIMITED_WORDS.has(limitArg)
      ? 0
      : /^\d+$/.test(limitArg)
        ? Number.parseInt(limitArg, 10)
        : undefined;
    if (limit === undefined) {
      addMessage({
        role: 'assistant',
        content: `Invalid limit \`${limitArg}\`. Use 5, 10, 20, 50, 100, any whole number, or unlimited.`,
      });
      return true;
    }
  }
  const patch: Record<string, unknown> = {};
  if (mode) patch['nextStepsMode'] = mode;
  if (limit !== undefined) patch['autoProceedMaxIterations'] = limit;
  prefs.set(patch as Parameters<typeof prefs.set>[0]);
  client?.send?.({
    type: 'prefs.update',
    payload: client.withSession?.(patch) ?? patch,
  } as SlashRoutingClientMessage);
  const lines: string[] = [];
  if (mode) lines.push(`Next steps → **${mode}**.`);
  if (limit !== undefined) lines.push(`Auto-continue limit → **${formatNextStepsLimit(limit)}**.`);
  addMessage({ role: 'assistant', content: lines.join(' ') });
  return true;
}

/**
 * `/yolo [on|plus|off]` — mirrors the CLI command. YOLO and YOLO+ are
 * session-scoped prefs, so they go through `prefs.update` stamped with this tab.
 */
export function runYoloCommand(
  args: string,
  client: SlashRoutingClient | null | undefined,
  addMessage: (message: ChatAssistantMessage) => void,
): boolean {
  const arg = args.trim().toLowerCase();
  const prefs = useLocalPrefs.getState();
  let patch: Record<string, unknown>;
  let message: string;
  if (!arg) {
    const state = prefs.yoloPlus ? 'YOLO+' : prefs.yolo ? 'on' : 'off';
    addMessage({ role: 'assistant', content: `YOLO mode: **${state}**.` });
    return true;
  }
  if (arg === 'plus' || arg === '+' || arg === 'all') {
    patch = { yolo: true, yoloPlus: true };
    message =
      'YOLO mode → **YOLO+** — every call is allowed, nothing will ask. Deny rules still refuse.';
  } else if (arg === 'on') {
    patch = { yolo: true, yoloPlus: false };
    message = 'YOLO mode → **on** — damaging kinds still ask.';
  } else if (arg === 'off') {
    patch = { yolo: false, yoloPlus: false };
    message = 'YOLO mode → **off** — permission prompts are active.';
  } else {
    addMessage({
      role: 'assistant',
      content: 'Usage: `/yolo` · `/yolo on` · `/yolo plus` · `/yolo off`.',
    });
    return true;
  }
  prefs.set(patch as Parameters<typeof prefs.set>[0]);
  client?.send?.({
    type: 'prefs.update',
    payload: client.withSession?.(patch) ?? patch,
  } as SlashRoutingClientMessage);
  addMessage({ role: 'assistant', content: message });
  return true;
}
