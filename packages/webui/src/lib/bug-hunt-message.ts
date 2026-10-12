export const BUG_HUNT_LIMITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type BugHuntLimit = (typeof BUG_HUNT_LIMITS)[number];

export interface BugHuntSummary {
  scope: string;
  maxBugs: BugHuntLimit;
  currentRound: number;
}

/** The compact user turn for rounds after the full builtin prompt. */
export function buildBugHuntContinuation(summary: BugHuntSummary): string {
  const scope = summary.scope ? ` Stay within the original scope: ${summary.scope}.` : '';
  return `This is round ${summary.currentRound}/${summary.maxBugs}; we're continuing the bug hunt.${scope}`;
}

const BUG_HUNT_PREFIX = '<!-- wrongstack-bug-hunt';
const BUG_HUNT_PATTERN =
  /^<!-- wrongstack-bug-hunt scope="([^"]*)" max-bugs="(10|[1-9])"(?: round="(\d+)")? -->\n/;

/** Adds durable display metadata without changing the instruction sent to the agent. */
export function buildBugHuntMessage(instruction: string, summary: BugHuntSummary): string {
  return `${BUG_HUNT_PREFIX} scope="${encodeURIComponent(summary.scope)}" max-bugs="${summary.maxBugs}" round="${summary.currentRound}" -->\n${instruction}`;
}

/** Recognizes a persisted Bug Hunter run and recovers its compact display data. */
export function parseBugHuntMessage(content: string): BugHuntSummary | undefined {
  const match = BUG_HUNT_PATTERN.exec(content);
  if (!match) return undefined;
  try {
    const currentRound = Number(match[3] ?? '1');
    if (!Number.isInteger(currentRound) || currentRound < 1) return undefined;
    return {
      scope: decodeURIComponent(match[1] ?? ''),
      maxBugs: Number(match[2]) as BugHuntLimit,
      currentRound,
    };
  } catch {
    return undefined;
  }
}
