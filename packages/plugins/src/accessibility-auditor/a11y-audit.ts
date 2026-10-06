import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { collectSourceFilesAsync } from '../runtime/index.js';
import { type AccessibilityAuditorConfig, normalizeExtensions } from './a11y-config.js';
import {
  type A11yFinding,
  type A11yRule,
  ATTR_ID,
  collectSpans,
  escapeRegExp,
  FIELDSET_SPAN,
  hasAccessibleName,
  hasButtonValue,
  hasDescriptionRef,
  hasFieldsetLegendLabel,
  hasMeaningfulAlt,
  hasPlaceholderText,
  hasTitleName,
  INPUT_BUTTON,
  isInsideSpan,
  LABEL_SPAN,
  SINGLE_FILE_LABEL_NOTE,
  TAG_BUTTON,
  TAG_IMG,
  TAG_INPUT,
} from './a11y-heuristics.js';

/**
 * File/directory audit for the accessibility-auditor plugin: run the
 * heuristics over each UI file, cap findings, and render the summary the
 * write/edit hook injects.
 */

export async function auditFile(filePath: string, projectRoot: string): Promise<A11yFinding[]> {
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

export async function auditPath(
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

export function truncationWarning(result: {
  fileCount: number;
  scannedFiles?: number;
  truncated?: boolean;
}): string {
  if (!result.truncated) return '';
  const unexamined = Math.max(0, result.fileCount - (result.scannedFiles ?? result.fileCount));
  return `partial scan — ${unexamined} files not examined`;
}

export function formatSummary(result: {
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
