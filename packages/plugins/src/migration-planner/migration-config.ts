// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MigrationPlannerConfig {
  enabled: boolean;
  changelogPaths: string[];
  maxChars: number;
  useLlm: boolean;
  maxLlmChars: number;
}

export const DEFAULTS: MigrationPlannerConfig = {
  enabled: true,
  changelogPaths: ['CHANGELOG.md'],
  maxChars: 100_000,
  useLlm: false,
  maxLlmChars: 20_000,
};

export function readConfig(raw: unknown): MigrationPlannerConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  const rawPaths = r['changelogPaths'] ?? r['changelog_paths'] ?? r['paths'];
  const rawMax = r['maxChars'] ?? r['max_chars'] ?? r['limit'];
  const rawUseLlm = r['useLlm'] ?? r['use_llm'];
  const rawMaxLlm = r['maxLlmChars'] ?? r['max_llm_chars'];
  return {
    enabled: r['enabled'] !== false,
    changelogPaths: Array.isArray(rawPaths)
      ? (rawPaths as unknown[]).filter((x): x is string => typeof x === 'string')
      : DEFAULTS.changelogPaths,
    maxChars:
      typeof rawMax === 'number' && rawMax >= 1_000 && rawMax <= 1_000_000
        ? rawMax
        : DEFAULTS.maxChars,
    useLlm: rawUseLlm === true,
    maxLlmChars:
      typeof rawMaxLlm === 'number' && rawMaxLlm >= 1_000 && rawMaxLlm <= 100_000
        ? rawMaxLlm
        : DEFAULTS.maxLlmChars,
  };
}
