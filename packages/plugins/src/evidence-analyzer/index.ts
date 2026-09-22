/**
 * Shared implementation for the focused evidence analyzers.
 *
 * These plugins intentionally analyse an explicit file or pasted command/CI
 * output. They never execute a project command, mutate a file, or quietly
 * claim that a broad check passed without the caller supplying evidence.
 */
import { readFileSync } from 'node:fs';
import { type Plugin, ToolValidationError } from '@wrongstack/core/types';
import { withinProject } from '../runtime/index.js';

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

function lineFor(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

/** Never echo a credential-like value back in a diagnostic excerpt. */
function redactExcerpt(line: string): string {
  return line
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*([^\s#]+)/gi, '$1=[REDACTED]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]{12,}/gi, '$1 [REDACTED]');
}

function analyze(content: string, profile: EvidenceAnalyzerProfile, maxFindings: number) {
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
      const line = content.split(/\r?\n/)[lineFor(content, index) - 1] ?? '';
      findings.push({
        rule: rule.label,
        severity: rule.severity,
        line: lineFor(content, index),
        excerpt: redactExcerpt(line.trim()).slice(0, 240),
        advice: rule.advice,
      });
      if (findings.length >= maxFindings) return findings;
    }
  }
  return findings;
}

function sourceFromInput(input: { path?: string; content?: string }) {
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
  if (!withinProject(path)) {
    throw new ToolValidationError({ message: 'path must be inside the project', field: 'path' });
  }
  const content = readFileSync(path, 'utf8');
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
  const state: EvidenceAnalyzerState = { analyses: 0, readErrors: 0, findings: 0 };
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
      state.analyses = 0;
      state.readErrors = 0;
      state.findings = 0;
      const config = readConfig(api.config.extensions?.[profile.name]);
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
        async execute(input: { path?: string; content?: string }) {
          if (!config.enabled) throw new Error(`${profile.name} is disabled`);
          try {
            const evidence = sourceFromInput(input ?? {});
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
            state.readErrors += 1;
            throw error;
          }
        },
      });
      api.log.info(`${profile.name} plugin loaded`, { enabled: config.enabled });
    },
    teardown(api) {
      const final = { ...state };
      state.analyses = 0;
      state.readErrors = 0;
      state.findings = 0;
      api.log.info(`${profile.name}: teardown complete`, { final });
    },
    async health() {
      return {
        ok: state.readErrors === 0,
        message: `${profile.name}: ${state.analyses} evidence input(s), ${state.findings} finding(s), ${state.readErrors} read error(s)`,
        counters: { ...state },
      };
    },
  };
}
