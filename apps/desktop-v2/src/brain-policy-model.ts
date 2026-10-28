import { brainMonitorFields } from './brain-monitor-fields';
import { record } from './engine-values';
import { sameSetting } from './settings-save-model';

export interface BrainField {
  key: string;
  label: string;
  help: string;
  kind: 'toggle' | 'number' | 'select' | 'text' | 'lines';
  options?: readonly string[];
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  read?: string;
  fallback?: string;
}
export const brainGroups: { title: string; description: string; fields: BrainField[] }[] = [
  {
    title: 'Risk & escalation',
    description:
      'Choose which decisions may be automated and how unresolved decisions reach an operator.',
    fields: [
      {
        key: 'maxAutoRisk',
        label: 'Automatic risk ceiling',
        help: 'Maximum risk considered by the model decision tier.',
        kind: 'select',
        options: ['off', 'low', 'medium', 'high', 'all'],
      },
      {
        key: 'mode',
        label: 'Escalation mode',
        help: 'Interactive asks an operator; headless uses the terminal policy.',
        kind: 'select',
        options: ['interactive', 'headless'],
      },
      {
        key: 'terminalPolicy',
        label: 'Headless decision policy',
        help: 'Conservative follows safe recommendations; deny-all refuses escalation; continue-on-recommended accepts the recommended option at any risk.',
        kind: 'select',
        options: ['conservative', 'deny-all', 'continue-on-recommended'],
      },
      {
        key: 'decisionTimeoutMs',
        label: 'Model decision timeout',
        help: 'Milliseconds per model call. Empty inherits the engine default.',
        kind: 'number',
        optional: true,
        min: 1,
      },
      {
        key: 'humanTimeoutMs',
        label: 'Operator response timeout',
        help: 'Milliseconds to wait; zero waits indefinitely. Empty inherits the engine default.',
        kind: 'number',
        optional: true,
        min: 0,
      },
      {
        key: 'decisionLogMaxEntries',
        label: 'Recent decision capacity',
        help: 'Number of decisions retained in this runtime’s rolling log.',
        kind: 'number',
        min: 1,
      },
    ],
  },
  {
    title: 'Deterministic heuristics',
    description: 'Fast decision paths that can settle recognized situations before a model call.',
    fields: [
      {
        key: 'heuristics.lowRiskAutoAnswer',
        label: 'Low-risk fast path',
        help: 'Allow the built-in low-risk heuristic.',
        kind: 'toggle',
      },
      {
        key: 'heuristics.blockedResolved',
        label: 'Resolved blockers',
        help: 'Recognize when an earlier blocker has been resolved.',
        kind: 'toggle',
      },
      {
        key: 'heuristics.deadlockSkip',
        label: 'Deadlock recovery',
        help: 'Allow the built-in deadlock-skip heuristic.',
        kind: 'toggle',
      },
      {
        key: 'heuristics.retryExhausted',
        label: 'Exhausted retries',
        help: 'Recognize the built-in exhausted-retry condition.',
        kind: 'toggle',
      },
      {
        key: 'heuristics.continuePing',
        label: 'Continuation prompts',
        help: 'Handle recognized continuation pings without a model call.',
        kind: 'toggle',
      },
    ],
  },
  {
    title: 'Decision quality',
    description:
      'Require usable answers from the single-model tier and choose how refusals end a decision.',
    fields: [
      {
        key: 'llm.rejectUncertain',
        label: 'Reject uncertain responses',
        help: 'Treat declined or empty answers as an undecided tier.',
        kind: 'toggle',
      },
      {
        key: 'llm.minConfidence',
        label: 'Minimum reported confidence',
        help: 'Fraction from zero to one; zero disables this threshold.',
        kind: 'number',
        min: 0,
        max: 1,
        step: 'any',
      },
      {
        key: 'llm.maxTokens',
        label: 'Decision output ceiling',
        help: 'Optional token cap, including model reasoning. Empty uses the model’s own ceiling.',
        kind: 'number',
        optional: true,
        min: 1,
      },
      {
        key: 'llm.denyIsTerminal',
        label: 'Model refusal policy',
        help: 'When-decided ends genuine refusals while allowing infrastructure failures to escalate.',
        kind: 'select',
        options: ['never', 'when-decided', 'always'],
      },
    ],
  },
  {
    title: 'Decision cache',
    description:
      'Reuse a previous model or council verdict for an identical question. These are decision-cache settings, separate from provider prompt caching.',
    fields: [
      {
        key: 'cache.enabled',
        label: 'Reuse cached decisions',
        help: 'Enable recorded decision reuse.',
        kind: 'toggle',
      },
      {
        key: 'cache.ttlMs',
        label: 'Decision cache lifetime',
        help: 'Milliseconds before a stored decision expires.',
        kind: 'number',
        min: 1,
      },
      {
        key: 'cache.maxEntries',
        label: 'Decision cache capacity',
        help: 'Maximum number of live cached decisions.',
        kind: 'number',
        min: 1,
      },
    ],
  },
  {
    title: 'Runtime monitor',
    description: 'Configure how the monitor responds to stalled or failing work.',
    fields: [...brainMonitorFields],
  },
  {
    title: 'Council policy',
    description:
      'Control when a multi-model panel convenes. Effective seats and judge are shown below.',
    fields: [
      {
        key: 'council.enabled',
        read: 'council.configured',
        label: 'Council enablement',
        help: 'Automatic uses the engine’s pool and voter rules.',
        kind: 'select',
        optional: true,
        options: ['true', 'false'],
      },
      {
        key: 'council.minRisk',
        label: 'Council minimum risk',
        help: 'Only decisions at or above this risk convene the council.',
        kind: 'select',
        options: ['medium', 'high', 'critical'],
      },
      {
        key: 'council.quorum',
        label: 'Council quorum',
        help: 'Fraction of seats that must return a valid vote. Empty inherits the default.',
        kind: 'number',
        min: Number.MIN_VALUE,
        max: 1,
        step: 'any',
        optional: true,
      },
      {
        key: 'council.approval',
        label: 'Council approval threshold',
        help: 'Fraction of cast vote weight the winning option must exceed.',
        kind: 'number',
        min: Number.MIN_VALUE,
        max: 1,
        step: 'any',
        optional: true,
      },
      {
        key: 'council.distinctness',
        label: 'Panel diversity',
        help: 'Ask for distinct models or providers to reduce correlated decisions.',
        kind: 'select',
        options: ['none', 'model', 'provider'],
      },
      {
        key: 'council.perCallTimeoutMs',
        label: 'Council seat timeout',
        help: 'Milliseconds per seat; empty inherits the decision timeout.',
        kind: 'number',
        min: 1,
        optional: true,
      },
      {
        key: 'council.maxConcurrency',
        label: 'Concurrent council seats',
        help: 'Seats polled concurrently, from one to eight.',
        kind: 'number',
        min: 1,
        max: 8,
        optional: true,
      },
      {
        key: 'council.deliberationRounds',
        label: 'Council deliberation rounds',
        help: 'Empty inherits the product default. The engine validates its supported limit.',
        kind: 'number',
        min: 1,
        max: 5,
        optional: true,
      },
      {
        key: 'council.voterMaxTokens',
        label: 'Voter output ceiling',
        help: 'Optional token cap; empty uses each model’s output ceiling.',
        kind: 'number',
        min: 1,
        optional: true,
      },
      {
        key: 'council.judgeMaxTokens',
        label: 'Judge output ceiling',
        help: 'Optional token cap for the tie-breaking judge.',
        kind: 'number',
        min: 1,
        optional: true,
      },
    ],
  },
  {
    title: 'Ledger & trace',
    description: 'Choose retained decision evidence and replay-trace content for this runtime.',
    fields: [
      {
        key: 'ledger.enabled',
        label: 'Record decision ledger',
        help: 'Keep decisions and observed outcomes in the runtime ledger.',
        kind: 'toggle',
      },
      {
        key: 'ledger.autoDenyAfterFailures',
        label: 'Failure denial threshold',
        help: 'Consecutive observed failures before deterministic denial; zero disables the guard.',
        kind: 'number',
        min: 0,
        optional: true,
      },
      {
        key: 'ledger.maxMemoryEntries',
        label: 'Ledger memory capacity',
        help: 'Maximum in-memory entries and disk seed size.',
        kind: 'number',
        min: 1,
        optional: true,
      },
      {
        key: 'ledger.interventionRetryWindowMs',
        label: 'Intervention retry window',
        help: 'Milliseconds during which repeated intervention marks the earlier steer as failed.',
        kind: 'number',
        min: 1,
        optional: true,
      },
      {
        key: 'trace.enabled',
        label: 'Record replay trace',
        help: 'Write per-decision tier, model and vote evidence to the trace file.',
        kind: 'toggle',
      },
      {
        key: 'trace.content',
        label: 'Replay trace content',
        help: 'Full keeps decision text; redacted truncates free text; none records metadata only.',
        kind: 'select',
        options: ['none', 'redacted', 'full'],
      },
      {
        key: 'trace.path',
        label: 'Replay trace path',
        help: 'Optional JSONL destination. Leave empty to use this runtime’s default location.',
        kind: 'text',
      },
      {
        key: 'trace.maxOpenRecords',
        label: 'Open trace record limit',
        help: 'Maximum concurrently undecided trace records.',
        kind: 'number',
        min: 1,
        fallback: '200',
      },
    ],
  },
];
export type BrainDraft = Record<string, string | boolean>;
/** Reset the whole configured monitor, including unknown future overrides, without erasing peers. */
export function brainMonitorResetPatch(
  baseline: Record<string, unknown>,
  live: Record<string, unknown>,
): Record<string, unknown> {
  const current = record(live['monitor']);
  if (Object.keys(current).length && !sameSetting(record(baseline['monitor']), current))
    throw Error('Monitor overrides changed elsewhere. Reload saved Brain values before resetting.');
  return { monitor: null };
}
export const brainValue = (config: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => record(value)[key], config);
export function brainSnapshot(reply: Record<string, unknown>): Record<string, unknown> {
  const config = record(reply['config']);
  if (
    typeof config['maxAutoRisk'] !== 'string' ||
    typeof config['mode'] !== 'string' ||
    !Array.isArray(config['models']) ||
    !config['cache'] ||
    !config['council']
  )
    throw Error('The engine did not return a readable Brain configuration.');
  return config;
}
export function brainDraft(config: Record<string, unknown>): BrainDraft {
  return Object.fromEntries(
    brainGroups
      .flatMap((group) => group.fields)
      .map((field) => {
        const value = brainValue(config, field.read ?? field.key) ?? field.fallback;
        return [
          field.key,
          field.kind === 'toggle'
            ? value === true
            : value === undefined || value === null
              ? ''
              : field.kind === 'lines' && Array.isArray(value)
                ? value.join('\n')
                : String(value),
        ];
      }),
  );
}
export function brainPatch(
  base: BrainDraft,
  draft: BrainDraft,
  live: BrainDraft,
  currentConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of brainGroups.flatMap((group) => group.fields)) {
    const value = draft[field.key];
    if (sameSetting(base[field.key], value)) continue;
    if (!sameSetting(base[field.key], live[field.key]) && !sameSetting(value, live[field.key]))
      throw Error(
        `${field.label} changed elsewhere. Reload saved Brain values before applying this edit.`,
      );
    let converted: unknown = value;
    if (value === '' && field.optional) converted = null;
    else if (field.kind === 'number') {
      converted = Number(value);
      if (
        value === '' ||
        !Number.isFinite(converted) ||
        (field.step === undefined && !Number.isSafeInteger(converted)) ||
        Number(converted) < (field.min ?? 0) ||
        Number(converted) > (field.max ?? Infinity)
      )
        throw Error(
          `${field.label} needs a valid ${field.step === undefined ? 'whole number' : 'number'} in its allowed range.`,
        );
    } else if (field.kind === 'select') {
      if (!field.options?.includes(String(value)))
        throw Error(`Choose a valid ${field.label.toLowerCase()}.`);
      if (value === 'true' || value === 'false') converted = value === 'true';
    } else if (field.kind === 'lines') {
      converted = String(value)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (field.kind === 'text') {
      converted = String(value).trim();
    } else if (typeof value !== 'boolean')
      throw Error(`${field.label} needs an enabled or disabled value.`);
    const path = field.key.split('.');
    let owner = patch;
    for (const key of path.slice(0, -1)) {
      const child = { ...record(owner[key]) };
      owner[key] = child;
      owner = child;
    }
    owner[path.at(-1)!] = converted;
  }
  const monitor = record(patch['monitor']);
  if (monitor['signals']) {
    if (!currentConfig)
      throw Error('Refresh the Brain configuration before changing monitor signals.');
    monitor['signals'] = {
      ...record(brainValue(currentConfig, 'monitor.signals')),
      ...record(monitor['signals']),
    };
  }
  return patch;
}
