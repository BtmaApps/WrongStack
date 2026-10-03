/**
 * accessibility-auditor plugin — audits UI files for common accessibility
 * issues using fast regex-based heuristics.
 *
 * Tools registered:
 * - a11y_audit : Scan a file or directory for a11y issues.
 * - a11y_status : Show config + per-session counters.
 *
 * Hooks registered:
 * - PostToolUse with matcher `write|edit` to UI files, injecting a short
 *   additionalContext summary of any new accessibility issues.
 *
 * Config (`config.extensions['accessibility-auditor']`):
 *
 * ```jsonc
 * {
 *   "enabled": true,
 *   "includeExtensions": [".tsx", ".jsx", ".html", ".vue"],
 *   "maxFindings": 50,
 *   "severity": "warn",         // "warn" | "block"
 *   "onWriteEdit": true
 * }
 * ```
 *
 * @public
 */

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { type Plugin, ToolValidationError } from '@wrongstack/core/types';
import {
  collectSourceFilesAsync,
  matchesExtension,
  releaseHandle,
  withinProject,
} from '../runtime/index.js';

const API_VERSION = '^0.1.10';

// ---------------------------------------------------------------------------
// Module-scope state (H1 audit pattern)
// ---------------------------------------------------------------------------

export type A11yRule =
  | 'missing-alt'
  | 'missing-input-label'
  | 'low-contrast-placeholder'
  | 'missing-button-text'
  | 'duplicate-id';

export interface A11yFinding {
  file: string;
  line: number;
  rule: A11yRule;
  severity: 'error' | 'warning';
  message: string;
  /**
   * Optional scan limitation. Cross-file labels (e.g. `<Label>` in a
   * sibling component) are invisible to this single-file regex walk.
   */
  note?: string;
}

interface AccessibilityAuditorState {
  auditCount: number;
  fileCount: number;
  findingCount: number;
  hookInvocationCount: number;
  lastResult: {
    path: string;
    fileCount: number;
    findingCount: number;
    when: string;
  } | null;
  hookUnregister: null | (() => void);
}

