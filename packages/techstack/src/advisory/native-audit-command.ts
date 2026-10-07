import { execFile } from 'node:child_process';
import type { Evidence } from '../types.js';
import { cvssBaseScore } from './cvss.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface NativeAdvisory {
  readonly id: string;
  readonly packageName: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly summary: string;
  readonly fixVersion?: string | undefined;
  readonly url?: string | undefined;
  readonly aliases: readonly string[];
}

export interface NativeAuditResult {
  readonly advisories: readonly NativeAdvisory[];
  readonly evidence: Evidence;
}

// ── Parse helpers ──────────────────────────────────────────────────────────

/** Map npm audit severity strings */
export function npmSeverity(s: string): NativeAdvisory['severity'] {
  switch (s.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

/** Map cargo-audit severity strings */
/**
 * Real cargo-audit advisories carry a CVSS VECTOR in `cvss`
 * (`CVSS:3.1/AV:N/…`), never a severity word; taking the first `/` segment
 * read "CVSS:3.1" and every advisory fell through to `info`. Score the vector
 * (same calculator OSV severities use) and band it; a bare word still maps.
 */
export function cargoSeverity(cvss: string): NativeAdvisory['severity'] {
  if (/^CVSS:3\.[01]\//i.test(cvss)) {
    const score = cvssBaseScore('CVSS_V3', cvss);
    if (score !== undefined) {
      if (score >= 9) return 'critical';
      if (score >= 7) return 'high';
      if (score >= 4) return 'medium';
      if (score > 0) return 'low';
      return 'info';
    }
  }
  const s = cvss.split('/')[0] ?? '';
  switch (s.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

// ── Common command runner ──────────────────────────────────────────────────

export interface AuditCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type AuditCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => AuditCommandResult | Promise<AuditCommandResult>;

export const defaultAuditCommandRunner: AuditCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<AuditCommandResult> =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        // On Windows the audit tools are batch shims — `npm`/`composer` resolve
        // to npm.cmd/composer.cmd, which execFile cannot launch without a shell
        // (it ignores PATHEXT), so it fails ENOENT and every Windows audit
        // silently reports "exited with code null" with zero advisories. Route
        // through the shell there. Safe because every command and argument here
        // is a static literal (conventional filenames only) — no user input
        // reaches the command line; the dynamic workspace path is passed as cwd.
        shell: process.platform === 'win32',
      },
      (error, stdout, stderr) => {
        const exitCode = (error as (Error & { code?: string | number }) | null)?.code;
        const status = error ? (typeof exitCode === 'number' ? exitCode : null) : 0;
        resolve({
          status,
          stdout,
          stderr: stderr || (status === null && error ? error.message : ''),
        });
      },
    );
  });
