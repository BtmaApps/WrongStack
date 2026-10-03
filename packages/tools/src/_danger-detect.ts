import { unwrapArgvLaunchers } from './_danger-launchers.js';
import { inlinePayloadPairs } from './_danger-payload.js';
import { EXECUTION_DANGER_RULES } from './_danger-rules-execution.js';
import { FILESYSTEM_DANGER_RULES } from './_danger-rules-filesystem.js';
import { SYSTEM_DANGER_RULES } from './_danger-rules-system.js';
import { VCS_INFRA_DANGER_RULES } from './_danger-rules-vcs-infra.js';
import type { DangerAssessment, DangerLevel, DangerRule } from './_danger-types.js';

export { ARGV_LAUNCHERS, unwrapArgvLaunchers } from './_danger-launchers.js';
export type { DangerAssessment, DangerLevel, DangerRule } from './_danger-types.js';

const RULES: readonly DangerRule[] = [
  ...FILESYSTEM_DANGER_RULES,
  ...SYSTEM_DANGER_RULES,
  ...VCS_INFRA_DANGER_RULES,
  ...EXECUTION_DANGER_RULES,
];

export function detectDanger(
  cmd: string,
  args: readonly string[],
  bypass?: ReadonlySet<string>,
): DangerAssessment {
  if (typeof cmd !== 'string') return { level: 'safe', reasons: [] };
  const safeArgs = Array.isArray(args) ? args : [];
  const reasons: string[] = [];
  let level: DangerLevel = 'safe';
  let matchedRule: string | undefined;

  // Rules run against the ORIGINAL pair and the unwrapped one: a rule keyed on
  // the launcher itself must keep firing, and the unwrapped pair is what
  // exposes the command it was hiding.
  const unwrapped = unwrapArgvLaunchers(cmd, safeArgs);
  const pairs: Array<{ cmd: string; args: readonly string[] }> =
    unwrapped.cmd === cmd ? [{ cmd, args: safeArgs }] : [{ cmd, args: safeArgs }, unwrapped];

  // …and against the command LINE an interpreter was handed inline. A real
  // `powershell -Command "Remove-Item -Recurse -Force x"` arrives with the whole
  // payload as ONE argv string, which no per-arg anchored flag test can see.
  // Each chained command is unwrapped too: `sudo rm -rf x` inside the line
  // hides `rm` behind a launcher exactly as it does at the top level.
  for (const pair of [...pairs]) {
    for (const inline of inlinePayloadPairs(pair.cmd, pair.args)) {
      pairs.push(inline);
      const inner = unwrapArgvLaunchers(inline.cmd, inline.args);
      if (inner.cmd !== inline.cmd) pairs.push(inner);
    }
  }

  for (const rule of RULES) {
    if (bypass?.has(rule.id)) continue;
    if (!pairs.some((pair) => rule.test(pair.cmd, pair.args))) continue;
    reasons.push(rule.reason);
    if (matchedRule === undefined || levelRank(rule.level) >= levelRank(level)) {
      matchedRule = rule.id;
    }
    if (levelRank(rule.level) > levelRank(level)) {
      level = rule.level;
    }
  }

  if (level === 'safe') return { level: 'safe', reasons: [] };
  // matchedRule is set above (last winning rule). For exactOptionalPropertyTypes
  // we build the object conditionally so the property is omitted when undefined.
  const result: DangerAssessment = { level, reasons };
  if (matchedRule !== undefined) result.matchedRule = matchedRule;
  return result;
}

function levelRank(level: DangerLevel): number {
  switch (level) {
    case 'safe':
      return 0;
    case 'caution':
      return 1;
    case 'destructive':
      return 2;
  }
}
