import {
  countLines,
  firstNonEmpty,
  fmtBytes,
  fmtDuration,
  formatMatchHit,
  numOf,
  scanNumberedRange,
  shortenPath,
  stringOf,
  truncMid,
  tryParseJson,
} from './basic-format.js';
import { formatToolOutputSageWith } from './sage-output-format.js';
import { GENERIC_BUDGET, OUT_BUDGET, summarizeJsonObject } from './tool-output-summary.js';

export {
  countLines,
  firstNonEmpty,
  fmtBytes,
  fmtDuration,
  fmtTok,
  formatMatchHit,
  numOf,
  scanNumberedRange,
  shortenPath,
  stringOf,
  truncMid,
  tryParseJson,
} from './basic-format.js';
export {
  extractSageBlock,
  type ParsedSageMemoryLine,
  parseSageMemoryLine,
  resolveEntrySage,
  type SageSplit,
} from './sage-output-format.js';
export {
  AssistantStreamBox,
  assistantStreamBoxHeight,
  MAX_STREAM_DISPLAY_CHARS,
  streamBoxRows,
  ToolStreamBox,
  tailForDisplay,
  toolStreamBoxHeight,
} from './stream-box.js';
export { formatToolArgs } from './tool-arg-format.js';
export type { ToolVisualLine, ToolVisualLineKind } from './tool-visual-types.js';
export { ToolOutputLines } from './visual-lines.js';
export { formatToolVisualOutput } from './visual-tool-output.js';

/**
 * Like `formatToolOutput` but strips SAGE-injected memory lines first.
 * Returns the tool output lines and any SAGE block lines separately.
 */
export function formatToolOutputSage(
  toolName: string,
  output: string | undefined,
  ok: boolean,
  outputBytes?: number | undefined,
  outputLines?: number | undefined,
  /** Structured SAGE lines from `tool.executed.sage`, when the entry has them. */
  sageLines?: readonly string[] | undefined,
): { cleanOutput: string; outLines: string[]; sageLines: string[] } {
  return formatToolOutputSageWith({
    toolName,
    output,
    ok,
    sageLines,
    outputBytes,
    outputLines,
    formatToolOutput,
  });
}

// ============================================
// Tool output formatting
// ============================================

/**
 * Distil a tool's result text into 0–N digest lines the renderer can stack.
 */