const state: AccessibilityAuditorState = {
  auditCount: 0,
  fileCount: 0,
  findingCount: 0,
  hookInvocationCount: 0,
  lastResult: null,
  hookUnregister: null,
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface AccessibilityAuditorConfig {
  enabled: boolean;
  includeExtensions: string[];
  maxFindings: number;
  severity: 'warn' | 'block';
  onWriteEdit: boolean;
}

const DEFAULTS: AccessibilityAuditorConfig = {
  enabled: true,
  includeExtensions: ['.tsx', '.jsx', '.html', '.vue'],
  maxFindings: 50,
  severity: 'warn',
  onWriteEdit: true,
};

function readConfig(raw: unknown): AccessibilityAuditorConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  const rawExts = r['includeExtensions'] ?? r['include_extensions'] ?? r['extensions'];
  const rawMax = r['maxFindings'] ?? r['max_findings'] ?? r['limit'];
  const rawSeverity =
    typeof (r['severity'] ?? r['mode'] ?? r['action']) === 'string'
      ? String(r['severity'] ?? r['mode'] ?? r['action'])
          .trim()
          .toLowerCase()
      : undefined;
  const severity = rawSeverity === 'block' ? 'block' : DEFAULTS.severity;
  return {
    enabled: r['enabled'] !== false,
    includeExtensions: Array.isArray(rawExts)
      ? (rawExts as unknown[]).filter((x): x is string => typeof x === 'string')
      : DEFAULTS.includeExtensions,
    maxFindings:
      typeof rawMax === 'number' && rawMax >= 1 && rawMax <= 500 ? rawMax : DEFAULTS.maxFindings,
    severity,
    onWriteEdit: (r['onWriteEdit'] ?? r['on_write_edit'] ?? r['onSave']) !== false,
  };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

// withinProject() imported from ../runtime/index.js

async function assertPathExists(rawPath: string): Promise<void> {
  try {
    await stat(resolve(process.cwd(), rawPath));
  } catch (err) {
    throw new Error(`path not found: ${rawPath}`, { cause: err });
  }
}

function normalizeExtensions(exts: string[]): string[] {
  return exts.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`));
}

// ---------------------------------------------------------------------------
// Audit heuristics
// ---------------------------------------------------------------------------

const TAG_IMG = /<img\b[^>]*>/gi;
const TAG_INPUT = /<input\b[^>]*\/?>/gi;
const TAG_BUTTON = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
const INPUT_BUTTON = /<input\b[^>]*\btype\s*=\s*["'](submit|button|reset)["'][^>]*\/?>/gi;
// `(?<![-\w])`, not `\b`: a hyphen is a word boundary, so `\bid` also read
// `data-id="…"` as an element id (false duplicate ids, wrong label lookup).
const ATTR_ID = /(?<![-\w])id\s*=\s*["']([^"']+)["']/gi;
// `(?<![-\w])`, not `\b`, for the same reason as ATTR_ID above: a hyphen is a
// word boundary, so `\balt` also matched `data-alt="…"` (and `data-x-alt=`).
// A data-* attribute is invisible to assistive tech, so treating it as alt
// text silently suppressed the missing-alt error on such an image.
const ATTR_ALT = /(?<![-\w])alt\s*=/i;
// Captures the accessible-name VALUE, not just the attribute's presence: an
// empty `aria-label=""` (or `aria-labelledby=""`, which references nothing)
// names nothing for assistive tech, so mere presence is not a label. Same
// non-empty rule `hasMeaningfulAlt` already applies to `alt`.
const ATTR_ARIA_LABEL = /\b(?:aria-label|aria-labelledby)\s*=\s*["']?([^"'\s>]*)["']?/i;
// Captures the idref VALUE, not just the attribute's presence: an empty
// `aria-describedby=""` references nothing, so it is not a description at
// all. Treating it as one both displaced the error-severity
// `missing-input-label` with a warning and emitted a message claiming the
// element "uses aria-describedby as a description" — false for an empty one.
const ATTR_ARIA_DESCRIBEDBY = /\baria-describedby\s*=\s*["']?([^"'\s>]*)["']?/i;
// `(?<![-\w])`, not `\b`, for the same reason as ATTR_ID and ATTR_ALT above: a
// hyphen is a word boundary, so `\btitle` also matched `data-title="…"` (and
// `data-x-title=`). A data-* attribute is invisible to assistive tech, so
// treating it as a title suppressed `missing-input-label` and
// `missing-button-text` on inputs, buttons, and input[type=submit].
// Keeps the `(?<![-\w])` guard above AND captures the VALUE: `title` is a
// fallback accessible name, but an empty one supplies no name at all, so
// mere presence is not a label. Same non-empty rule `hasAccessibleName`
// applies to aria-label/aria-labelledby.
const ATTR_TITLE = /(?<![-\w])title\s*=\s*["']?([^"'\s>]*)["']?/i;
// `(?<![-\w])`, not `\b`, for the same reason as ATTR_ID, ATTR_ALT,
// ATTR_TITLE and ATTR_VALUE above: a hyphen is a word boundary, so
// `\bplaceholder` also matched `data-placeholder="…"`. A data-* attribute is
// never rendered, so reporting it as "<input> uses placeholder text" invented
// a finding and stated something false about the element. This is the last
// constant in the module still using a bare `\b`.
// It ALSO captures the VALUE: an empty or whitespace-only `placeholder`
// displays no hint text at all, so counting mere presence as placeholder text
// invented a second finding. Same non-empty rule hasAccessibleName,
// hasTitleName and hasButtonValue apply to the other name-like attributes.
const ATTR_PLACEHOLDER = /(?<![-\w])placeholder\s*=\s*["']?([^"'\s>]*)["']?/i;
// `(?<![-\w])`, not `\b`, for the same reason as ATTR_ID, ATTR_ALT and
// ATTR_TITLE above: a hyphen is a word boundary, so `\bvalue` also matched
// `data-value="…"` (and `data-x-value=`). For input[type=submit|button|reset]
// the `value` attribute IS the accessible name, and a data-* attribute is
// invisible to assistive tech, so this suppressed the error-severity
// `missing-button-text` finding on such a control.
// Keeps the `(?<![-\w])` guard from round 43 AND captures the VALUE: for
// input[type=submit|button|reset] the `value` attribute is the button's label,
// so `value=""` renders an UNLABELLED control. The finding below says the
// element "is missing value/aria-label/title" — an empty value is exactly a
// missing value, so treating mere presence as a value suppressed the finding
// the rule itself asks for. Same non-empty rule hasAccessibleName and
// hasTitleName apply to the other two accepted attributes.
const ATTR_VALUE = /(?<![-\w])value\s*=\s*["']?([^"'\s>]*)["']?/i;
const ATTR_ROLE_DECORATIVE = /\brole\s*=\s*["'](?:presentation|none)["']/i;
const LABEL_SPAN = /<label\b[^>]*>[\s\S]*?<\/label>/gi;
const FIELDSET_SPAN = /<fieldset\b[^>]*>[\s\S]*?<\/fieldset>/gi;
const SINGLE_FILE_LABEL_NOTE =
  'Single-file heuristic: a label declared in a sibling component file is not visible to this scan.';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Half-open [start, end) offsets of one open/close tag pair in the file. */
interface TagSpan {
  start: number;
  end: number;
}

function collectSpans(content: string, re: RegExp): TagSpan[] {
  return [...content.matchAll(re)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

function isInsideSpan(spans: readonly TagSpan[], offset: number): boolean {
  return spans.some((s) => offset > s.start && offset < s.end);
}

function hasMeaningfulAlt(tag: string): boolean {
  const m = ATTR_ALT.exec(tag);
  ATTR_ALT.lastIndex = 0;
  if (!m) return false;
  // Same `(?<![-\w])` guard as ATTR_ALT: this re-reads the value, so it must
  // not pick up a `data-alt`/`data-x-alt` value either.
  const valMatch = tag.match(/(?<![-\w])alt\s*=\s*["']?([^"'\s>]*)["']?/i);
  const alt = valMatch ? valMatch[1]!.trim() : '';
  if (alt.length > 0) return true;
  // Decorative images: empty alt plus an explicit role hint is enough.
  return ATTR_ROLE_DECORATIVE.test(tag);
}

function hasAccessibleName(tag: string): boolean {
  const m = ATTR_ARIA_LABEL.exec(tag);
  ATTR_ARIA_LABEL.lastIndex = 0;
  if (!m) return false;
  // Read the VALUE, not just the presence: `aria-label=""` and
  // `aria-labelledby=""` give assistive tech no name at all, so an element
  // carrying one still has no accessible name and must be reported.
  return m[1]!.trim().length > 0;
}

function hasTitleName(tag: string): boolean {
  const m = ATTR_TITLE.exec(tag);
  ATTR_TITLE.lastIndex = 0;
  if (!m) return false;
  // `title` is a FALLBACK accessible name, so the same non-empty rule applies:
  // `title=""` / `title="   "` leaves assistive tech with no name at all.
  return m[1]!.trim().length > 0;
}

function hasButtonValue(tag: string): boolean {
  const m = ATTR_VALUE.exec(tag);
  ATTR_VALUE.lastIndex = 0;
  if (!m) return false;
  // For input[type=submit|button|reset] the value attribute IS the label, so
  // `value=""` renders an unlabelled control. The caller reports it as
  // "missing value/aria-label/title" — which an empty value satisfies not at all.
  return m[1]!.trim().length > 0;
}

function hasDescriptionRef(tag: string): boolean {
  const m = ATTR_ARIA_DESCRIBEDBY.exec(tag);
  ATTR_ARIA_DESCRIBEDBY.lastIndex = 0;
  if (!m) return false;
  // An empty idref list describes nothing, so it is not a supplementary
  // description either. The caller falls through to `missing-input-label`.
  return m[1]!.trim().length > 0;
}

function hasPlaceholderText(tag: string): boolean {
  const m = ATTR_PLACEHOLDER.exec(tag);
  ATTR_PLACEHOLDER.lastIndex = 0;
  if (!m) return false;
  // An empty or whitespace-only `placeholder` displays no hint text, so it is
  // not the placeholder-as-label signal this rule is looking for.
  return m[1]!.trim().length > 0;
}

function hasFieldsetLegendLabel(
  tag: string,
  content: string,
  fieldsetSpans: readonly TagSpan[],
  inputStart: number,
): boolean {
  const labelledBy = tag.match(/\baria-labelledby\s*=\s*["']([^"']+)["']/i);
  if (labelledBy?.[1]) {
    for (const id of labelledBy[1].split(/\s+/).filter(Boolean)) {
      const idRe = new RegExp(`(?<![-\\w])id\\s*=\\s*["']${escapeRegExp(id)}["']`, 'i');
      if (idRe.test(content)) return true;
    }
  }
  const typeMatch = tag.match(/\btype\s*=\s*["']?([^"'\s>]*)["']?/i);
  const type = typeMatch ? typeMatch[1]!.toLowerCase() : 'text';
  if (type === 'checkbox' || type === 'radio') {
    // Per-element containment: THIS input sits inside a fieldset whose
    // <legend> closes before the input starts. The previous content-wide
    // regex accepted any fieldset/legend/input sequence anywhere in the
    // file, letting an unrelated legend label every checkbox/radio in it.
    return fieldsetSpans.some(
      (s) =>
        inputStart > s.start &&
        inputStart < s.end &&
        /<legend\b[\s\S]*?<\/legend>/i.test(content.slice(s.start, inputStart)),
    );
  }
  return false;
}

