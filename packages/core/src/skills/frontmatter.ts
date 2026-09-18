import { parseDocument, stringify } from 'yaml';

/**
 * Shared SKILL.md frontmatter parser + agentskills.io name validation.
 *
 * The SKILL.md format (https://agentskills.io/specification) is YAML
 * frontmatter between `---` markers followed by a Markdown body. Uses the YAML
 * failsafe schema, with bounded aliases and rejection of unsupported tags.
 */
export interface ParsedSkillFrontmatter {
  name?: string | undefined;
  description?: string | undefined;
  /**
   * Optional explicit "Use when…" trigger (WrongStack extension). When present
   * it is used verbatim as the skill's trigger in the available-skills list;
   * otherwise the trigger falls back to the first sentence of `description`.
   */
  trigger?: string | undefined;
  /**
   * Who the skill is for (WrongStack extension). `roster` marks a skill that is
   * attached to roster roles by name and must stay out of the main agent's
   * prompt; absent means every agent sees it.
   */
  audience?: string | undefined;
  /** WrongStack extension; informational only. */
  version?: string | undefined;
  license?: string | undefined;
  compatibility?: string | undefined;
  metadata?: Record<string, string> | undefined;
  /**
   * `allowed-tools` (agentskills.io spec, experimental) → split on whitespace.
   * INFORMATIONAL ONLY: WrongStack parses and can surface this list but does NOT
   * enforce it — the `skill` tool's permissions/capabilities are fixed and never
   * consult this field, so it neither grants nor restricts any tool.
   */
  allowedTools?: string[] | undefined;
  /** WrongStack stable runtime capabilities required before this skill may load. */
  requiredCapabilities?: string[] | undefined;
  /** Exact registered tool names required before this skill may render or load. */
  requiredTools?: string[] | undefined;
  /** Capabilities that improve the workflow but have documented fallbacks. */
  optionalCapabilities?: string[] | undefined;
}

/** Fields whose value is a single scalar string. */
const SCALAR_KEYS = new Set([
  'name',
  'description',
  'trigger',
  'audience',
  'version',
  'license',
  'compatibility',
]);

/** Parse and validate YAML without executing tags or expanding unbounded aliases. */
function readFrontmatter(raw: string): { data: Record<string, unknown>; errors: string[] } {
  const match = frontmatterMatch(raw);
  if (!match) return { data: {}, errors: ['Missing or unclosed YAML frontmatter'] };
  try {
    const doc = parseDocument(match[1] ?? '', { schema: 'failsafe', uniqueKeys: true });
    const errors = [...doc.errors, ...doc.warnings].map((error) => error.message);
    if (errors.length) return { data: {}, errors };
    const data: unknown = doc.toJS({ maxAliasCount: 50 });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { data: {}, errors: ['Frontmatter must be a mapping'] };
    }
    return { data: data as Record<string, unknown>, errors: [] };
  } catch (error) {
    return { data: {}, errors: [String(error)] };
  }
}

function frontmatterMatch(raw: string): RegExpMatchArray | null {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/^\uFEFF/, '')
    .match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
}

const LIST_KEYS = {
  'allowed-tools': 'allowedTools',
  allowedTools: 'allowedTools',
  'required-capabilities': 'requiredCapabilities',
  requiredCapabilities: 'requiredCapabilities',
  'required-tools': 'requiredTools',
  requiredTools: 'requiredTools',
  'optional-capabilities': 'optionalCapabilities',
  optionalCapabilities: 'optionalCapabilities',
} as const;

export function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter {
  const { data, errors } = readFrontmatter(raw);
  if (errors.length) return {};
  const out: Record<string, unknown> = {};
  for (const key of SCALAR_KEYS) {
    if (typeof data[key] === 'string') out[key] = data[key].trim();
  }
  for (const [key, target] of Object.entries(LIST_KEYS)) {
    const value = data[key];
    if (typeof value === 'string') out[target] = value.split(/[\s,]+/).filter(Boolean);
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      out[target] = value;
  }
  if (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) {
    const entries = Object.entries(data.metadata);
    if (entries.every(([, value]) => typeof value === 'string'))
      out.metadata = Object.fromEntries(entries);
  }
  return out as ParsedSkillFrontmatter;
}

export function stripFrontmatter(raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const match = frontmatterMatch(text);
  return match ? text.slice(match[0].length) : text;
}

/** Strict authoring checks; runtime discovery may remain tolerant of cosmetic issues. */
export function validateSkillDocument(raw: string, parentDirName?: string): string[] {
  const { data, errors } = readFrontmatter(raw);
  if (errors.length) return errors;
  const fm = parseSkillFrontmatter(raw);
  errors.push(...validateSkillName(fm.name ?? '', parentDirName));
  for (const [key, max] of [
    ['description', 1024],
    ['compatibility', 500],
  ] as const) {
    if (key === 'compatibility' && data[key] === undefined) continue;
    const value = data[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      errors.push(`${key} must be a non-empty string of at most ${max} characters`);
    }
  }
  for (const key of SCALAR_KEYS) {
    if (data[key] !== undefined && typeof data[key] !== 'string')
      errors.push(`${key} must be a string`);
  }
  if (
    data.metadata !== undefined &&
    (!data.metadata ||
      typeof data.metadata !== 'object' ||
      Array.isArray(data.metadata) ||
      Object.values(data.metadata).some((value) => typeof value !== 'string'))
  ) {
    errors.push('metadata must map string keys to string values');
  }
  for (const key of Object.keys(LIST_KEYS)) {
    const value = data[key];
    if (
      value !== undefined &&
      typeof value !== 'string' &&
      !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
    )
      errors.push(`${key} must be a string or a list of strings`);
  }
  if (!stripFrontmatter(raw).trim()) errors.push('Skill body must not be empty');
  return errors;
}

/** Serialize standard metadata and WrongStack extensions using the same YAML contract. */
export function serializeSkillDocument(metadata: Record<string, unknown>, body: string): string {
  return `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

/** True when `name` matches the agentskills.io name format (chars + length only). */
export function isValidSkillNameFormat(name: string): boolean {
  return name.length >= 1 && name.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

/**
 * Validate a skill `name` against the agentskills.io spec:
 * 1-64 chars; lowercase letters, digits, and single hyphens only; no
 * leading/trailing/consecutive hyphens. Pass the parent directory name to also
 * enforce the "name must match the parent directory" rule.
 *
 * Returns a list of human-readable violations (empty = valid).
 */
export function validateSkillName(name: string, parentDirName?: string): string[] {
  const errors: string[] = [];
  if (!name || name.trim().length === 0) {
    errors.push('name is empty');
    return errors;
  }
  if (name.length > 64) errors.push(`name is ${name.length} characters (max 64)`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    errors.push(
      'name must be lowercase letters, digits, and single hyphens only ' +
        '(no leading/trailing/consecutive hyphens)',
    );
  }
  if (parentDirName !== undefined && name !== parentDirName) {
    errors.push(`name "${name}" must match its parent directory "${parentDirName}"`);
  }
  return errors;
}
