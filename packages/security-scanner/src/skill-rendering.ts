/**
 * Rendering for generated security skills: the static fallback skill body,
 * its confidence score, and the portable Agent Skills document built from an
 * LLM payload.
 */
import { serializeSkillDocument, validateSkillDocument } from '@wrongstack/core/skills';
import type { GeneratedSkillContent, SecurityPattern, TechStackInfo } from './types.js';

export function buildSkillContent(
  techStack: TechStackInfo,
  patterns: SecurityPattern[],
): GeneratedSkillContent {
  const lines: string[] = [
    '---',
    `name: security-scanner-${techStack.stack}`,
    `description: |`,
    `  Auto-generated security scanner for ${techStack.stack} projects.`,
    `  Scans for secrets, injection vectors, and configuration issues.`,
    `version: 1.0.0`,
    '---',
    '',
    `# Security Scanner — ${techStack.stack.toUpperCase()}`,
    '',
    `Scans ${techStack.stack} codebase for security vulnerabilities.`,
    '',
    '## Scan Targets',
    '',
    '### Code Vulnerabilities',
    patterns
      .filter((p) =>
        p.fileExtensions.some((ext) =>
          ['.ts', '.js', '.py', '.go', '.java', '.cs', '.rs'].includes(ext),
        ),
      )
      .map((p) => `- **${p.name}** (${p.severity}): ${p.description}`)
      .join('\n'),
    '',
    '### Configuration Issues',
    patterns
      .filter((p) =>
        p.fileExtensions.some((ext) => ['.json', '.yaml', '.yml', '.env', '.config'].includes(ext)),
      )
      .map((p) => `- **${p.name}** (${p.severity}): ${p.description}`)
      .join('\n'),
    '',
    '## Severity Levels',
    '',
    '- **CRITICAL**: Remote code execution, SQL injection, hardcoded secrets',
    '- **HIGH**: Command injection, XXE, authentication bypass',
    '- **MEDIUM**: Information disclosure, weak crypto, debug mode',
    '- **LOW**: Code quality issues, missing headers',
    '',
    '## Remediation',
    '',
    patterns.map((p) => `- **${p.name}**: ${p.remediation}`).join('\n'),
  ];

  return {
    type: 'skill',
    content: lines.join('\n'),
  };
}

export function calculateConfidence(techStack: TechStackInfo): number {
  let confidence = 0.7;
  if (techStack.dependencies && techStack.dependencies.length > 0) confidence += 0.1;
  if (techStack.manifestFile) confidence += 0.1;
  if (techStack.packageManager && techStack.packageManager !== 'unknown') confidence += 0.1;
  return Math.min(confidence, 1.0);
}

/** Convert the scanner payload into a portable Agent Skills document. */
export function renderGeneratedSkill(
  data: { name?: string; description?: string },
  stack: string,
): string {
  const name =
    typeof data.name === 'string' &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name) &&
    data.name.length <= 64
      ? data.name
      : `security-scanner-${stack}`;
  const description =
    (typeof data.description === 'string'
      ? data.description
      : `Use when scanning ${stack} projects for security issues.`
    )
      .trim()
      .slice(0, 1024) || `Scan ${stack} projects.`;
  const raw = serializeSkillDocument(
    { name, description, metadata: { version: '1.0.0' } },
    `# ${name}\n\nUse the following scanning instructions and patterns:\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
  );
  const errors = validateSkillDocument(raw, name);
  if (errors.length) throw new Error(errors.join('; '));
  return raw;
}