async function auditFile(filePath: string, projectRoot: string): Promise<A11yFinding[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const findings: A11yFinding[] = [];
  const lines = content.split(/\r?\n/);
  const idsByValue = new Map<string, number[]>();

  // Absolute offset of each line's start, so per-tag evidence (label wrap,
  // fieldset/legend) can be evaluated by element containment instead of by
  // file-wide regex — a file-global test let one wrapped input or one
  // unrelated legend label every input in the file. indexOf('\n') keeps
  // offsets exact for CRLF sources as well.
  const lineStarts: number[] = [0];
  for (let nl = content.indexOf('\n'); nl !== -1; nl = content.indexOf('\n', nl + 1)) {
    lineStarts.push(nl + 1);
  }
  const labelSpans = collectSpans(content, LABEL_SPAN);
  const fieldsetSpans = collectSpans(content, FIELDSET_SPAN);

  function add(
    line: number,
    rule: A11yRule,
    severity: 'error' | 'warning',
    message: string,
    note?: string,
  ) {
    findings.push({
      file: relative(projectRoot, filePath),
      line,
      rule,
      severity,
      message,
      ...(note ? { note } : {}),
    });
  }

  // First pass: collect ids and per-line tags.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    // Duplicate ids.
    for (const idMatch of line.matchAll(ATTR_ID)) {
      const id = idMatch[1]!;
      const list = idsByValue.get(id) ?? [];
      list.push(lineNo);
      idsByValue.set(id, list);
    }
    ATTR_ID.lastIndex = 0;

    // Missing alt on images.
    for (const imgMatch of line.matchAll(TAG_IMG)) {
      const tag = imgMatch[0]!;
      if (!hasMeaningfulAlt(tag)) {
        add(lineNo, 'missing-alt', 'error', '<img> is missing meaningful alt text');
      }
    }
    TAG_IMG.lastIndex = 0;

    // Inputs.
    for (const inputMatch of line.matchAll(TAG_INPUT)) {
      const tag = inputMatch[0]!;
      const typeMatch = tag.match(/\btype\s*=\s*["']?([^"'\s>]*)["']?/i);
      const type = typeMatch ? typeMatch[1]!.toLowerCase() : 'text';
      // Hidden/submit/button/reset inputs are not text-field a11y concerns;
      // input[type=submit|button|reset] is handled separately below.
      if (
        type === 'hidden' ||
        type === 'button' ||
        type === 'submit' ||
        type === 'reset' ||
        type === 'image'
      ) {
        continue;
      }

      const hasAriaLabel = hasAccessibleName(tag);
      const hasDescribedBy = hasDescriptionRef(tag);
      const hasTitle = hasTitleName(tag);
      const idMatchLocal = tag.match(/(?<![-\w])id\s*=\s*["']([^"']+)["']/i);
      const id = idMatchLocal ? idMatchLocal[1] : null;

      let hasLabelFor = false;
      if (id) {
        const labelForRe = new RegExp(
          // JSX spells the attribute `htmlFor`; `\bfor` never matched it, so
          // every React label/input pair was reported unlabelled.
          `<label\\b[^>]*(?<![-\\w])(?:html)?for\\s*=\\s*["']${escapeRegExp(id)}["']`,
          'i',
        );
        hasLabelFor = labelForRe.test(content);
      }
      const inputStart = (lineStarts[i] ?? 0) + (inputMatch.index ?? 0);
      const wrappedInLabel = isInsideSpan(labelSpans, inputStart);
      const hasLegend = hasFieldsetLegendLabel(tag, content, fieldsetSpans, inputStart);
      const hasPrimaryLabel =
        hasAriaLabel || hasTitle || hasLabelFor || wrappedInLabel || hasLegend;

      // aria-describedby is supplementary, not a primary name.
      if (!hasPrimaryLabel && hasDescribedBy) {
        add(
          lineNo,
          'low-contrast-placeholder',
          'warning',
          `<input type="${type}"> uses aria-describedby as a description (supplementary, not a primary label)`,
        );
      } else if (!hasPrimaryLabel) {
        add(
          lineNo,
          'missing-input-label',
          'error',
          `<input type="${type}"> is missing an associated label`,
          SINGLE_FILE_LABEL_NOTE,
        );
      }

      // Placeholder used as a label proxy is a common low-contrast / usability issue.
      if (!hasPrimaryLabel && hasPlaceholderText(tag)) {
        add(
          lineNo,
          'low-contrast-placeholder',
          'warning',
          '<input> uses placeholder text (often low contrast and disappears on input)',
        );
      }
    }
    TAG_INPUT.lastIndex = 0;

    // Buttons.
    for (const buttonMatch of line.matchAll(TAG_BUTTON)) {
      const tag = buttonMatch[0]!;
      const inner = buttonMatch[1] ?? '';
      const hasText = inner.replace(/\s+/g, '').length > 0;
      const hasAriaLabel = hasAccessibleName(tag);
      const hasTitle = hasTitleName(tag);
      if (!hasText && !hasAriaLabel && !hasTitle) {
        add(
          lineNo,
          'missing-button-text',
          'error',
          '<button> has no visible text or accessible label',
        );
      }
    }
    TAG_BUTTON.lastIndex = 0;

    // input[type=submit|button|reset] without value.
    for (const inputButtonMatch of line.matchAll(INPUT_BUTTON)) {
      const tag = inputButtonMatch[0]!;
      if (!hasButtonValue(tag) && !hasAccessibleName(tag) && !hasTitleName(tag)) {
        add(
          lineNo,
          'missing-button-text',
          'error',
          `<input type="${inputButtonMatch[1]}"> is missing value/aria-label/title`,
        );
      }
    }
    INPUT_BUTTON.lastIndex = 0;
  }

  // Duplicate ids across the file.
  for (const [id, lineNos] of idsByValue.entries()) {
    if (lineNos.length > 1) {
      for (const lineNo of lineNos) {
        add(lineNo, 'duplicate-id', 'error', `Duplicate id "${id}"`);
      }
    }
  }

  return findings;
}

