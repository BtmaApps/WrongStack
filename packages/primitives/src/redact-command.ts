/**
 * Canonical secret redaction for command lines and outbound message text.
 *
 * This logic used to exist as three hand-mirrored copies:
 *   - `packages/tools/src/_redact-command.ts`             → `redactCommand`
 *   - `packages/core/src/observability/redact-command.ts` → `redactCommand`, `redactCommandArgs`
 *   - `packages/telegram/src/redact.ts`                   → `redactSecrets`
 *
 * Each carried a "keep these two copies in sync" comment. That manual contract
 * failed twice, both times in the leak direction:
 *   1. the tools copy gained a `:` branch that picked the flag/value separator
 *      by PRECEDENCE (= → : → whitespace) instead of by position, so a colon
 *      INSIDE a space-separated value was mistaken for the separator and the
 *      value's prefix was printed verbatim — `redis-cli -a hunter2:pw` rendered
 *      as `-a hunter2:[REDACTED]`;
 *   2. both the `:` handling and the pattern list drifted between copies, and
 *      the pattern lists could not be diffed because they lived in three files.
 *
 * The algorithm now lives here exactly once. Two things still differ per call
 * site — deliberately, and both are *policy*, not drift:
 *
 *   `COMMAND_REDACTION_PROFILE` (`tools`, `core` telemetry)
 *     Matches GLUED short flags (`-tVALUE`, `-aVALUE`) because a `/ps` line or
 *     crash dump should not show a redis/curl secret at all, and leaves a bare
 *     long flag (`--token`) untouched so `redactCommandArgs`' pair-scan can
 *     still recognise it as a flag whose value is the NEXT argv entry.
 *
 *   `OUTBOUND_REDACTION_PROFILE` (`telegram`)
 *     Wipes an unseparable match entirely (`**redacted**`) instead of keeping
 *     the flag name, because a greedy flag-name extraction must never leave
 *     value characters behind on the outward-facing surface. It shares the
 *     command profile's SHORT-FLAG patterns, including the glued form: only the
 *     separated form used to match, so `curl -tSECRET` / `redis-cli -aSECRET`
 *     reached a notification verbatim — under-redaction on the surface where a
 *     leak is worst. The `-target`/`-tries`/`-timeout` false positives this
 *     re-admits are cosmetic next to that.
 *
 * Both profiles share one separator rule: the separator is the FIRST character
 * after the flag name, and it may be `=`, whitespace, `:` or `,` — the last two
 * being separators the pattern lists already declare (`(?:[=\s,][^\s]*)?`,
 * `[=\s,][A-Za-z0-9+/=]{32,}`, `\s*[=:]`). Deriving it from the flag-name
 * boundary rather than from delimiter precedence is what keeps a colon inside a
 * value from being read as the separator.
 *
 * This module must stay dependency-free: `@wrongstack/primitives` is a
 * dependency leaf and is imported by the lowest tiers of the workspace graph.
 */

export type RedactionProfileId = 'command' | 'outbound';

export interface RedactionProfile {
  /** Stable id, used in diagnostics and by tests that pin the profiles. */
  readonly id: RedactionProfileId;
  /** Sensitive-flag patterns, applied in order. */
  readonly patterns: readonly RegExp[];
  /**
   * Renders a match in which no flag/value separator could be located.
   * Returning the match unchanged is a valid choice (see the command profile).
   */
  readonly renderUnseparated: (match: string) => string;
}

/** `--flag`, `-password`/`-p`/`-a`/`-t`, or an env-var name. */
const FLAG_NAME = /^--[\w-]+|^-(?:password|p|a|t)|^[A-Za-z_]\w*/;
/**
 * Characters that may introduce a sensitive flag's value. `,` and `:` are
 * included because the pattern lists accept them as separators; leaving either
 * out made the pattern match a value the redactor then emitted verbatim.
 * Not global: `lastIndex` state must never leak between calls.
 */
const SEPARATOR = /^[=:,\s]$/;

/**
 * Short-flag patterns for the COMMAND profile (`tools` `/ps` output, crash
 * dumps, `core` telemetry).
 *
 * They match the GLUED form as well as the separated one. The value class is
 * narrow on purpose: `[^\s,-]` stops at a hyphen and `-t` additionally demands
 * a token-like value (>= 8 chars), because this text is READ by a human
 * debugging `/ps` output and `clang -target=x86_64`, `tar -tf`, `-tries` and
 * `-timeout` are everyday noise there. A false positive is cosmetic; a false
 * negative in a crash dump is still a leak, so this is a readability tradeoff,
 * not a licence to under-redact — the OUTBOUND profile below deliberately does
 * NOT copy the narrow class.
 *
 * Sharing the instances is safe: `applyProfile` is synchronous and
 * `String.prototype.replace` resets `lastIndex` on a global regex, so no
 * `lastIndex` state can leak between the profiles that use them.
 */
