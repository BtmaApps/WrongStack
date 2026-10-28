import { record } from './engine-values';

export const modelEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export interface ReasoningOptionDraft {
  type: string;
  values: string[];
  min: string;
  max: string;
  source: Record<string, unknown>;
}
export interface ModelAdvancedDraft {
  status: string;
  experimental: string;
  npm: string;
  api: string;
  interleaved: string;
  field: string;
  options: ReasoningOptionDraft[];
  runtimePolicy: 'preserve' | 'catalog' | 'custom';
  runtime: {
    default: string;
    disableSupported: boolean;
    effortSupported: string;
    effortLevels: string[];
    preserveThinking: string;
  };
}
export function modelAdvancedDraft(md: Record<string, unknown>): ModelAdvancedDraft {
  const raw = md['reasoning_options'];
  const options = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const interleaved = md['interleaved'];
  const wire = record(md['provider']);
  const runtime = record(md['reasoningConfig']);
  const text = (value: unknown) => (value === undefined ? '' : String(value));
  return {
    runtimePolicy: md['reasoningConfig'] !== undefined ? 'preserve' : 'catalog',
    runtime: {
      default: typeof runtime['default'] === 'string' ? runtime['default'] : 'enabled',
      disableSupported: runtime['disableSupported'] === true,
      effortSupported:
        typeof runtime['effortSupported'] === 'boolean'
          ? String(runtime['effortSupported'])
          : 'inherit',
      effortLevels: Array.isArray(runtime['effortLevels'])
        ? (runtime['effortLevels'] as string[])
        : [],
      preserveThinking:
        typeof runtime['preserveThinking'] === 'string'
          ? runtime['preserveThinking']
          : 'unsupported',
    },
    status: text(md['status']),
    experimental: typeof md['experimental'] === 'boolean' ? String(md['experimental']) : 'inherit',
    npm: text(wire['npm']),
    api: text(wire['api']),
    interleaved:
      typeof interleaved === 'boolean'
        ? String(interleaved)
        : interleaved && typeof interleaved === 'object'
          ? 'field'
          : 'inherit',
    field: text(record(interleaved)['field']),
    options: options.map((item) => {
      const option = record(item);
      return {
        type: text(option['type']),
        values: Array.isArray(option['values']) ? (option['values'] as string[]) : [],
        min: text(option['min']),
        max: text(option['max']),
        source: option,
      };
    }),
  };
}
export function applyModelAdvanced(md: Record<string, unknown>, draft: ModelAdvancedDraft) {
  const before = modelAdvancedDraft(md);
  const changed = (key: keyof ModelAdvancedDraft) =>
    JSON.stringify(before[key]) !== JSON.stringify(draft[key]);
  if (changed('status')) {
    if (draft.status.trim()) md['status'] = draft.status.trim();
    else delete md['status'];
  }
  if (changed('experimental')) {
    if (draft.experimental === 'inherit') delete md['experimental'];
    else if (['true', 'false'].includes(draft.experimental))
      md['experimental'] = draft.experimental === 'true';
    else throw Error('Choose a valid experimental status.');
  }
  if (changed('npm') || changed('api')) {
    const provider = { ...record(md['provider']) };
    for (const key of ['npm', 'api'] as const) {
      const value = draft[key].trim();
      if (key === 'api' && value) {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw Error('Model API endpoint must be an HTTP or HTTPS URL.');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw Error('Model API endpoint must be an HTTP or HTTPS URL without credentials.');
      }
      if (value) provider[key] = value;
      else delete provider[key];
    }
    if (Object.keys(provider).length) md['provider'] = provider;
    else delete md['provider'];
  }
  if (changed('interleaved') || changed('field')) {
    if (draft.interleaved === 'inherit') delete md['interleaved'];
    else if (['true', 'false'].includes(draft.interleaved))
      md['interleaved'] = draft.interleaved === 'true';
    else if (draft.interleaved === 'field') {
      const field = draft.field.trim();
      if (!field || /[\u0000-\u001f]/.test(field))
        throw Error('Enter the provider reasoning replay field.');
      md['interleaved'] = { ...record(md['interleaved']), field };
    } else throw Error('Choose a valid interleaved reasoning mode.');
  }
  if (changed('options')) {
    if (md['reasoningConfig'] !== undefined && draft.runtimePolicy === 'preserve')
      throw Error(
        'The saved runtime reasoning policy takes precedence. Choose catalog controls before changing reasoning options.',
      );
    const types = new Set<string>();
    const options = draft.options.map((option) => {
      if (!['toggle', 'effort', 'budget_tokens'].includes(option.type) || types.has(option.type))
        throw Error('Use each reasoning control type at most once.');
      types.add(option.type);
      const result: Record<string, unknown> = { ...option.source, type: option.type };
      delete result['values'];
      delete result['min'];
      delete result['max'];
      if (option.type === 'effort') {
        if (
          option.values.some(
            (value) => !modelEfforts.includes(value as (typeof modelEfforts)[number]),
          )
        )
          throw Error('Choose supported reasoning effort levels.');
        if (option.values.length) result['values'] = [...new Set(option.values)];
      }
      if (option.type === 'budget_tokens') {
        for (const key of ['min', 'max'] as const) {
          if (!option[key].trim()) continue;
          const value = Number(option[key]);
          if (!Number.isSafeInteger(value) || value < 0)
            throw Error('Reasoning token bounds must be non-negative integers.');
          result[key] = value;
        }
        if (
          typeof result['min'] === 'number' &&
          typeof result['max'] === 'number' &&
          result['min'] > result['max']
        )
          throw Error('Minimum reasoning tokens cannot exceed the maximum.');
      }
      return result;
    });
    if (options.length) md['reasoning_options'] = options.length === 1 ? options[0] : options;
    else delete md['reasoning_options'];
  }
  if (draft.runtimePolicy === 'catalog' && changed('runtimePolicy')) delete md['reasoningConfig'];
  if (draft.runtimePolicy === 'custom') {
    const runtime = draft.runtime;
    if (
      !['enabled', 'disabled', 'adaptive', 'always_on'].includes(runtime.default) ||
      !['unsupported', 'optional', 'always_on'].includes(runtime.preserveThinking)
    )
      throw Error('Choose a valid runtime reasoning policy.');
    if (
      !['inherit', 'true', 'false'].includes(runtime.effortSupported) ||
      runtime.effortLevels.some(
        (value) => !modelEfforts.includes(value as (typeof modelEfforts)[number]),
      )
    )
      throw Error('Choose valid runtime effort support and levels.');
    if (runtime.effortSupported === 'true' && !runtime.effortLevels.length)
      throw Error('Documented runtime effort support requires at least one level.');
    if (runtime.effortSupported !== 'true' && runtime.effortLevels.length)
      throw Error('Only documented runtime effort support can declare effort levels.');
    if (runtime.default === 'always_on' && runtime.disableSupported)
      throw Error('Always-on reasoning cannot also support disabling.');
    const policy: Record<string, unknown> = {
      ...record(md['reasoningConfig']),
      default: runtime.default,
      disableSupported: runtime.disableSupported,
      effortLevels: [...new Set(runtime.effortLevels)],
      preserveThinking: runtime.preserveThinking,
    };
    if (runtime.effortSupported === 'inherit') delete policy['effortSupported'];
    else policy['effortSupported'] = runtime.effortSupported === 'true';
    md['reasoningConfig'] = policy;
  }
}
