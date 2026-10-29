import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execCommand } from '../exec-command.js';
import type { LocalAssertion, LocalTaskMeta } from '../suites/local-manifest.js';
import type { BenchTask, GradeResult } from '../types.js';
import { restoredNote, restoreFromTemplate } from './restore-files.js';

export async function gradeLocalManifest(opts: {
  workdir: string;
  task: BenchTask;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}): Promise<GradeResult> {
  const meta = opts.task.meta as never as LocalTaskMeta;
  // The agent works in this same directory: grade with the checker it was
  // given, not one it rewrote (the sentinel assertion alone survives a rewrite
  // that keeps the sentinel string in a comment).
  const restored = await restoreFromTemplate(
    opts.task.templateDir,
    opts.workdir,
    meta.protectedFiles ?? [],
  );
  const note = restoredNote(restored, 'protected file(s)');
  const graded = await gradeWorkdir(opts, meta);
  if (!note) return graded;
  return { ...graded, detail: graded.detail ? `${note}\n${graded.detail}` : note };
}

async function gradeWorkdir(
  opts: { workdir: string; task: BenchTask; timeoutMs: number; signal?: AbortSignal | undefined },
  meta: LocalTaskMeta,
): Promise<GradeResult> {
  const failures: string[] = [];

  if (meta.grader) {
    const result = await execCommand({
      command: meta.grader.command,
      args: meta.grader.args ?? [],
      cwd: opts.workdir,
      timeoutMs: meta.grader.timeoutMs ?? opts.timeoutMs,
      shell: meta.grader.shell,
      maxBufferBytes: meta.grader.maxBufferBytes,
      env: meta.grader.env,
      signal: opts.signal,
    });

    if (result.timedOut) {
      return { passed: false, detail: `command timed out: ${meta.grader.command}` };
    }
    if (result.truncated) {
      return {
        passed: false,
        detail: `command output exceeded capture limit: ${meta.grader.command}`,
      };
    }
    if (result.exitCode !== 0) {
      return {
        passed: false,
        detail: `command failed (${meta.grader.command}, exit ${result.exitCode ?? 'unknown'}): ${tail(
          result.stdout + '\n' + result.stderr,
        )}`,
      };
    }
  }

  for (const assertion of meta.assertions ?? []) {
    const failure = await checkAssertion(opts.workdir, assertion);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    return { passed: false, detail: failures.join('\n') };
  }
  return { passed: true };
}

async function checkAssertion(
  workdir: string,
  assertion: LocalAssertion,
): Promise<string | undefined> {
  const target = await resolveInside(workdir, assertion.path);
  if (!target.ok) return target.error;

  switch (assertion.type) {
    case 'file_exists': {
      const exists = await pathExists(target.path);
      return exists ? undefined : `expected file to exist: ${assertion.path}`;
    }
    case 'file_not_exists': {
      const exists = await pathExists(target.path);
      return exists ? `expected file not to exist: ${assertion.path}` : undefined;
    }
    case 'file_contains': {
      const text = await readText(target.path);
      if (!text.ok) return `cannot read ${assertion.path}: ${text.error}`;
      return text.value.includes(assertion.text)
        ? undefined
        : `expected ${assertion.path} to contain ${JSON.stringify(assertion.text)}`;
    }
    case 'file_not_contains': {
      const text = await readText(target.path);
      if (!text.ok) return `cannot read ${assertion.path}: ${text.error}`;
      return text.value.includes(assertion.text)
        ? `expected ${assertion.path} not to contain ${JSON.stringify(assertion.text)}`
        : undefined;
    }
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(
  file: string,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fs.readFile(file, 'utf8') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function resolveInside(
  root: string,
  rel: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (path.isAbsolute(rel)) {
    return { ok: false, error: `absolute assertion paths are not allowed: ${rel}` };
  }
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, rel);
  const relative = path.relative(rootAbs, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { ok: false, error: `assertion path escapes workdir: ${rel}` };
  }
  let realpathFn: typeof fs.realpath | undefined;
  let lstatFn: typeof fs.lstat | undefined;
  try {
    realpathFn = fs.realpath;
    lstatFn = fs.lstat;
  } catch {
    realpathFn = undefined;
    lstatFn = undefined;
  }
  if (typeof realpathFn === 'function') {
    const canonicalRoot = await realpathFn(rootAbs).catch(() => undefined);
    if (canonicalRoot) {
      for (let probe = target; ; probe = path.dirname(probe)) {
        let canonical: string;
        try {
          canonical = await realpathFn(probe);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || probe === rootAbs) {
            return { ok: false, error: `assertion path escapes workdir: ${rel}` };
          }
          if (typeof lstatFn === 'function') {
            const entry = await lstatFn(probe).catch(() => undefined);
            if (entry?.isSymbolicLink()) {
              return { ok: false, error: `assertion path escapes workdir: ${rel}` };
            }
          }
          continue;
        }
        const resolved = path.resolve(canonical, path.relative(probe, target));
        const canonicalRelative = path.relative(canonicalRoot, resolved);
        if (
          canonicalRelative === '..' ||
          canonicalRelative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(canonicalRelative)
        ) {
          return { ok: false, error: `assertion path escapes workdir: ${rel}` };
        }
        break;
      }
    }
  }
  return { ok: true, path: target };
}

/** Last ~500 chars of output. */
function tail(s: string): string {
  const clean = s.trim();
  return clean.length > 500 ? `...${clean.slice(-500)}` : clean;
}