const SHORT_FLAG_TOKEN_PATTERN = /(?<![-\w])-t(?:[=\s]+)?[^\s,-]{8,}/g;
const SHORT_FLAG_SECRET_PATTERN = /(?<![-\w])-(?:password|p|a)(?:[=\s]+)?[^\s,-]+/gi;
/**
 * Short-flag patterns for the OUTBOUND profile (`telegram` notifications).
 *
 * Same glued + separated shape as the command profile — that part IS shared
 * deliberately, because matching only the separated form let
 * `curl -tSECRET` / `redis-cli -aSECRET` reach a phone notification verbatim.
 * The VALUE CLASS is not shared, and that is the point of these two: the
 * command profile's `[^\s,-]` + `{8,}` is a readability tradeoff that
 * TRUNCATES the value at the first hyphen, which on this surface prints the
 * tail of a credential into a notification (`redis-cli -a s3cr3t-hunter2`
 * rendered as `-a [REDACTED]-hunter2`, and a dashed token like
 * `-t sk-live-…` was skipped altogether because `sk` is under the `-t`
 * length floor). Secrets are routinely hyphenated, so outbound keeps the
 * whole non-space token. The widened `-target`-style false positive is the
 * accepted cost here; see the outbound tests.
 */
const OUTBOUND_SHORT_FLAG_TOKEN_PATTERN = /(?<![-\w])-t(?:[=\s]+)?[^\s,]+/g;
const OUTBOUND_SHORT_FLAG_SECRET_PATTERN = /(?<![-\w])-(?:password|p|a)(?:[=\s]+)?[^\s,]+/gi;
/** Shared: high-entropy value behind a secret-looking flag name. */
const HIGH_ENTROPY_FLAG_PATTERN =
  /--[\w-]*(?:token|key|secret|password|passwd|auth|credential)[\w-]*[=\s,][A-Za-z0-9+/=]{32,}/g;

/**
 * Secret keywords are matched as the FINAL hyphen-separated segment of a
 * compound long flag: `--(?:[\w-]+-)?KEYWORD`. Real tools spell secret flags
 * `--db-password`, `--auth-token`, `--signing-key`, and a list that only
 * accepts the keyword as the ENTIRE name left those leaking verbatim through
 * every surface — while the value-less env-var pattern (which needs `[=:]`)
 * could not backstop the space- or comma-separated forms. The optional
 * hyphenated prefix closes that, and the existing callback rule (the
 * separator must sit immediately after the flag NAME) keeps keyword-in-the-
 * middle names such as `--token-file` and `--auth-scheme` visible: their
 * match truncates before the separator and renders unchanged.
 */
const KEYWORDS =
  'token|password|passwd|pwd|secret|api[-_]?key|api[-_]?secret|auth|credential|private[-_]?key|access[-_]?key|github[-_]?token|gh[-_]?token|bearer|jwt|oauth|pin|pincode|passphrase|access[-_]?token';

/** Shared by `tools` (`/ps` output, crash dumps) and `core` telemetry. */
const COMMAND_PATTERNS: readonly RegExp[] = [
  // --flag=value, --flag "value", --flag,value (value captured up to the next space)
  new RegExp(`--(?:[\\w-]+-)?(?:${KEYWORDS})(?:[=\\s,][^\\s]*)?`, 'gi'),
  SHORT_FLAG_TOKEN_PATTERN,
  SHORT_FLAG_SECRET_PATTERN,
  // env var–style secrets: TOKEN=x, API_KEY=y, TOKEN:z, …
  /(?:TOKEN|API_KEY|API_SECRET|AUTH_TOKEN|GITHUB_TOKEN|GH_TOKEN|BEARER|JWT|OAUTH|CREDENTIAL|SECRET|PRIVATE_KEY|PASSWORD|PASSWD|PASSPHRASE)\s*[=:]\s*[^\s,]+/gi,
  HIGH_ENTROPY_FLAG_PATTERN,
];

/** Telegram outbound notifications: the highest-risk exfiltration surface. */
const OUTBOUND_PATTERNS: readonly RegExp[] = [
  // Same named long flags plus DATABASE_URL / CONNECTION_STRING spellings.
  new RegExp(
    `--(?:[\\w-]+-)?(?:${KEYWORDS}|database[-_]?url|connection[-_]?string)(?:[=\\s,][^\\s]*)?`,
    'gi',
  ),
  // Glued short forms match here too, closing the `curl -tSECRET` /
  // `redis-cli -aSECRET` under-redaction. The outbound value class is wider
  // than the command profile's so a hyphenated secret is not truncated at its
  // first hyphen — see OUTBOUND_SHORT_FLAG_* above for the accepted
  // `-target`-style false-positive cost.
  OUTBOUND_SHORT_FLAG_TOKEN_PATTERN,
  OUTBOUND_SHORT_FLAG_SECRET_PATTERN,
  // env-var style, including DATABASE_URL / CONNECTION_STRING. PASSPHRASE is
  // part of the set because a short (<20-char) value is not caught by the
  // core scrubber's high_entropy_env pattern, so this is its only guard.
  /(?:TOKEN|API_KEY|API_SECRET|AUTH_TOKEN|GITHUB_TOKEN|GH_TOKEN|BEARER|JWT|OAUTH|CREDENTIAL|SECRET|PRIVATE_KEY|PASSWORD|PASSWD|PASSPHRASE|DATABASE_URL|CONNECTION_STRING)\s*[=:][^\s,]+/gi,
  HIGH_ENTROPY_FLAG_PATTERN,
];

