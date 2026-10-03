import { compileUserRegex, MAX_SUBJECT_LEN } from './_regex.js';

// ---------------------------------------------------------------------------
// JSON Schema validator (from json-path plugin)
// ---------------------------------------------------------------------------

/**
 * Keywords `validateJsonSchema` does not evaluate. Present in a schema, each
 * is reported as an error rather than skipped. (`format` stays an annotation,
 * as JSON Schema 2020-12 defines it, except the `uri` check below.)
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = [
  '$ref',
  '$dynamicRef',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'patternProperties',
  'propertyNames',
  'prefixItems',
  'contains',
  'dependentRequired',
  'dependentSchemas',
  'dependencies',
  'unevaluatedProperties',
  'unevaluatedItems',
] as const;

/** Key-order-independent JSON form, for enum/const/uniqueItems equality. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
    .join(',')}}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  function check(value: unknown, s: Record<string, unknown>, path: string): void {
    // A keyword this validator does not evaluate must not read as "satisfied":
    // ignoring it answered `valid: true` for data the schema forbids.
    for (const keyword of UNSUPPORTED_SCHEMA_KEYWORDS) {
      if (s[keyword] !== undefined) {
        errors.push(
          `${path}: schema keyword "${keyword}" is not supported — cannot confirm validity`,
        );
      }
    }

    if (s['type']) {
      // `type` may be a list (`["string", "null"]`): valid when any entry matches.
      const expectedTypes = (Array.isArray(s['type']) ? s['type'] : [s['type']]) as string[];
      const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      const matches = (expected: string): boolean =>
        expected === 'integer' ? Number.isInteger(value) : expected === actualType;
      if (!expectedTypes.some(matches)) {
        errors.push(`${path}: expected ${expectedTypes.join(' | ')}, got ${actualType}`);
      }
    }

    if (Array.isArray(s['enum']) && !s['enum'].some((allowed) => jsonEqual(allowed, value))) {
      errors.push(`${path}: not one of the allowed values ${JSON.stringify(s['enum'])}`);
    }
    if (Object.hasOwn(s, 'const') && !jsonEqual(s['const'], value)) {
      errors.push(`${path}: must equal ${JSON.stringify(s['const'])}`);
    }

    if (typeof value === 'number') {
      if (typeof s['exclusiveMinimum'] === 'number' && value <= s['exclusiveMinimum']) {
        errors.push(`${path}: must be greater than ${s['exclusiveMinimum']}`);
      }
      if (typeof s['exclusiveMaximum'] === 'number' && value >= s['exclusiveMaximum']) {
        errors.push(`${path}: must be less than ${s['exclusiveMaximum']}`);
      }
      const step = s['multipleOf'];
      if (typeof step === 'number' && step > 0) {
        const quotient = value / step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
          errors.push(`${path}: not a multiple of ${step}`);
        }
      }
    }

    if (Array.isArray(value)) {
      if (typeof s['minItems'] === 'number' && value.length < s['minItems']) {
        errors.push(`${path}: too few items (min ${s['minItems']})`);
      }
      if (typeof s['maxItems'] === 'number' && value.length > s['maxItems']) {
        errors.push(`${path}: too many items (max ${s['maxItems']})`);
      }
      if (s['uniqueItems'] === true) {
        const seen = new Set(value.map((item) => canonicalJson(item)));
        if (seen.size !== value.length) errors.push(`${path}: items are not unique`);
      }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (typeof s['minProperties'] === 'number' && keys.length < s['minProperties']) {
        errors.push(`${path}: too few properties (min ${s['minProperties']})`);
      }
      if (typeof s['maxProperties'] === 'number' && keys.length > s['maxProperties']) {
        errors.push(`${path}: too many properties (max ${s['maxProperties']})`);
      }
      const extra = s['additionalProperties'];
      if (extra === false || (typeof extra === 'object' && extra !== null)) {
        const declared = (s['properties'] ?? {}) as Record<string, unknown>;
        for (const key of keys) {
          if (Object.hasOwn(declared, key)) continue;
          if (extra === false) errors.push(`${path}: unexpected property "${key}"`);
          else
            check(
              (value as Record<string, unknown>)[key],
              extra as Record<string, unknown>,
              `${path}.${key}`,
            );
        }
      }
    }

    if (typeof value === 'string' && s['format'] === 'uri' && value) {
      try {
        new URL(value);
      } catch {
        errors.push(`${path}: not a valid URI`);
      }
    }

    if (typeof value === 'string' && s['pattern']) {
      // The schema is a tool argument — i.e. LLM-controlled and, per this
      // project's own adversary model, untrusted — and the subject is file
      // content. A bare `new RegExp` here would evaluate an attacker-chosen
      // pattern against attacker-chosen input, synchronously, on a regex engine
      // the executor's timeout cannot interrupt. Every other user-regex site in
      // this package already routes through `compileUserRegex` (length cap +
      // catastrophic-backtracking heuristics). Refuse over-cap subjects rather
      // than validating only a prefix and silently accepting a bad suffix.
      // A malformed pattern also reports an invalid schema instead of throwing.
      const compiled = compileUserRegex(s['pattern'] as string, '');
      if (!compiled.ok) {
        errors.push(`${path}: invalid schema pattern — ${compiled.reason}`);
      } else if (value.length > MAX_SUBJECT_LEN) {
        errors.push(`${path}: pattern cannot be checked beyond ${MAX_SUBJECT_LEN} characters`);
      } else if (!compiled.regex.test(value)) {
        errors.push(`${path}: does not match pattern ${s['pattern']}`);
      }
    }

    if (
      typeof value === 'string' &&
      s['minLength'] !== undefined &&
      value.length < (s['minLength'] as number)
    ) {
      errors.push(`${path}: string too short (min ${s['minLength']})`);
    }

    if (
      typeof value === 'string' &&
      s['maxLength'] !== undefined &&
      value.length > (s['maxLength'] as number)
    ) {
      errors.push(`${path}: string too long (max ${s['maxLength']})`);
    }

    if (
      typeof value === 'number' &&
      s['minimum'] !== undefined &&
      value < (s['minimum'] as number)
    ) {
      errors.push(`${path}: below minimum ${s['minimum']}`);
    }

    if (
      typeof value === 'number' &&
      s['maximum'] !== undefined &&
      value > (s['maximum'] as number)
    ) {
      errors.push(`${path}: above maximum ${s['maximum']}`);
    }

    if (Array.isArray(value) && s['items']) {
      if (Array.isArray(s['items'])) {
        for (let i = 0; i < Math.min(value.length, s['items'].length); i++) {
          check(value[i], s['items'][i] as Record<string, unknown>, `${path}[${i}]`);
        }
      } else if (typeof s['items'] === 'object' && s['items'] !== null) {
        for (let i = 0; i < value.length; i++) {
          check(value[i], s['items'] as Record<string, unknown>, `${path}[${i}]`);
        }
      }
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Array.isArray(s['required'])
    ) {
      const obj = value as Record<string, unknown>;
      for (const req of s['required']) {
        if (typeof req === 'string' && !Object.hasOwn(obj, req)) {
          errors.push(`${path}: missing required property "${req}"`);
        }
      }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && s['properties']) {
      const props = s['properties'] as Record<string, Record<string, unknown>>;
      const obj = value as Record<string, unknown>;
      for (const [k, propSchema] of Object.entries(props)) {
        if (Object.hasOwn(obj, k)) {
          check(obj[k], propSchema, `${path}.${k}`);
        }
      }
    }
  }

  check(data, schema, '$');
  return { valid: errors.length === 0, errors };
}
