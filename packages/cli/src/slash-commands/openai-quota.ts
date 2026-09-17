/**
 * `/openai-quota` — how much of the ChatGPT (Codex) subscription this account
 * has burned, and when the windows reset.
 *
 * A "Sign in with ChatGPT" account is metered on rolling windows — typically a
 * 5-hour one and a weekly one — and the ChatGPT backend reports the burn on
 * every `/codex/responses` response, in headers. Nothing about that reaches the
 * SSE body, so before this existed the first visible sign of an exhausted plan
 * was a 429 in the middle of a turn.
 *
 * The command is provider-scoped; the machinery underneath is not. It renders
 * whatever `@wrongstack/core/quota` holds for one provider id, and the renderer
 * below reads only the neutral shape. A second metered provider needs a
 * reporter and a one-line command, not a second copy of this file.
 *
 * The reading is observational: it appears after the first request of the
 * session, not before, and it is never fetched on its own — spending a request
 * to ask "how much have I spent" is exactly the wrong trade on a metered plan.
 *
 * Usage:
 *   /openai-quota     Show the latest reading for every metered window
 */

import {
  formatQuotaPercent,
  formatQuotaResetIn,
  getAllProviderQuota,
  getProviderQuota,
  type ProviderQuotaSnapshot,
  type ProviderQuotaWindow,
  quotaResetInMs,
  quotaWindowLabel,
} from '@wrongstack/core/quota';
import type { SlashCommand } from '@wrongstack/core/types';
import { color } from '@wrongstack/core/utils';

/** The provider this command reports on. */
const PROVIDER_ID = 'openai-codex';

const BAR_WIDTH = 24;