async function auditPath(
  rawPath: string,
  cfg: AccessibilityAuditorConfig,
): Promise<{
  path: string;
  findings: A11yFinding[];
  fileCount: number;
  /** Files actually opened. Lower than `fileCount` when the cap was hit. */
  scannedFiles: number;
  /** True when `maxFindings` stopped the walk before every file was read. */
  truncated: boolean;
}> {
  const root = process.cwd();
  const resolved = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
  const exts = normalizeExtensions(cfg.includeExtensions);
  const files = await collectSourceFilesAsync(resolved, { extensions: exts });
  const findings: A11yFinding[] = [];
  let scannedFiles = 0;
  let truncated = false;
  for (const file of files) {
    const fileFindings = await auditFile(file, root);
    scannedFiles += 1;
    findings.push(...fileFindings);
    if (findings.length >= cfg.maxFindings) {
      // Only a real truncation if files remain unexamined.
      truncated = scannedFiles < files.length;
      break;
    }
  }
  return {
    path: relative(root, resolved),
    findings: findings.slice(0, cfg.maxFindings),
    fileCount: files.length,
    scannedFiles,
    truncated,
  };
}

function truncationWarning(result: {
  fileCount: number;
  scannedFiles?: number;
  truncated?: boolean;
}): string {
  if (!result.truncated) return '';
  const unexamined = Math.max(0, result.fileCount - (result.scannedFiles ?? result.fileCount));
  return `partial scan — ${unexamined} files not examined`;
}

