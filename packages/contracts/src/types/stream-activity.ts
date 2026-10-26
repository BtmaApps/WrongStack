/** Bounded, browser-safe telemetry for received model output (never tool output). */
export interface StreamActivity {
  startedAt: number;
  endedAt: number | null;
  lastDeltaAt: number | null;
  firstDeltaAt: number | null;
  receivedChars: number;
  requestChars: number;
  /** Output tokens the provider reported for the open request without streaming them. */
  requestTokens: number;
  settledTokens: number;
  estimated: boolean;
  requestOpen: boolean;
  phase: 'waiting' | 'thinking' | 'writing' | 'tools';
  samples: readonly { at: number; chars: number }[];
}

export const STREAM_ACTIVITY_WINDOW_MS = 4_000;
const SAMPLE_MS = 250;
const estimate = (chars: number) => Math.ceil(chars / 4);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export function startStreamActivity(now: number): StreamActivity {
  return {
    startedAt: now,
    endedAt: null,
    lastDeltaAt: null,
    firstDeltaAt: null,
    receivedChars: 0,
    requestChars: 0,
    requestTokens: 0,
    settledTokens: 0,
    estimated: false,
    requestOpen: false,
    phase: 'waiting',
    samples: [],
  };
}

/** Consume the same production events in browsers, TUI and CLI. No transcript retention dependency. */
export function reduceStreamActivity(
  previous: StreamActivity | null,
  frame: { type: string; payload?: unknown },
  now = Date.now(),
): StreamActivity | null {
  const p = record(frame.payload);
  if (frame.type === 'session.start' || frame.type === 'session.ended') return null;
  if (frame.type === 'session.run_state') {
    if (p.isRunning === true && (!previous || previous.endedAt !== null))
      return startStreamActivity(now);
    if (p.isRunning === false && previous && previous.endedAt === null)
      return { ...previous, endedAt: now };
    return previous;
  }
  if (frame.type === 'iteration.started') {
    const state = !previous || previous.endedAt !== null ? startStreamActivity(now) : previous;
    return { ...state, requestOpen: true, phase: 'waiting' };
  }
  if (frame.type === 'provider.text_delta' || frame.type === 'provider.thinking_delta') {
    if (typeof p.text !== 'string' || !p.text.length) return previous;
    const state = !previous || previous.endedAt !== null ? startStreamActivity(now) : previous;
    const at = Math.floor(now / SAMPLE_MS) * SAMPLE_MS;
    const samples = state.samples.filter((sample) => now - sample.at < STREAM_ACTIVITY_WINDOW_MS);
    const last = samples.at(-1);
    if (last?.at === at) samples[samples.length - 1] = { at, chars: last.chars + p.text.length };
    else samples.push({ at, chars: p.text.length });
    return {
      ...state,
      lastDeltaAt: now,
      firstDeltaAt: state.firstDeltaAt ?? now,
      receivedChars: state.receivedChars + p.text.length,
      requestChars: state.requestChars + p.text.length,
      requestOpen: true,
      phase: frame.type === 'provider.thinking_delta' ? 'thinking' : 'writing',
      samples,
    };
  }
  if (frame.type === 'provider.output_progress') {
    const tokens = p.tokens;
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return previous;
    const state = !previous || previous.endedAt !== null ? startStreamActivity(now) : previous;
    const span =
      typeof p.durationMs === 'number' && Number.isFinite(p.durationMs) && p.durationMs > 0
        ? Math.min(p.durationMs, STREAM_ACTIVITY_WINDOW_MS)
        : 0;
    // Spread the reported output over the time it took, so the speed reads
    // as generation rate rather than one spike when the step lands.
    const buckets = new Map<number, number>();
    for (const sample of state.samples) {
      if (now - sample.at < STREAM_ACTIVITY_WINDOW_MS) buckets.set(sample.at, sample.chars);
    }
    const last = Math.floor(now / SAMPLE_MS) * SAMPLE_MS;
    const first = Math.floor((now - span) / SAMPLE_MS) * SAMPLE_MS;
    const count = (last - first) / SAMPLE_MS + 1;
    for (let at = first; at <= last; at += SAMPLE_MS) {
      buckets.set(at, (buckets.get(at) ?? 0) + (tokens * 4) / count);
    }
    return {
      ...state,
      lastDeltaAt: now,
      firstDeltaAt: state.firstDeltaAt ?? now - span,
      requestTokens: state.requestTokens + tokens,
      requestOpen: true,
      samples: [...buckets].sort((a, b) => a[0] - b[0]).map(([at, chars]) => ({ at, chars })),
    };
  }
  if (!previous || previous.endedAt !== null) return previous;
  if (frame.type === 'provider.response') {
    const output = record(p.usage).output;
    const responseChars =
      previous.requestChars ||
      (typeof p.content === 'string'
        ? p.content.length
        : Array.isArray(p.content)
          ? p.content.reduce((sum, item) => {
              const block = record(item);
              const text =
                block.type === 'text'
                  ? block.text
                  : block.type === 'thinking'
                    ? block.thinking
                    : '';
              return sum + (typeof text === 'string' ? text.length : 0);
            }, 0)
          : 0);
    // Several providers normalize missing usage to zero. Received text cannot cost zero tokens.
    const exact =
      typeof output === 'number' &&
      Number.isInteger(output) &&
      output >= 0 &&
      (output > 0 || responseChars === 0);
    // A repeated response must not add the completed call twice.
    if (!previous.requestOpen && previous.requestChars === 0) return previous;
    return {
      ...previous,
      settledTokens:
        previous.settledTokens +
        (exact ? output : estimate(responseChars) + previous.requestTokens),
      requestChars: 0,
      requestTokens: 0,
      requestOpen: false,
      estimated: previous.estimated || !exact,
      phase: 'waiting',
    };
  }
  if (frame.type === 'tool.started') return { ...previous, phase: 'tools' };
  if (frame.type === 'tool.executed') return { ...previous, phase: 'waiting' };
  if (
    frame.type === 'run.result' ||
    frame.type === 'session.aborted' ||
    (frame.type === 'error' &&
      [
        '',
        'rate_limit',
        'user_message',
        'agent.run',
        'abort',
        'agent',
        'provider',
        'tool',
      ].includes(String(p.phase ?? '')))
  ) {
    return { ...previous, endedAt: now };
  }
  return previous;
}

