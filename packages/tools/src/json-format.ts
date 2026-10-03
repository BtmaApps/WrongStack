// ---------------------------------------------------------------------------
// Output formatting (original json tool helpers)
// ---------------------------------------------------------------------------

export function formatOutput(data: unknown, format: string): string {
  if (format === 'json5') {
    return stripTrailingCommas(JSON.stringify(data, null, 2));
  }
  if (format === 'yaml') {
    return toYaml(data);
  }
  return JSON.stringify(data, null, 2);
}

/**
 * JSON.stringify never emits syntax-level trailing commas, so every
 * `,`-before-closer sequence in its output lives INSIDE a string literal —
 * and the naive regex strip this replaced (`,\s*}` / `,\s*\]`) corrupted
 * exactly those: the value "a, } b" rendered as "a} b". Walk the output
 * tracking string-literal state (with escape handling) and elide
 * `,\s*[}\]]` only outside strings; on stringify output the strip is a
 * verified no-op, which is the point — rendering must never be able to
 * alter string content.
 */
function stripTrailingCommas(json: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < json.length) {
    const ch = json[i]!;
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += json[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j += 1;
      if (json[j] === '}' || json[j] === ']') {
        i = j;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * YAML resolves these plain scalars as null/bool/number, not strings — a
 * string value like "123" or "true" emitted unquoted would read back as a
 * different type. Quoting is over-inclusive on purpose ("no"/"on" stay
 * strings); under-quoting silently corrupts the rendered data.
 */
const YAML_NON_STRING_SCALAR =
  /^(?:~|null|true|false|yes|no|on|off|\.inf|\.nan|[-+]?[0-9][0-9_]*|0[xob][0-9a-fA-F_]+|[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)$/i;

/** Leading YAML indicator characters (or trimmable whitespace) force quoting. */
const YAML_NEEDS_QUOTING = /^[-?:,[\]{}#&*!|>'"%@` \t]|[ \t]$/;

/** C0 controls (other than tab) and DEL: a raw CR ends a YAML line too. */
const YAML_CONTROL_CHAR = /[\u0000-\u0008\u000a-\u001f\u007f]/;

/**
 * A YAML double-quoted scalar. JSON string escaping is valid YAML 1.2
 * double-quoted syntax and, unlike escaping only `\` and `"`, it escapes
 * newlines and other control characters: a raw line break inside the quotes
 * made the whole document unparseable ("Missing closing quote"), so any
 * multi-line value (a script, a description, a PEM block) broke the output.
 */
function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

/**
 * Mapping keys meet the same quoting bar as string values: a key that would
 * re-parse as a non-string ("123", "yes"), that breaks the mapping on re-read
 * (`:`, `#`, whitespace), or that starts with a reserved indicator (`@`, `%`)
 * has to be quoted — and a quoted key needs backslash escaping, or the YAML
 * double-quoted scalar decodes `\b` as backspace instead of the literal two
 * characters. One helper for both emission sites (object branch and
 * array-item branch) so they cannot drift; the array-item branch shipped
 * emitting keys raw, silently changing data served as `format: 'yaml'`.
 */
function safeYamlKey(key: string): string {
  return key === '' ||
    /[:#\s]/.test(key) ||
    YAML_CONTROL_CHAR.test(key) ||
    YAML_NON_STRING_SCALAR.test(key) ||
    YAML_NEEDS_QUOTING.test(key)
    ? yamlQuote(key)
    : key;
}

function toYaml(data: unknown, indent = 0): string {
  if (data === null) return 'null\n';
  /* v8 ignore next -- parsed JSON never contains `undefined`; defensive for recursive calls. */
  if (data === undefined) return '';
  if (typeof data === 'boolean') return String(data) + '\n';
  if (typeof data === 'number') return String(data) + '\n';
  if (typeof data === 'string') {
    if (
      data === '' ||
      data.includes('\n') ||
      YAML_CONTROL_CHAR.test(data) ||
      data.includes(':') ||
      data.includes('#') ||
      YAML_NON_STRING_SCALAR.test(data) ||
      YAML_NEEDS_QUOTING.test(data)
    ) {
      return `${yamlQuote(data)}\n`;
    }
    return data + '\n';
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]\n';
    const prefix = '  '.repeat(indent);
    return data
      .map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          if (Object.keys(item).length === 0) return `${prefix}- {}\n`;
          // Render the item as a mapping one level deeper and put the dash
          // where its first line's indentation was, so a nested object/array
          // value keeps the mapping branch's `key:` + indented-block layout.
          // Building `- key: <value>` by hand put a nested block on the key's
          // line (`- first: a: 1`, `second:       - 1`) — invalid YAML.
          return `${prefix}- ${toYaml(item, indent + 1).slice(prefix.length + 2)}`;
        }
        // Strip the nested block's own indentation only: `trimStart()` also
        // removed leading Unicode spaces of the VALUE (NBSP, U+2028, U+3000),
        // silently changing it — a lone U+2028 item became `null`.
        return `${prefix}- ${toYaml(item, indent + 1).replace(/^ +/, '')}`;
      })
      .join('');
  }
  if (typeof data === 'object') {
    const prefix = '  '.repeat(indent);
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return '{}\n';
    return entries
      .map(([k, v]) => {
        const safeKey = safeYamlKey(k);
        if (
          typeof v === 'object' &&
          v !== null &&
          (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)
        ) {
          return `${prefix}${safeKey}:\n${toYaml(v, indent + 1)}`;
        }
        return `${prefix}${safeKey}: ${toYaml(v, indent + 1)}`;
      })
      .join('');
  }
  /* v8 ignore next -- JSON.parse only yields null/bool/number/string/array/object; this fallback is defensive. */
  return String(data) + '\n';
}
