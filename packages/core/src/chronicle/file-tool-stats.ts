/** Compact numeric evidence from the complete result, before preview truncation. */
export function fileToolStats(
  name: string,
  output: string,
  input?: unknown,
): Record<string, unknown> | undefined {
  // `patch` is the odd one out: its result carries no diff at all, so it is
  // derived from the input diff instead and handled before the shared parse.
  if (name === 'patch') return patchToolStats(output, input);
  if (!['read', 'edit', 'write'].includes(name)) return undefined;
  let result: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(output);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    result = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (name === 'read' && typeof result.text === 'string') {
    // `read` right-aligns line numbers to a common width, so every line before
    // a digit-width boundary is emitted with leading spaces ("  1→…"). Anchor on
    // optional whitespace or those lines are silently dropped from the count.
    const lines = result.text.split('\n').filter((line) => /^\s*\d+→/.test(line));
    // Summary, binary, PDF, and already-shown stubs have no numbered source lines.
    if (!lines.length) return undefined;
    return {
      readLines: lines.length,
      ...(Number.isInteger(result.total_lines) && Number(result.total_lines) >= 0
        ? { totalLines: result.total_lines }
        : {}),
    };
  }
  if (name === 'write' && result.created === true && typeof result.diff === 'string') {
    const created = /^\+\+\+ [^\n]+\n\+ \(new file, (\d+) lines\)$/.exec(result.diff);
    if (created) return { addedLines: Number(created[1]), removedLines: 0, partial: false };
  }
  if (typeof result.diff !== 'string' || !result.diff.startsWith('--- ')) return undefined;
  const { addedLines, removedLines } = countHunks(result.diff);
  return {
    addedLines,
    removedLines,
    partial: typeof result.note === 'string' && /diff truncated/i.test(result.note),
  };
}

/** One file addressed by a multi-file diff, with its own line deltas. */
interface PatchFileDelta {
  path: string;
  addedLines: number;
  removedLines: number;
}

/**
 * `patch` returns only `{applied, rejected, files, dry_run, message}` — the
 * unified diff it applied never appears in the result, so line counts have to
 * come from the tool input. Deltas are kept per file because one patch call
 * routinely spans several files, and the Files tab is keyed by path.
 */
function patchToolStats(output: string, input: unknown): Record<string, unknown> | undefined {
  const result = asObject(output);
  if (!result) return undefined;
  // A dry run wrote nothing, so counting it would invent file activity.
  if (result.dry_run === true) return undefined;
  // A reject means some hunks did not land, and a unified diff carries no
  // per-hunk reject markers — there is no way to tell which file's deltas
  // actually applied, so crediting the whole diff would overstate the change.
  // Today `patch` only reports a non-zero `rejected` on a dry run (a real
  // failed apply throws, so it never reaches here as a success); this keeps the
  // guarantee local instead of depending on that contract holding elsewhere.
  if (typeof result.rejected === 'number' && result.rejected > 0) return undefined;
  if (typeof result.applied === 'number' && result.applied <= 0) return undefined;
  const args = asObject(input);
  const diff = args && typeof args.patch === 'string' ? args.patch : undefined;
  if (!diff) return undefined;
  const strip =
    typeof args?.strip === 'number' && Number.isInteger(args.strip) && args.strip >= 0
      ? args.strip
      : 1;
  const files = patchFileDeltas(diff, strip);
  if (!files.files.length) return undefined;
  return {
    addedLines: files.files.reduce((total, file) => total + file.addedLines, 0),
    removedLines: files.files.reduce((total, file) => total + file.removedLines, 0),
    // A diff that still had a hunk open at EOF was cut short in transit (the
    // subagent bridge bounds the body), so these totals undercount reality.
    partial: files.truncated,
    patchFiles: files.files,
  };
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Split a unified diff into per-file line deltas.
 *
 * A file header is only recognised OUTSIDE a hunk. Inside one, the same
 * prefixes are ordinary body lines — a removed `-- SQL comment` is
 * `--- SQL comment` and an added `++i;` is `+++i;` — so keying off the
 * prefix alone would invent a file for every such line. A hunk's extent comes
 * from the line counts its `@@` header declares, which is what tells us when
 * the next header pair is genuinely a new file.
 */
function patchFileDeltas(
  diff: string,
  strip: number,
): { files: PatchFileDelta[]; truncated: boolean } {
  const lines = diff.split('\n');
  const files: PatchFileDelta[] = [];
  let current: PatchFileDelta | undefined;
  let inHunk = false;
  let oldLeft = 0;
  let newLeft = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!inHunk && line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      // `/dev/null` is matched BEFORE stripping: `patch -p1` would otherwise
      // reduce it to `dev/null` and a deletion would be attributed to a file
      // that does not exist.
      const rawOld = line.slice(4).trim();
      const rawNew = lines[i + 1]!.slice(4).trim();
      const path =
        rawNew === '/dev/null'
          ? stripComponents(rawOld, strip)
          : rawOld === '/dev/null'
            ? stripComponents(rawNew, strip)
            : stripComponents(rawNew, strip);
      if (path && path !== '/dev/null') {
        current = { path, addedLines: 0, removedLines: 0 };
        files.push(current);
      } else {
        current = undefined;
      }
      i++; // consume the `+++` half of the header pair
      continue;
    }
    const hunk = /^@@+\s+-\d+(?:,(\d+))?\s+\+\d+(?:,(\d+))?\s+@@/.exec(line);
    if (hunk) {
      // An omitted count means one line, per unified-diff convention.
      inHunk = true;
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }
    if (!inHunk || !current) continue;
    if (line.startsWith('+')) {
      current.addedLines++;
      newLeft--;
    } else if (line.startsWith('-')) {
      current.removedLines++;
      oldLeft--;
    } else if (line.startsWith(' ')) {
      oldLeft--;
      newLeft--;
    }
    // `\ No newline at end of file` belongs to the preceding line and
    // consumes neither side's count.
    if (oldLeft <= 0 && newLeft <= 0) inHunk = false;
  }
  return {
    files: files.filter((file) => file.addedLines > 0 || file.removedLines > 0),
    // Still inside a hunk at EOF means the body was cut off before the diff
    // ended, so the last file's counts are known-incomplete.
    truncated: inHunk,
  };
}

/** `patch -pN`: drop N leading slash-separated components, GNU-style. */
function stripComponents(path: string, strip: number): string {
  let rest = path.replace(/\\/g, '/');
  for (let i = 0; i < strip; i++) {
    const slash = rest.indexOf('/');
    if (slash === -1) return rest;
    rest = rest.slice(slash + 1);
  }
  return rest;
}

/** Count added/removed lines inside `@@` hunks, ignoring file headers. */
function countHunks(diff: string): { addedLines: number; removedLines: number } {
  let addedLines = 0;
  let removedLines = 0;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@ ')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) addedLines++;
    if (line.startsWith('-')) removedLines++;
  }
  return { addedLines, removedLines };
}