export function streamActivityView(state: StreamActivity, now = Date.now()) {
  const at = state.endedAt ?? now;
  const elapsedMs = Math.max(0, at - state.startedAt);
  const recentChars = state.samples.reduce(
    (sum, sample) => sum + (at - sample.at < STREAM_ACTIVITY_WINDOW_MS ? sample.chars : 0),
    0,
  );
  const windowMs = Math.min(
    STREAM_ACTIVITY_WINDOW_MS,
    Math.max(1_000, at - (state.firstDeltaAt ?? at)),
  );
  const tokensPerSecond = recentChars / 4 / (windowMs / 1_000);
  const tokens = state.settledTokens + estimate(state.requestChars) + state.requestTokens;
  const estimated = state.estimated || state.requestChars > 0;
  const receiving =
    state.endedAt === null &&
    state.lastDeltaAt !== null &&
    at - state.lastDeltaAt < 1_500 &&
    (state.phase === 'writing' || state.phase === 'thinking');
  const seconds = Math.floor(elapsedMs / 1_000);
  return {
    tokens,
    estimated,
    tokensPerSecond,
    receiving,
    countLabel: `${estimated ? '≈' : ''}${tokens.toLocaleString('en-US')} tokens`,
    speedLabel: state.firstDeltaAt === null ? '— tok/s' : `≈${Math.round(tokensPerSecond)} tok/s`,
    elapsedLabel: seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    phaseLabel:
      state.endedAt !== null
        ? 'Finished'
        : receiving
          ? state.phase === 'thinking'
            ? 'Thinking'
            : 'Receiving'
          : state.phase === 'tools'
            ? 'Running tools'
            : state.lastDeltaAt === null
              ? 'Waiting for model'
              : 'Working',
  };
}