export const COMMAND_REDACTION_PROFILE: RedactionProfile = {
  id: 'command',
  patterns: COMMAND_PATTERNS,
  renderUnseparated: (match) =>
    // Bare long flag (e.g. an argv token `--token`): there is no secret here, so
    // leave it intact for the downstream pair-scan. NOTE: do not "improve" this
    // to wipe the token — `redactCommandArgs` relies on seeing the bare flag.
    match.startsWith('--')
      ? match
      : // Glued short flag (-pVALUE, -tVALUE, -aVALUE): the flag name is the
        // leading -X (2 chars) and everything after it is the value. A greedy
        // [a-zA-Z0-9_-]* flag-name match would consume value characters into the
        // "flag name" and let the secret survive.
        `${match.slice(0, 2)}[REDACTED]`,
};

export const OUTBOUND_REDACTION_PROFILE: RedactionProfile = {
  id: 'outbound',
  patterns: OUTBOUND_PATTERNS,
  // We cannot tell where the flag name ends and the value begins, and this text
  // is forwarded to a phone notification, so wipe the whole match rather than
  // risk leaving value characters behind. One marker keeps it idempotent.
  renderUnseparated: () => '**redacted**',
};

/** Apply one profile to `text`. Pure; never throws on non-string input. */
function applyProfile(text: string, profile: RedactionProfile): string {
  if (typeof text !== 'string') return '';
  let result = text;
  for (const pattern of profile.patterns) {
    result = result.replace(pattern, (match) => {
      // The separator is the FIRST character after the FLAG NAME — never a
      // delimiter chosen by precedence, which would misread a `:` inside a value
      // as the separator and print the value's prefix verbatim.
      const flagName = FLAG_NAME.exec(match)?.[0] ?? '';
      const boundary = match.charAt(flagName.length);
      if (boundary !== '' && SEPARATOR.test(boundary)) {
        return `${flagName}${boundary}[REDACTED]`;
      }
      return profile.renderUnseparated(match);
    });
  }
  return result;
}

/**
 * Returns a display-safe copy of `cmd` with sensitive flag values replaced by
 * `[REDACTED]`. The original string is unchanged; this is pure.
 */
export function redactCommand(cmd: string): string {
  return applyProfile(cmd, COMMAND_REDACTION_PROFILE);
}

/**
 * Replace sensitive flag values and env-style secrets in outbound text with
 * `[REDACTED]`. Pure, and idempotent — no pattern matches `[REDACTED]`.
 */
export function redactSecrets(text: string): string {
  return applyProfile(text, OUTBOUND_REDACTION_PROFILE);
}

// Long flag names that carry a secret when supplied as a bare flag followed by
// a separate value arg (e.g. ["--token", "s3cr3t"]). Used by redactCommandArgs.
// Same keyword-as-final-segment rule as the named long-flag patterns above, so
// ["--db-password", "s3cr3t"] redacts like ["--password", "s3cr3t"] while
// ["--token-file", "/path"] stays visible.
const BARE_SENSITIVE_LONG_FLAG = new RegExp(`^--(?:[\\w-]+-)?(?:${KEYWORDS})$`, 'i');
// Short flags that carry a secret when bare (e.g. ["-p", "s3cr3t"]).
const BARE_SENSITIVE_SHORT_FLAG = /^-(?:p|t|a)$/i;

/**
 * Redact a command + argument vector WITHOUT corrupting the array shape.
 *
 * Each token is redacted independently (catches attached/equal forms like
 * `--token=secret`, `-pSECRET`, `TOKEN=secret` within a single arg). Then a
 * pair-scan handles the split-flag-value case where a bare sensitive flag
 * (`--token` / `-p`) and its value arrive as two separate args — which
 * per-token redaction would otherwise miss. This avoids the join→split
 * round-trip that corrupted args containing spaces.
 */
export function redactCommandArgs(
  command: string,
  args: readonly string[],
): { command: string; args: string[] } {
  if (!Array.isArray(args)) {
    return { command: redactCommand(command), args: [] };
  }
  const redactedCommand = redactCommand(command);
  const redactedArgs = args.map((a) => redactCommand(a));
  for (let i = 0; i < redactedArgs.length - 1; i++) {
    const flag = redactedArgs[i];
    const next = redactedArgs[i + 1];
    if (flag === undefined || next === undefined) continue;
    const isBareSensitive =
      (BARE_SENSITIVE_LONG_FLAG.test(flag) || BARE_SENSITIVE_SHORT_FLAG.test(flag)) &&
      !flag.includes('[REDACTED]');
    // Only redact the following arg if it looks like a value, not another flag.
    if (isBareSensitive && !next.startsWith('-')) {
      redactedArgs[i + 1] = '[REDACTED]';
    }
  }
  return { command: redactedCommand, args: redactedArgs };
}