export function formatToolOutput(
  toolName: string,
  output: string | undefined,
  ok: boolean,
  _outputBytes?: number | undefined,
  outputLines?: number | undefined,
): string[] {
  if (!output) return ok ? [] : ['failed'];
  const text = output.trim();
  if (!text) return ok ? [] : ['failed'];

  const json = tryParseJson(text);

  if (toolName === 'write' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const bytes = numOf(o['bytes_written']) ?? numOf(o['bytes']);
    const created = o['created'] === true;
    const tag = created ? 'created' : 'updated';
    return bytes !== undefined ? [`${tag} · ${fmtBytes(bytes)}`] : [tag];
  }

  if (toolName === 'edit' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const reps = numOf(o['replacements']);
    if (reps !== undefined) return [`${reps} replacement${reps === 1 ? '' : 's'}`];
  }

  if (toolName === 'patch' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const applied = numOf(o['applied']);
    const rejected = numOf(o['rejected']);
    const files = Array.isArray(o['files']) ? (o['files'] as unknown[]) : undefined;
    const lines: string[] = [];
    if (applied !== undefined || rejected !== undefined) {
      const parts = [];
      if (applied !== undefined) parts.push(`${applied} applied`);
      if (rejected !== undefined && rejected > 0) parts.push(`${rejected} rejected`);
      lines.push(parts.join(' · '));
    }
    if (files && files.length > 0) {
      const first = stringOf(files[0]) ?? '';
      const more = files.length > 1 ? ` (+${files.length - 1})` : '';
      lines.push(`${shortenPath(first, 60)}${more}`);
    }
    if (lines.length > 0) return lines;
  }

  if (toolName === 'replace' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const files = numOf(o['files_modified']);
    const reps = numOf(o['total_replacements']);
    if (files !== undefined && reps !== undefined) {
      return [
        `${reps} replacement${reps === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`,
      ];
    }
  }

  // diff
  if (toolName === 'diff' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const diffFiles = Array.isArray(o['files']) ? (o['files'] as unknown[]) : undefined;
    const truncated = o['truncated'] === true;
    const mode = stringOf(o['mode']);
    const diff = stringOf(o['diff']);
    if (!diff) return [diffFiles && diffFiles.length === 0 ? 'no changes' : 'empty diff'];
    const head: string[] = [];
    if (mode) head.push(mode);
    if (diffFiles && diffFiles.length > 0)
      head.push(`${diffFiles.length} file${diffFiles.length === 1 ? '' : 's'}`);
    if (truncated) head.push('truncated');
    return head.length > 0 ? [head.join(' · ')] : [];
  }

  // read
  if (toolName === 'read') {
    if (outputLines !== undefined) return [];
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const bytes = numOf(o['bytes']);
      if (bytes !== undefined) return [`${fmtBytes(bytes)} read`];
    }
    const range = scanNumberedRange(text);
    if (range.count > 0 && range.first !== undefined && range.last !== undefined) {
      if (range.first === range.last) return [`L${range.first} · ${fmtBytes(text.length)}`];
      const contiguous = range.count === range.last - range.first + 1;
      const head = `L${range.first}–${range.last}`;
      const tail = contiguous
        ? `${range.count} line${range.count === 1 ? '' : 's'}`
        : `${range.count} lines (gaps)`;
      return [`${head} · ${tail} · ${fmtBytes(text.length)}`];
    }
  }

  // grep / glob
  if (toolName === 'grep' || toolName === 'glob') {
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const matches = Array.isArray(o['matches']) ? (o['matches'] as unknown[]) : undefined;
      const count = numOf(o['count']) ?? matches?.length;
      const truncated = o['truncated'] === true;
      if (count !== undefined) {
        if (count === 0) return ['no matches'];
        const lines: string[] = [
          `${count} match${count === 1 ? '' : 'es'}${truncated ? ' (truncated)' : ''}`,
        ];
        const firstHit = matches && matches.length > 0 ? formatMatchHit(matches[0]) : undefined;
        if (firstHit) lines.push(firstHit);
        return lines;
      }
    }
  }

  // bash / shell
  //
  // Command tools may report output as either stdout/stderr or output/error.
  // Support both shapes here so timeout chips, line counts, and previews do not
  // depend on which executor produced the result.
  if (toolName === 'bash' || toolName === 'shell') {
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const exit = numOf(o['exit_code']) ?? numOf(o['exitCode']);
      const stdout = stringOf(o['stdout']) ?? stringOf(o['output']) ?? '';
      const stderr = stringOf(o['stderr']) ?? stringOf(o['error']) ?? '';
      const timedOut = o['timed_out'] === true || o['timedOut'] === true;
      const stdoutLines = countLines(stdout);
      const stderrLines = countLines(stderr);
      const head: string[] = [];
      if (exit !== undefined) head.push(`exit ${exit}`);
      if (timedOut) head.push('timed out');
      const lineParts: string[] = [];
      if (stdoutLines > 0) lineParts.push(`${stdoutLines} out`);
      if (stderrLines > 0) lineParts.push(`${stderrLines} err`);
      if (lineParts.length > 0) head.push(lineParts.join(' · '));
      const lines: string[] = [];
      if (head.length > 0) lines.push(head.join(' · '));
      const stdoutPreview = firstNonEmpty(stdout);
      const stderrPreview = firstNonEmpty(stderr);
      if (stdoutPreview) lines.push(`"${truncMid(stdoutPreview, 70)}"`);
      if (stderrPreview && stderrPreview !== stdoutPreview) {
        lines.push(`! "${truncMid(stderrPreview, 70)}"`);
      }
      if (lines.length > 0) return lines;
    }
  }

  // exec (heuristic danger detection, PR 1-3)
  //
  // The exec tool's output is JSON with a `danger: { level, reasons, matchedRule? }`
  // field. When the level is destructive or caution we prefix the digest with
  // a compact chip-style banner so those calls are visually distinct from
  // safe ones. Safe calls (and output with no `danger` field) use the same
  // compact `exit N · X out · Y err` shape as the bash / git branches below,
  // so all three command-tool outputs read uniformly.
  //
  // Format:
  //   destructive:  ⚠ DESTRUCTIVE  recursive force-delete
  //                  exit 0 · 12 out · 0 err
  //                  "build/"
  //   caution:      ! CAUTION  inline script evaluation (-c / -e / --eval)
  //                  exit 0 · 0 out · 0 err
  //   safe:         exit 0 · 12 out · 0 err
  //                  "build/"
  //
  // The chip is plain-text so this is portable across TUI/webui/CLI
  // renderers; theme-tinting is up to the consumer.
  if (toolName === 'exec') {
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const danger = o['danger'];
      const level =
        danger && typeof danger === 'object'
          ? (danger as Record<string, unknown>)['level']
          : undefined;
      const reasons =
        danger && typeof danger === 'object'
          ? ((danger as Record<string, unknown>)['reasons'] as unknown)
          : undefined;
      const exit = numOf(o['exit_code']) ?? numOf(o['exitCode']);
      const stdout = stringOf(o['stdout']) ?? '';
      const stderr = stringOf(o['stderr']) ?? '';
      const stdoutLines = countLines(stdout);
      const stderrLines = countLines(stderr);
      const head: string[] = [];
      if (level === 'destructive' || level === 'caution') {
        const chip = level === 'destructive' ? '⚠ DESTRUCTIVE' : '! CAUTION';
        const reasonText =
          Array.isArray(reasons) && reasons.length > 0
            ? String(reasons[0])
            : level === 'destructive'
              ? 'destructive command'
              : 'caution-level command';
        head.push(`${chip}  ${reasonText}`);
      }
      if (exit !== undefined) head.push(`exit ${exit}`);
      const lineParts: string[] = [];
      if (stdoutLines > 0) lineParts.push(`${stdoutLines} out`);
      if (stderrLines > 0) lineParts.push(`${stderrLines} err`);
      if (lineParts.length > 0) head.push(lineParts.join(' · '));
      const lines: string[] = [];
      if (head.length > 0) lines.push(head.join(' · '));
      // Surface additional reasons (beyond the first) as a stacked list
      if (Array.isArray(reasons) && reasons.length > 1) {
        for (let i = 1; i < reasons.length; i++) {
          lines.push(`  · ${String(reasons[i])}`);
        }
      }
      const stdoutPreview = firstNonEmpty(stdout);
      const stderrPreview = firstNonEmpty(stderr);
      if (stdoutPreview) lines.push(`"${truncMid(stdoutPreview, 70)}"`);
      if (stderrPreview && stderrPreview !== stdoutPreview) {
        lines.push(`! "${truncMid(stderrPreview, 70)}"`);
      }
      if (lines.length > 0) return lines;
    }
  }

  // todo
  if (toolName === 'todo') return ok ? [] : [text.split('\n')[0] ?? ''];

  // fetch / webfetch
  if (toolName === 'fetch' || toolName === 'webfetch' || toolName === 'web_fetch') {
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const status = numOf(o['status']);
      const ct = stringOf(o['content_type']);
      const url = stringOf(o['url']);
      const content = stringOf(o['content']);
      const head: string[] = [];
      if (status !== undefined) head.push(`HTTP ${status}`);
      if (ct) head.push(ct.split(';')[0] ?? ct);
      if (content) head.push(fmtBytes(Buffer.byteLength(content, 'utf8')));
      const lines: string[] = [];
      if (head.length > 0) lines.push(head.join(' · '));
      if (url && status !== undefined && (status < 200 || status >= 400)) {
        lines.push(shortenPath(url, 70));
      }
      if (lines.length > 0) return lines;
    }
  }

  // git
  if (toolName === 'git' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const exit = numOf(o['exitCode']) ?? numOf(o['exit_code']);
    const stdout = stringOf(o['stdout']) ?? '';
    const stderr = stringOf(o['stderr']) ?? '';
    const head: string[] = [];
    if (exit !== undefined) head.push(`exit ${exit}`);
    const stdoutLines = countLines(stdout);
    const stderrLines = countLines(stderr);
    const lparts: string[] = [];
    if (stdoutLines > 0) lparts.push(`${stdoutLines} out`);
    if (stderrLines > 0) lparts.push(`${stderrLines} err`);
    if (lparts.length > 0) head.push(lparts.join(' · '));
    const lines: string[] = [];
    if (head.length > 0) lines.push(head.join(' · '));
    const preview = firstNonEmpty(stdout) ?? firstNonEmpty(stderr);
    if (preview) lines.push(`"${truncMid(preview, 70)}"`);
    if (lines.length > 0) return lines;
  }

  // lint
  if (toolName === 'lint' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const linter = stringOf(o['linter']);
    const files = numOf(o['files_checked']);
    const errors = numOf(o['errors']) ?? 0;
    const warnings = numOf(o['warnings']) ?? 0;
    const fix = o['fix_applied'] === true;
    const head: string[] = [];
    if (linter && linter !== 'none') head.push(linter);
    head.push(`${errors} error${errors === 1 ? '' : 's'}`);
    head.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
    if (files !== undefined) head.push(`${files} file${files === 1 ? '' : 's'}`);
    if (fix) head.push('fixed');
    return [head.join(' · ')];
  }

  // format
  if (toolName === 'format' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const fixer = stringOf(o['fixer']);
    const checked = numOf(o['files_checked']);
    const changed = numOf(o['files_changed']);
    const head: string[] = [];
    if (fixer && fixer !== 'none') head.push(fixer);
    if (changed !== undefined && checked !== undefined) {
      head.push(`${changed}/${checked} changed`);
    } else if (changed !== undefined) {
      head.push(`${changed} changed`);
    }
    return head.length > 0 ? [head.join(' · ')] : [];
  }

  // typecheck
  if (toolName === 'typecheck' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const exit = numOf(o['exit_code']) ?? numOf(o['exitCode']);
    const errors = numOf(o['errors']);
    const head: string[] = [];
    if (errors !== undefined) head.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (exit !== undefined) head.push(`exit ${exit}`);
    const stdout = stringOf(o['output']) ?? stringOf(o['stdout']) ?? '';
    const lines: string[] = [];
    if (head.length > 0) lines.push(head.join(' · '));
    const preview = firstNonEmpty(stdout);
    if (preview && (!errors || errors > 0)) lines.push(`"${truncMid(preview, 70)}"`);
    if (lines.length > 0) return lines;
  }

  // test
  if (toolName === 'test' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const runner = stringOf(o['runner']);
    const total = numOf(o['tests_run']) ?? 0;
    const passed = numOf(o['passed']) ?? 0;
    const failed = numOf(o['failed']) ?? 0;
    const duration = numOf(o['duration_ms']);
    const head: string[] = [];
    if (runner && runner !== 'none') head.push(runner);
    if (o['status'] === 'no_tests') return [[...head, 'no tests'].join(' · ')];
    head.push(`${passed}/${total} passed`);
    if (failed > 0) head.push(`${failed} failed`);
    if (duration !== undefined) head.push(fmtDuration(duration));
    return [head.join(' · ')];
  }

  // audit
  if (toolName === 'audit' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const total = numOf(o['total']) ?? 0;
    const summary = stringOf(o['summary']);
    if (total === 0) return ['no vulnerabilities'];
    const head = `${total} vulnerabilit${total === 1 ? 'y' : 'ies'}`;
    return summary && summary.toLowerCase() !== head.toLowerCase()
      ? [head, truncMid(summary, OUT_BUDGET)]
      : [head];
  }

  // outdated
  if (toolName === 'outdated' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const total = numOf(o['total']) ?? 0;
    const pkgs = Array.isArray(o['packages']) ? (o['packages'] as unknown[]) : undefined;
    if (total === 0) return ['all up to date'];
    const lines: string[] = [`${total} outdated`];
    if (pkgs && pkgs.length > 0) {
      const first = pkgs[0];
      if (first && typeof first === 'object') {
        const p = first as Record<string, unknown>;
        const name = stringOf(p['name']) ?? stringOf(p['package']);
        const cur = stringOf(p['current']);
        const wanted = stringOf(p['wanted']) ?? stringOf(p['latest']);
        if (name && cur && wanted) lines.push(`${name}: ${cur} → ${wanted}`);
        else if (name) lines.push(name);
      }
    }
    return lines;
  }

  // tree
  if (toolName === 'tree' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const files = numOf(o['total_files']);
    const dirs = numOf(o['total_dirs']);
    const truncated = o['truncated'] === true;
    const parts: string[] = [];
    if (files !== undefined) parts.push(`${files} file${files === 1 ? '' : 's'}`);
    if (dirs !== undefined) parts.push(`${dirs} dir${dirs === 1 ? '' : 's'}`);
    if (truncated) parts.push('truncated');
    return parts.length > 0 ? [parts.join(' · ')] : [];
  }

  // json
  if (toolName === 'json' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const err = stringOf(o['error']);
    if (err) return [truncMid(err, OUT_BUDGET)];
    const type = stringOf(o['type']);
    const keys = Array.isArray(o['keys']) ? (o['keys'] as unknown[]) : undefined;
    const parts: string[] = [];
    if (type) parts.push(type);
    if (keys) parts.push(`${keys.length} key${keys.length === 1 ? '' : 's'}`);
    return parts.length > 0 ? [parts.join(' · ')] : [];
  }

  // install
  if (toolName === 'install' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const exit = numOf(o['exit_code']) ?? numOf(o['exitCode']);
    const added = numOf(o['added']);
    const removed = numOf(o['removed']);
    const head: string[] = [];
    if (exit !== undefined) head.push(`exit ${exit}`);
    if (added !== undefined) head.push(`+${added}`);
    if (removed !== undefined) head.push(`-${removed}`);
    const stdout = stringOf(o['stdout']) ?? stringOf(o['output']) ?? '';
    const lines: string[] = [];
    if (head.length > 0) lines.push(head.join(' · '));
    const preview = firstNonEmpty(stdout);
    if (preview) lines.push(`"${truncMid(preview, 70)}"`);
    if (lines.length > 0) return lines;
  }

  // scaffold
  if (toolName === 'scaffold' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const created = Array.isArray(o['created']) ? (o['created'] as unknown[]) : undefined;
    const skipped = Array.isArray(o['skipped']) ? (o['skipped'] as unknown[]) : undefined;
    const parts: string[] = [];
    if (created !== undefined) parts.push(`${created.length} created`);
    if (skipped !== undefined && skipped.length > 0) parts.push(`${skipped.length} skipped`);
    if (parts.length > 0) return [parts.join(' · ')];
  }

  // remember / forget / memory
  if (toolName === 'remember' || toolName === 'forget' || toolName === 'memory') {
    return ok ? [toolName === 'forget' ? 'removed' : 'saved'] : [text.split('\n')[0] ?? ''];
  }

  // mode
  if (toolName === 'mode' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const mode = stringOf(o['mode']) ?? stringOf(o['active']) ?? stringOf(o['name']);
    if (mode) return [`mode: ${mode}`];
  }

  // search
  if (toolName === 'search' && json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const matches = Array.isArray(o['matches'])
      ? (o['matches'] as unknown[])
      : Array.isArray(o['results'])
        ? (o['results'] as unknown[])
        : undefined;
    const count = numOf(o['count']) ?? matches?.length;
    if (count !== undefined) {
      if (count === 0) return ['no results'];
      const lines: string[] = [`${count} result${count === 1 ? '' : 's'}`];
      const firstHit = matches && matches.length > 0 ? formatMatchHit(matches[0]) : undefined;
      if (firstHit) lines.push(firstHit);
      return lines;
    }
  }

  // logs
  if (toolName === 'logs') {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return [];
    const head = `${lines.length} line${lines.length === 1 ? '' : 's'}`;
    const lastLine = lines[lines.length - 1];
    return lastLine ? [head, `"${truncMid(lastLine.trim(), 70)}"`] : [head];
  }

  // Generic fallback
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const summary = summarizeJsonObject(json as Record<string, unknown>);
    if (summary) return [summary];
  }
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return [truncMid(collapsed, GENERIC_BUDGET)];
}
