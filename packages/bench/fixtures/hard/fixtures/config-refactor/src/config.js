// Environment-driven configuration loader.

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function coerce(raw, fallback, envKey) {
  if (typeof fallback === 'boolean') {
    const v = raw.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === '') return false;
    throw new TypeError(`${envKey}: expected a boolean, got "${raw}"`);
  }
  if (typeof fallback === 'number') {
    if (raw.trim() === '') throw new TypeError(`${envKey}: expected a number, got ""`);
    const n = Number(raw);
    if (Number.isNaN(n)) throw new TypeError(`${envKey}: expected a number, got "${raw}"`);
    return n;
  }
  if (Array.isArray(fallback)) {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
  }
  return raw;
}

/**
 * Build a configuration object from `defaults`, overridden by environment
 * variables named `<prefix><PATH>` where nested keys are joined with `__`.
 * Example: APP_DB__PORT=6000 overrides defaults.db.port.
 *
 * - Only keys that already exist in `defaults` can be overridden.
 * - Path segments are lower-cased, so camelCase default keys cannot be reached.
 * - A value is coerced to the type of its default (boolean/number/array);
 *   string and null defaults take the raw string.
 * - Plain-object defaults cannot be replaced wholesale.
 * - `defaults` is never modified; the result is a fresh, mutable object.
 *
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, unknown>} defaults
 * @param {string} [prefix]
 */
export function loadConfig(env, defaults, prefix = 'APP_') {
  const out = structuredClone(defaults);
  for (const [envKey, raw] of Object.entries(env)) {
    if (raw === undefined || !envKey.startsWith(prefix)) continue;
    const path = envKey.slice(prefix.length).toLowerCase().split('__');
    if (path.some((segment) => segment === '')) continue;

    let target = out;
    let def = defaults;
    let reachable = true;
    for (const segment of path.slice(0, -1)) {
      if (!Object.hasOwn(def, segment) || !isPlainObject(def[segment])) {
        reachable = false;
        break;
      }
      target = target[segment];
      def = def[segment];
    }
    if (!reachable) continue;

    const leaf = path[path.length - 1];
    if (!Object.hasOwn(def, leaf) || isPlainObject(def[leaf])) continue;
    target[leaf] = coerce(raw, def[leaf], envKey);
  }
  return out;
}
