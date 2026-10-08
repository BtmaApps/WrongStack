import path from 'node:path';

/** Preserve compiler diagnostic identities across checkouts and checker cwd. */
export function parseTypecheckDiagnostics(result, repoRoot) {
  const diagnostics = [];
  const rootPosix = repoRoot.replaceAll(path.sep, '/');
  const rootWin = repoRoot.replaceAll('/', '\\');
  let current = null;
  function finish() {
    if (!current) return;
    current.message = current.message
      .replace(/\s+/g, ' ')
      .trim()
      .split(rootPosix)
      .join('<repo>')
      .split(rootWin)
      .join('<repo>')
      .replaceAll('\\', '/');
    current.key = `${current.project}|${current.file}|${current.code}|${current.message}`;
    diagnostics.push(current);
    current = null;
  }
  for (const line of result.output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    // Bun's summary and CI annotations are presentation, not diagnostics.
    if (
      /^(?:Found \d+ errors?\b|✓ No type errors\b|note:|::error\b)/.test(line) ||
      /^\s*(?:Errors\s+Files|\d+\s+.+:\d+)\s*$/.test(line)
    )
      continue;
    const withFile = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
    const global = line.match(/^error (TS\d+): (.*)$/);
    if (withFile) {
      finish();
      const absolute = path.isAbsolute(withFile[1])
        ? withFile[1]
        : path.resolve(result.cwd, withFile[1]);
      current = {
        project: result.project.id,
        file: path.relative(repoRoot, absolute).replaceAll(path.sep, '/'),
        code: withFile[4],
        message: withFile[5],
      };
    } else if (global) {
      finish();
      current = {
        project: result.project.id,
        file: '<project>',
        code: global[1],
        message: global[2],
      };
    } else if (current && line.trim()) current.message += ` ${line.trim()}`;
  }
  finish();
  return diagnostics;
}
