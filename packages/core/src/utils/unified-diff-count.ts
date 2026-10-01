/**
 * Added/removed line counts of a unified diff.
 *
 * Counting `+`/`-` lines while excluding every line that starts with `+++` or
 * `---` drops content: a removed YAML or Markdown `---` separator is the line
 * `----`, a removed `-- SQL comment` is `--- SQL comment`, an added `++i;` is
 * `+++i;`. Only the file header is not content, and it is recognisable as a
 * pair — a `--- ` line directly followed by a `+++ ` line. Lines before the
 * first hunk (commit message, `git format-patch` preamble and its `---`
 * separator) are not counted either.
 */
export function countUnifiedDiffLines(diff: string): { added: number; removed: number } {
  const lines = diff.split(/\r?\n/);
  let added = 0;
  let removed = 0;
  let sawHunk = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith('@@')) {
      sawHunk = true;
      continue;
    }
    if (!sawHunk) continue;
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      index += 1;
      continue;
    }
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}
