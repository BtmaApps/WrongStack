/**
 * Say it once.
 *
 * Both TypeSafe features fail closed, which is right, and until now both also
 * failed SILENTLY, which is right only for a user who never asked for them. A
 * user who set `enabled: true` and has no working credential gets nothing
 * today: no block in the prompt, no line in the log, no hint that the switch
 * they flipped does nothing. That is the failure this module exists to end.
 *
 * The constraint is that the hosts calling it are not one-shot. The request
 * pipeline is rebuilt per session; a long-lived daemon serves many. A warning
 * on every construction would be worse than the silence it replaces — the
 * classic way a real signal becomes scrollback. So each distinct message is
 * emitted once per process and suppressed afterwards.
 *
 * Keyed on the MESSAGE, not the feature: a key that fails and is then fixed
 * and then fails differently should say the new thing, and the same complaint
 * from two surfaces in one process is still one complaint.
 */

/**
 * The narrowest thing that can carry a warning.
 *
 * Deliberately not `Logger`: the hosts that need to warn here range from a
 * full logger to the one-method `{ warn }` object the session command wiring
 * already passes around. Asking for more than `warn` would force those call
 * sites to fabricate methods nothing calls.
 */
export interface WarnSink {
  warn(message: string): void;
}

const said = new Set<string>();

/**
 * Emit `message` at warn level unless this process already emitted it.
 *
 * Returns whether it was emitted, which is what tests assert on — a
 * `logger.warn` spy cannot distinguish "suppressed" from "never called".
 */
export function warnOnce(logger: WarnSink | undefined, message: string): boolean {
  if (said.has(message)) return false;
  said.add(message);
  logger?.warn(message);
  return true;
}

/**
 * The standard "you switched this on and it is not running" line.
 *
 * `configKey` names the switch so the user can find it, and `reason` is the
 * account resolution's own words rather than a paraphrase — it already
 * names the environment variable or the missing endpoint.
 */
export function warnFeatureUnusable(
  logger: WarnSink | undefined,
  configKey: string,
  reason: string,
): boolean {
  return warnOnce(logger, `${configKey} is enabled but not running: ${reason}`);
}

/** Test seam. Never call from product code — the whole point is persistence. */
export function resetWarnOnceForTests(): void {
  said.clear();
}
