/**
 * Shared implementation for the focused evidence analyzers.
 *
 * These plugins intentionally analyse an explicit file or pasted command/CI
 * output. They never execute a project command, mutate a file, or quietly
 * claim that a broad check passed without the caller supplying evidence.
 */
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Plugin, ToolValidationError } from '@wrongstack/core/types';
import { safePath } from '../runtime/sandbox.js';

const MAX_INPUT_CHARS = 1_000_000;

export interface EvidenceRule {
  label: string;
  severity: 'info' | 'warning' | 'error';
  pattern: RegExp;
  advice: string;
}

export interface EvidenceAnalyzerProfile {
  name: string;
  toolName: string;
  description: string;
  evidenceHint: string;
  rules: readonly EvidenceRule[];
}

interface EvidenceAnalyzerConfig {
  enabled: boolean;
  maxFindings: number;
}

interface EvidenceAnalyzerState {
  analyses: number;
  readErrors: number;
  findings: number;
}

function readConfig(raw: unknown): EvidenceAnalyzerConfig {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const max = record['maxFindings'] ?? record['max_findings'];
  return {
    enabled: record['enabled'] !== false,
    maxFindings:
      typeof max === 'number' && Number.isInteger(max) && max >= 1 && max <= 200 ? max : 40,
  };
}

/** Never echo a credential-like value back in a diagnostic excerpt. */
function redactExcerpt(line: string): string {
  return line
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*([^\s#]+)/gi, '$1=[REDACTED]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]{12,}/gi, '$1 [REDACTED]');
}

function analyze(content: string, profile: EvidenceAnalyzerProfile, maxFindings: number) {
  const starts = [0];
  for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  const findings: Array<{
    rule: string;
    severity: EvidenceRule['severity'];
    line: number;
    excerpt: string;
    advice: string;
  }> = [];
  for (const rule of profile.rules) {
    const matcher = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + 'g');
    for (const match of content.matchAll(matcher)) {
      const index = match.index ?? 0;
      let low = 0;
      let high = starts.length;
      while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle]! <= index) low = middle;
        else high = middle;
      }
      const line = content.slice(starts[low], starts[low + 1] ?? content.length);
      findings.push({
        rule: rule.label,
        severity: rule.severity,
        line: low + 1,
        excerpt: redactExcerpt(line.trim()).slice(0, 240),
        advice: rule.advice,
      });
      if (findings.length >= maxFindings) return findings;
    }
  }
  return findings;
}

async function sourceFromInput(
  input: { path?: string; content?: string },
  root: string,
  signal: AbortSignal,
) {
  if (typeof input.content === 'string') {
    if (input.content.length > MAX_INPUT_CHARS) {
      throw new ToolValidationError({
        message: `content exceeds the ${MAX_INPUT_CHARS}-character evidence limit`,
        field: 'content',
      });
    }
    return { content: input.content, source: 'inline evidence' };
  }
  const path = typeof input.path === 'string' ? input.path.trim() : '';
  if (!path) {
    throw new ToolValidationError({ message: 'path or content is required', field: 'path' });
  }
  const canonical = safePath(path, { projectRoot: root });
  if (!canonical) {
    throw new ToolValidationError({ message: 'path must be inside the project', field: 'path' });
  }
  const file = await open(canonical, 'r');
  let content: string;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_INPUT_CHARS * 4) {
      throw new ToolValidationError({
        message: 'Expected a regular evidence file within the size limit',
        field: 'path',
      });
    }
    const buffer = Buffer.alloc(info.size + 1);
    let total = 0;
    while (total < buffer.length) {
      signal.throwIfAborted();
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > info.size)
      throw new Error('Evidence file grew during read; retry with stable inputs');
    content = buffer.subarray(0, total).toString('utf8');
  } finally {
    await file.close();
  }
  if (content.length > MAX_INPUT_CHARS) {
    throw new ToolValidationError({
      message: `file exceeds the ${MAX_INPUT_CHARS}-character evidence limit`,
      field: 'path',
    });
  }
  return { content, source: path };
}

/** Build a deterministic, evidence-first diagnostic plugin. */
export function createEvidenceAnalyzerPlugin(profile: EvidenceAnalyzerProfile): Plugin {
  const hosts = new Map<object, { state: EvidenceAnalyzerState; abort: AbortController }>();
  const defaults: EvidenceAnalyzerConfig = { enabled: true, maxFindings: 40 };
  return {
    name: profile.name,
    version: '0.1.0',
    description: profile.description,
    apiVersion: '^0.1.10',
    capabilities: { tools: true },
    defaultConfig: { ...defaults },
    configSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true, description: 'Master switch.' },
        maxFindings: {
          type: 'number',
          minimum: 1,
          maximum: 200,
          default: 40,
          description: 'Maximum reported findings per analysis.',
        },
      },
    },
    setup(api) {
      hosts.get(api)?.abort.abort();
      const state: EvidenceAnalyzerState = { analyses: 0, readErrors: 0, findings: 0 };
      const abort = new AbortController();
      hosts.set(api, { state, abort });
      api.tools.register({
        name: profile.toolName,
        description: `${profile.evidenceHint} Returns only evidence found in the supplied file or pasted content; it does not run commands.`,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Project-relative file containing evidence to inspect.',
            },
            content: {
              type: 'string',
              description: 'Pasted evidence, such as a CI log or manifest text.',
            },
          },
        },
        permission: 'auto',
        category: 'Diagnostics',
        mutating: false,
        async execute(input: { path?: string; content?: string }, ctx, opts) {
          const signal = AbortSignal.any([abort.signal, ...(opts?.signal ? [opts.signal] : [])]);
          signal.throwIfAborted();
          const config = readConfig(api.config.extensions?.[profile.name]);
          if (!config.enabled) throw new Error(`${profile.name} is disabled`);
          try {
            const evidence = await sourceFromInput(
              input ?? {},
              resolve(ctx?.projectRoot ?? ctx?.cwd ?? process.cwd()),
              signal,
            );
            signal.throwIfAborted();
            const findings = analyze(evidence.content, profile, config.maxFindings);
            state.analyses += 1;
            state.findings += findings.length;
            return {
              ok: true,
              plugin: profile.name,
              source: evidence.source,
              evidenceChars: evidence.content.length,
              findings,
              summary: {
                errors: findings.filter((finding) => finding.severity === 'error').length,
                warnings: findings.filter((finding) => finding.severity === 'warning').length,
                info: findings.filter((finding) => finding.severity === 'info').length,
              },
              limitation:
                'Only the supplied evidence was inspected; no project command was executed.',
            };
          } catch (error) {
            if (!signal.aborted) state.readErrors += 1;
            throw error;
          }
        },
      });
      api.log.info(`${profile.name} plugin loaded`, {
        enabled: readConfig(api.config.extensions?.[profile.name]).enabled,
      });
    },
    teardown(api) {
      const host = hosts.get(api);
      host?.abort.abort();
      const final = { ...host?.state };
      hosts.delete(api);
      api.log.info(`${profile.name}: teardown complete`, { final });
    },
    async health() {
      const state: EvidenceAnalyzerState = { analyses: 0, readErrors: 0, findings: 0 };
      for (const host of hosts.values()) {
        state.analyses += host.state.analyses;
        state.readErrors += host.state.readErrors;
        state.findings += host.state.findings;
      }
      return {
        ok: state.readErrors === 0,
        message: `${profile.name}: ${state.analyses} evidence input(s), ${state.findings} finding(s), ${state.readErrors} read error(s)`,
        counters: { ...state },
      };
    },
  };
}
