import type { DangerAssessment } from './_danger-detect.js';

/**
 * Bootstrap PowerShell script wrapper with robust progress suppression,
 * UTF-8 encoding, error action defaults, and exit-code propagation.
 */
export function wrapPwshCommand(command: string): string {
  const bootstrap =
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;' +
    "$ProgressPreference = 'SilentlyContinue';" +
    "$ConfirmPreference = 'None';" +
    '$WhatIfPreference = $false';
  return (
    `${bootstrap}\n` +
    `$ErrorActionPreference = 'Stop'\n` +
    `${command}\n` +
    `if ($LASTEXITCODE -is [int]) { exit $LASTEXITCODE }`
  );
}

/**
 * Split a PowerShell command line into argv-shaped tokens for danger
 * classification.
 *
 * `detectDanger` rules inspect individual argv tokens (`-Force` as its own
 * element), but the pwsh tool receives the whole command as one string.
 * Passing that string as a single-element argv made every split-argument
 * rule structurally unable to fire on this path (e.g. `chmod 777 x` or
 * `Remove-Item -Recurse -Force` classified safe); only rules that regex the
 * whole line (pipe-to-shell, execution-policy) were effective.
 *
 * PowerShell-aware: single-quoted strings are literal (`''` escapes a
 * quote), double-quoted strings allow `""` and backtick escapes, and a
 * backtick outside quotes escapes the next character (including the
 * line-continuation newline). Quotes are stripped — they are syntax, not
 * content. An unterminated quote takes the rest of the line as one token.
 */
export function tokenizePwshCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';

  const push = () => {
    if (current !== '') {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command.charAt(i);
    if (ch === '`') {
      // Backtick escape: the next character (including a line-continuation
      // newline) loses its special meaning and joins the current token.
      const next = command.charAt(i + 1);
      if (next !== '') {
        current += next;
        i++;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < command.length) {
        const qch = command.charAt(i);
        if (qch === quote) {
          // A doubled quote (`''` / `""`) is an escaped quote; a lone one
          // terminates the string.
          if (command.charAt(i + 1) === quote) {
            current += quote;
            i += 2;
            continue;
          }
          break;
        }
        if (quote === '"' && qch === '`') {
          const next = command.charAt(i + 1);
          if (next !== '') {
            current += next;
            i += 2;
            continue;
          }
        }
        current += qch;
        i++;
      }
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    current += ch;
  }
  push();
  return tokens;
}

export const DANGER_LEVEL_RANK: Readonly<Record<DangerAssessment['level'], number>> = {
  safe: 0,
  caution: 1,
  destructive: 2,
};

/**
 * Combine the assessments of one command made over different argv shapes.
 * Token-based rules need split argv; cmd-gated binary rules need the first
 * token as the program (mirroring how the exec tool sees the same line);
 * phrase-scanning rules (e.g. the execution-policy scanner matching
 * `Set-ExecutionPolicy Bypass` across two tokens) need the raw line. Takes
 * the highest level, unions the reasons, and keeps the matched rule of the
 * highest-level assessment.
 */
export function mergeDanger(...assessments: readonly DangerAssessment[]): DangerAssessment {
  const top = assessments.reduce((acc, cur) =>
    DANGER_LEVEL_RANK[cur.level] > DANGER_LEVEL_RANK[acc.level] ? cur : acc,
  );
  const reasons = [...new Set(assessments.flatMap((a) => a.reasons))];
  if (top.level === 'safe') return { level: 'safe', reasons: [] };
  const result: DangerAssessment = { level: top.level, reasons };
  if (top.matchedRule !== undefined) result.matchedRule = top.matchedRule;
  return result;
}
