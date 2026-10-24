/**
 * git_diff plugin — verifies that the git working tree diff matches expectations.
 * Config is in check.notes as JSON: { expectedFiles: string[], minChanges?: number, maxChanges?: number }
 * Produces evidence: { filesChanged, added, removed, modified, deleted, diffStats[] }.
 */
import type { KanbanCheck, KanbanVerificationCheckResult } from '../../types.js';
import type { VerificationContext } from '../verification-context.js';
import type { VerifierPlugin } from '../verifier-plugin.js';

export class GitDiffPlugin implements VerifierPlugin {
  readonly id = 'git_diff';
  readonly kind = 'deterministic' as const;

  canHandle(checkType: string): boolean {
    return checkType === 'git_diff';
  }

  async verify(
    check: KanbanCheck,
    context: VerificationContext,
  ): Promise<KanbanVerificationCheckResult> {
    // Parse config from notes JSON. Non-JSON notes are legacy free text and
    // mean "no config"; JSON that parses but violates the config shape is a
    // misconfigured check and must fail closed as a structured check error.
    // A bare `JSON.parse(...) as {...}` here let `notes: "null"` throw out of
    // verify() — and since neither verifier-registry nor the completion
    // protocol catches per-check, one corrupt note killed the entire
    // verifyTaskCompletion run — while `{"expectedFiles": "src/x.ts"}`
    // crashed on .filter and `{"minChanges": "5"}` silently coerced.
    const notes = parseGitDiffNotesConfig(check.notes);
    if (!notes.ok) {
      return {
        checkId: check.id,
        description: check.description,
        type: check.type,
        status: 'error',
        evidence: {},
        error: notes.reason,
      };
    }
    const config = notes.config;

    let diff: Awaited<ReturnType<VerificationContext['diffSince']>>;
    try {
      diff = await context.diffSince();
    } catch (error) {
      return {
        checkId: check.id,
        description: check.description,
        type: check.type,
        status: 'error',
        evidence: {},
        error: `Git diff could not be verified: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const status = await context.gitStatus();

    let status_: 'passed' | 'failed' = 'passed';
    const errors: string[] = [];

    if (status.error) {
      status_ = 'failed';
      errors.push(status.error);
    }

    // Check if changes exist at all
    if (diff.length === 0) {
      status_ = 'failed';
      errors.push('No file changes detected since the task started.');
    }

    // Check expected files
    if (config.expectedFiles?.length) {
      const changedPaths = new Set(diff.map((d) => d.path.replaceAll('\\', '/')));
      const missing = config.expectedFiles.filter(
        (f) => !changedPaths.has(f.replaceAll('\\', '/')),
      );
      if (missing.length > 0) {
        status_ = 'failed';
        errors.push(`Expected changes in files not found: ${missing.join(', ')}.`);
      }
    }

    // Check min/max changes
    if (config.minChanges !== undefined) {
      const totalChanges = diff.reduce((s, d) => s + d.linesAdded + d.linesRemoved, 0);
      if (totalChanges < config.minChanges) {
        status_ = 'failed';
        errors.push(`Expected at least ${config.minChanges} lines changed, got ${totalChanges}.`);
      }
    }
    if (config.maxChanges !== undefined) {
      const totalChanges = diff.reduce((s, d) => s + d.linesAdded + d.linesRemoved, 0);
      if (totalChanges > config.maxChanges) {
        status_ = 'failed';
        errors.push(`Expected at most ${config.maxChanges} lines changed, got ${totalChanges}.`);
      }
    }

    return {
      checkId: check.id,
      description: check.description,
      type: check.type,
      status: status_,
      evidence: {
        filesChanged: diff.length,
        added: diff.filter((d) => d.operation === 'create').length,
        modified: diff.filter((d) => d.operation === 'modify').length,
        deleted: diff.filter((d) => d.operation === 'delete').length,
        diffStats: diff.map((d) => ({
          path: d.path,
          operation: d.operation,
          linesAdded: d.linesAdded,
          linesRemoved: d.linesRemoved,
        })),
        workingTree: {
          clean: status.clean,
          untracked: status.untracked,
          unstaged: status.unstaged,
          staged: status.staged,
        },
      },
      error: errors.length > 0 ? errors.join(' ') : undefined,
    };
  }
}

interface GitDiffNotesConfig {
  expectedFiles?: string[];
  minChanges?: number;
  maxChanges?: number;
}

/**
 * Runtime shape guard for the check-notes trust boundary. `check.notes` is
 * stored board state authored by agents and humans, so its contents are not
 * statically knowable. Free text that is not JSON keeps the legacy no-config
 * behavior; JSON that parses but violates the config contract fails closed so
 * a misconfigured expectation is surfaced as a check error instead of being
 * silently dropped (degrading to the weaker existence-diff verdict) or thrown
 * out of verify().
 */
function parseGitDiffNotesConfig(
  notes: string | undefined,
): { ok: true; config: GitDiffNotesConfig } | { ok: false; reason: string } {
  if (!notes?.trim()) return { ok: true, config: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(notes);
  } catch {
    return { ok: true, config: {} };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: `git_diff notes must be a JSON object with optional expectedFiles (string[]), minChanges (number), maxChanges (number); got ${JSON.stringify(parsed)}`,
    };
  }
  const record = parsed as Record<string, unknown>;
  const config: GitDiffNotesConfig = {};
  if (record['expectedFiles'] !== undefined) {
    const value = record['expectedFiles'];
    if (!Array.isArray(value)) {
      return {
        ok: false,
        reason: 'git_diff notes field "expectedFiles" must be an array of strings',
      };
    }
    const files: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        return {
          ok: false,
          reason: 'git_diff notes field "expectedFiles" must be an array of strings',
        };
      }
      files.push(entry);
    }
    config.expectedFiles = files;
  }
  for (const key of ['minChanges', 'maxChanges'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return {
        ok: false,
        reason: `git_diff notes field "${key}" must be a finite number`,
      };
    }
    config[key] = value;
  }
  return { ok: true, config };
}