function formatSummary(result: {
  path: string;
  findings: A11yFinding[];
  fileCount: number;
  scannedFiles?: number;
  truncated?: boolean;
}): string {
  const trunc = truncationWarning(result);
  if (result.findings.length === 0) {
    const clean = `\n✅ accessibility-auditor: no issues found in ${result.path} (${result.fileCount} file${result.fileCount === 1 ? '' : 's'}).`;
    return trunc ? `${clean}\n⚠️ ${trunc}` : clean;
  }
  const lines = result.findings.map((f) => `  - ${f.file}:${f.line} — ${f.message} (${f.rule})`);
  return (
    `\n⚠️ accessibility-auditor: ${result.findings.length} issue(s) in ${result.path} (${result.fileCount} file${result.fileCount === 1 ? '' : 's'}):\n` +
    lines.join('\n') +
    '\nConsider adding missing labels/alt text or resolving duplicate ids.' +
    (trunc ? `\n⚠️ ${trunc}` : '')
  );
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const plugin: Plugin = {
  name: 'accessibility-auditor',
  version: '0.1.0',
  description:
    'Audits .tsx/.jsx/.html/.vue files for common accessibility issues and reports findings after writes/edits',
  apiVersion: API_VERSION,
  capabilities: { tools: true, hooks: true },
  defaultConfig: { ...DEFAULTS },
  configSchema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        default: true,
        description: 'Master switch.',
      },
      includeExtensions: {
        type: 'array',
        items: { type: 'string' },
        default: ['.tsx', '.jsx', '.html', '.vue'],
        description: 'File extensions to audit.',
      },
      maxFindings: {
        type: 'number',
        minimum: 1,
        maximum: 500,
        default: 50,
        description: 'Maximum findings returned per audit.',
      },
      severity: {
        type: 'string',
        enum: ['warn', 'block'],
        default: 'warn',
        description:
          'warn = inject findings as additionalContext; block = refuse the mutating tool when issues appear.',
      },
      onWriteEdit: {
        type: 'boolean',
        default: true,
        description: 'Run audit after write|edit to UI files.',
      },
    },
  },

  setup(api) {
    // Idempotent re-init (H1 audit pattern).
    state.auditCount = 0;
    state.fileCount = 0;
    state.findingCount = 0;
    state.hookInvocationCount = 0;
    state.lastResult = null;
    state.hookUnregister = releaseHandle(state.hookUnregister);

    const cfg = readConfig(api.config.extensions?.['accessibility-auditor']);

    const hook = async (input: {
      toolName?: string | undefined;
      toolInput?: unknown;
      toolResult?: { content: string; isError: boolean } | undefined;
    }): Promise<{ decision?: 'block'; reason?: string; additionalContext?: string } | void> => {
      if (!cfg.enabled || !cfg.onWriteEdit) return;
      if (input.toolResult?.isError) return;

      const inp = (input.toolInput ?? {}) as Record<string, unknown>;
      const rawPath =
        inp['path'] ??
        inp['TargetFile'] ??
        inp['filePath'] ??
        inp['targetFile'] ??
        inp['file_path'] ??
        inp['file'];
      const sourcePath = typeof rawPath === 'string' ? rawPath : undefined;
      if (!sourcePath) return;
      if (!withinProject(sourcePath)) return;

      const exts = normalizeExtensions(cfg.includeExtensions);
      if (!matchesExtension(sourcePath, exts)) return;

      state.hookInvocationCount += 1;
      const result = await auditPath(sourcePath, cfg);
      state.auditCount += 1;
      state.fileCount += result.fileCount;
      state.findingCount += result.findings.length;
      state.lastResult = {
        path: result.path,
        fileCount: result.fileCount,
        findingCount: result.findings.length,
        when: new Date().toISOString(),
      };

      if (result.findings.length === 0 && !result.truncated) return;

      const summary = formatSummary(result);
      if (cfg.severity === 'block' && result.findings.length > 0) {
        return { decision: 'block' as const, reason: summary };
      }
      return { additionalContext: summary };
    };

    state.hookUnregister = api.registerHook('PostToolUse', 'write|edit', hook, {
      background: true,
    });

    // --- a11y_audit tool ---
    api.tools.register({
      name: 'a11y_audit',
      description:
        'Audit a file or directory for accessibility issues. Scans .tsx/.jsx/.html/.vue files for missing alt text, missing labels, low-contrast placeholders, missing button text, and duplicate ids.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File or directory path to audit (relative to project root).',
          },
        },
        required: ['path'],
      },
      permission: 'auto',
      category: 'Diagnostics',
      mutating: false,
      async execute(input: { path: string }) {
        if (!cfg.enabled) throw new Error('accessibility-auditor is disabled');
        const raw = input as Record<string, unknown>;
        const rawPath =
          (typeof input.path === 'string' && input.path.trim().length > 0
            ? input.path.trim()
            : undefined) ??
          (typeof raw['directory'] === 'string' ? raw['directory'] : undefined) ??
          (typeof raw['dir'] === 'string' ? raw['dir'] : undefined) ??
          (typeof raw['SearchDirectory'] === 'string' ? raw['SearchDirectory'] : undefined) ??
          (typeof raw['TargetFile'] === 'string' ? raw['TargetFile'] : undefined) ??
          (typeof raw['filePath'] === 'string' ? raw['filePath'] : undefined) ??
          (typeof raw['file_path'] === 'string' ? raw['file_path'] : undefined) ??
          (typeof raw['targetFile'] === 'string' ? raw['targetFile'] : undefined) ??
          (typeof raw['file'] === 'string' ? raw['file'] : undefined) ??
          '.';
        if (!withinProject(rawPath)) {
          throw new ToolValidationError({
            message: 'path must be inside the project',
            field: 'path',
          });
        }
        // A missing path would otherwise walk nothing and read as a clean audit.
        await assertPathExists(rawPath);

        state.auditCount += 1;
        const result = await auditPath(rawPath, cfg);
        state.fileCount += result.fileCount;
        state.findingCount += result.findings.length;
        state.lastResult = {
          path: result.path,
          fileCount: result.fileCount,
          findingCount: result.findings.length,
          when: new Date().toISOString(),
        };

        const warning = truncationWarning(result);
        return {
          ok: true,
          path: result.path,
          fileCount: result.fileCount,
          scannedFiles: result.scannedFiles,
          // Say so when the cap stopped the walk early: a partial scan
          // that reports few findings must not read as a clean result.
          truncated: result.truncated,
          findingCount: result.findings.length,
          findings: result.findings,
          ...(warning ? { additionalContext: `⚠️ ${warning}`, warning } : {}),
        };
      },
    });

    // --- a11y_status tool ---
    api.tools.register({
      name: 'a11y_status',
      description:
        'Reports accessibility-auditor state: config, per-session counters, and the most recent scan result.',
      inputSchema: { type: 'object', properties: {} },
      permission: 'auto',
      category: 'Diagnostics',
      mutating: false,
      async execute() {
        return {
          ok: true,
          enabled: cfg.enabled,
          includeExtensions: cfg.includeExtensions,
          maxFindings: cfg.maxFindings,
          severity: cfg.severity,
          onWriteEdit: cfg.onWriteEdit,
          counters: {
            audits: state.auditCount,
            files: state.fileCount,
            findings: state.findingCount,
            hookInvocations: state.hookInvocationCount,
          },
          lastResult: state.lastResult,
        };
      },
    });

    api.log.info('accessibility-auditor plugin loaded', {
      version: '0.1.0',
      includeExtensions: cfg.includeExtensions,
      severity: cfg.severity,
    });
  },

  teardown(api) {
    if (state.hookUnregister) {
      try {
        state.hookUnregister();
      } catch {
        // best-effort
      }
      state.hookUnregister = null;
    }
    const final = {
      audits: state.auditCount,
      files: state.fileCount,
      findings: state.findingCount,
      hookInvocations: state.hookInvocationCount,
    };
    state.auditCount = 0;
    state.fileCount = 0;
    state.findingCount = 0;
    state.hookInvocationCount = 0;
    state.lastResult = null;
    api.log.info('accessibility-auditor: teardown complete', { final });
  },

  async health() {
    return {
      ok: true,
      message: state.lastResult
        ? `accessibility-auditor: ${state.auditCount} audit(s), last scan ${state.lastResult.path} had ${state.lastResult.findingCount} finding(s)`
        : `accessibility-auditor: ${state.auditCount} audit(s), ${state.findingCount} finding(s)`,
      counters: {
        audits: state.auditCount,
        files: state.fileCount,
        findings: state.findingCount,
        hookInvocations: state.hookInvocationCount,
      },
      lastResult: state.lastResult,
    };
  },
};

export default plugin;