function bar(usedPercent: number): string {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  const glyphs = `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
  // The thresholds are advisory, not the backend's: they exist so a glance at
  // the bar says "fine / start pacing / about to be cut off".
  if (clamped >= 90) return color.red(glyphs);
  if (clamped >= 70) return color.amber(glyphs);
  return color.green(glyphs);
}

function renderWindow(window: ProviderQuotaWindow): string {
  const label = quotaWindowLabel(window).padEnd(4);
  const pct = formatQuotaPercent(window.usedPercent);
  const remaining = Math.max(0, 100 - window.usedPercent);
  const left = color.dim(` (${formatQuotaPercent(remaining)} left)`);
  const resetIn = formatQuotaResetIn(quotaResetInMs(window));
  const reset = resetIn ? color.dim(` · resets in ${resetIn}`) : '';
  return `    ${label} ${bar(window.usedPercent)} ${pct}${left}${reset}`;
}

/**
 * Render one meter. Provider-neutral by construction — everything it reads is
 * on the shared snapshot shape.
 */
export function renderQuotaSnapshot(snapshot: ProviderQuotaSnapshot): string[] {
  const lines: string[] = [];
  const title = snapshot.meterLabel ?? snapshot.meterId;
  const plan = snapshot.planLabel ? ` ${color.dim(`plan: ${snapshot.planLabel}`)}` : '';
  lines.push(`  ${color.cyan(snapshot.providerId)} ${color.dim(`— ${title}`)}${plan}`);

  for (const window of snapshot.windows) lines.push(renderWindow(window));

  if (snapshot.credits) {
    const value = snapshot.credits.unlimited
      ? color.green('unlimited')
      : (snapshot.credits.balance ?? (snapshot.credits.hasCredits ? 'available' : 'none'));
    lines.push(`    ${color.dim('credits:')} ${value}`);
  }
  if (snapshot.reachedWindowId) {
    lines.push(`    ${color.red(`limit reached: ${snapshot.reachedWindowId}`)}`);
  }
  if (snapshot.note) {
    lines.push(`    ${color.dim(snapshot.note.slice(0, 200))}`);
  }
  const ageSec = Math.max(0, Math.round((Date.now() - snapshot.capturedAt) / 1000));
  const age = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
  lines.push(`    ${color.dim(`as of ${age}`)}`);
  return lines;
}

export function buildOpenAIQuotaCommand(): SlashCommand {
  return {
    name: 'openai-quota',
    category: 'Inspect',
    description: 'ChatGPT (Codex) subscription quota — windows used and reset times',
    help: [
      'Usage:',
      '  /openai-quota     Show the latest ChatGPT/Codex quota reading',
      '',
      'The reading comes from the response headers of your own requests, so it',
      'appears after the first request of the session and costs nothing extra.',
      'Percentages are per rolling window (commonly 5h and weekly).',
    ].join('\n'),
    run(): Promise<{ message: string }> {
      const snapshots = getProviderQuota(PROVIDER_ID);
      const lines: string[] = [
        `${color.bold('WrongStack')} ${color.dim('— ChatGPT / Codex quota')}`,
        '',
      ];
      for (const snapshot of snapshots) lines.push(...renderQuotaSnapshot(snapshot), '');
      if (snapshots.length === 0) {
        lines.push(
          `  ${color.dim('No quota reading yet.')}`,
          '',
          `  ${color.dim('The ChatGPT backend reports quota on the responses to your own')}`,
          `  ${color.dim('requests. Sign in with')} ${color.cyan('wstack auth login chatgpt')} ${color.dim('and send one message,')}`,
          `  ${color.dim('then run /openai-quota again.')}`,
        );
      }
      return Promise.resolve({ message: lines.join('\n') });
    },
  };
}

/**
 * `/provider-quota` — every metered subscription this session has heard from.
 *
 * The narrow `/openai-quota` above stays because it answers one question
 * without making the user read past other providers; this one exists because
 * the reporters are no longer Codex-only. Claude Pro/Max and GitHub Copilot
 * report into the same store, and a session that is signed into two metered
 * plans has no other way to see which one is about to run out.
 *
 * The name says `provider` on purpose. A bare `/quota` would read as "what
 * this project costs" — an account-wide spend view that does not exist here —
 * and would occupy the name if one is ever built. What this shows is exactly
 * the provider plane's readings, so that is what it is called.
 */
export function buildProviderQuotaCommand(): SlashCommand {
  return {
    name: 'provider-quota',
    category: 'Inspect',
    description: 'Subscription quota across every metered provider — windows used and reset times',
    help: [
      'Usage:',
      '  /provider-quota   Show the latest quota reading for every metered provider',
      '',
      'Readings are observational: each provider reports its own plan usage on',
      'the responses to requests you were already making, so a provider appears',
      'here after its first request of the session and costs nothing extra.',
      'For one provider only, /openai-quota shows just ChatGPT/Codex.',
    ].join('\n'),
    run(): Promise<{ message: string }> {
      // Sorted so the output does not reshuffle between runs as providers
      // report in a different order than they did last time.
      const snapshots = [...getAllProviderQuota()].sort(
        (a, b) => a.providerId.localeCompare(b.providerId) || a.meterId.localeCompare(b.meterId),
      );
      const lines: string[] = [
        `${color.bold('WrongStack')} ${color.dim('— provider subscription quota')}`,
        '',
      ];
      for (const snapshot of snapshots) lines.push(...renderQuotaSnapshot(snapshot), '');
      if (snapshots.length === 0) {
        lines.push(
          `  ${color.dim('No quota reading yet.')}`,
          '',
          `  ${color.dim('Metered plans (Claude Pro/Max, ChatGPT/Codex, Copilot, Antigravity) report')}`,
          `  ${color.dim('usage on the responses to your own requests. Send one message on a')}`,
          `  ${color.dim('subscription login, then run /provider-quota again.')}`,
          '',
          `  ${color.dim('An API-key provider is billed per token and reports no plan window,')}`,
          `  ${color.dim('so it never appears here.')}`,
        );
      }
      return Promise.resolve({ message: lines.join('\n') });
    },
  };
}
