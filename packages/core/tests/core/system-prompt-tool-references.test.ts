import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUNTIME_CAPABILITY_MANIFEST } from '../../src/coordination/agents/capability-manifest.js';
import { DefaultSystemPromptBuilder } from '../../src/index.js';
import { createMockTool } from '../helpers/test-harness.js';

function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`);
  return text.split('\n').some((line) => {
    // Only the documented executable-list spans are exempt, never the rest of the line.
    const scannable = line.replace(
      /^- Pipes work normally; `rg`\/`git`\/`node`(?= and other native exes run as-is)/,
      '- Pipes work normally; rg/git/node',
    );
    if (
      scannable.split('`').some((segment, index) => {
        if (index % 2 !== 1) return false;
        if (segment.includes(`<${name}`) || segment.includes(`</${name}`)) return false;
        return token.test(segment);
      })
    ) {
      return true;
    }
    return scannable
      .split('**')
      .some((segment, index) => index % 2 === 1 && segment.trim() === name);
  });
}

const nativeExecutableSentence =
  '- Pipes work normally; `rg`/`git`/`node` and other native exes run as-is — only the *shell builtins* differ. (`rg --files src | rg pattern` is fine.)';

describe('canonical tool reference matcher', () => {
  it('distinguishes the documented native executable list from a tool directive', () => {
    expect(mentions(nativeExecutableSentence, 'git')).toBe(false);
  });

  it.each([
    'Use the `git` tool.',
    `${nativeExecutableSentence} Use the \`git\` tool.`,
    '## Shell — PowerShell\nUse the `git` tool.\n## Other\nDone.',
    '- Pipes work normally; `rg`/`git`/`read` and other native exes run as-is.',
    `${nativeExecutableSentence} Use **git**.`,
    '`git status` through a tool',
  ])('detects a forbidden reference in %s', (text) => {
    const name = text.includes('`read`') ? 'read' : 'git';
    expect(RUNTIME_CAPABILITY_MANIFEST.flatMap((entry) => entry.tools)).toContain(name);
    expect(mentions(text, name)).toBe(true);
  });

  it.each([
    'Use the `git`/`read` tools.',
    `${nativeExecutableSentence} Use the \`git\`/\`read\` tools.`,
  ])('does not exempt executable-shaped lists in tool directives: %s', (text) => {
    expect(mentions(text, 'git')).toBe(true);
  });

  it('preserves canonical-name boundaries and XML tag exclusions', () => {
    expect(mentions('`git-extra` **git-extra**', 'git')).toBe(false);
    expect(mentions('`<git>` `</git>`', 'git')).toBe(false);
    expect(mentions('`tool_use`', 'tool_use')).toBe(true);
    expect(mentions('**tool_use**', 'tool_use')).toBe(true);
  });
});

describe('DefaultSystemPromptBuilder canonical tool references', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-prompt-refs-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('keeps the fully assembled prompt free of unregistered canonical tool references', async () => {
    const canonical = new Set(RUNTIME_CAPABILITY_MANIFEST.flatMap((entry) => entry.tools));
    const leaks: string[] = [];
    for (const only of canonical) {
      const tools = [createMockTool({ name: only })];
      const builder = new DefaultSystemPromptBuilder({ todayIso: '2026-05-13' });
      const blocks = await builder.build({
        cwd: tmp,
        projectRoot: tmp,
        tools,
        catalogTools: tools,
      });
      const prompt = blocks.map((block) => block.text).join('\n');
      for (const hidden of canonical) {
        if (hidden !== only && mentions(prompt, hidden)) leaks.push(`${only} exposed ${hidden}`);
      }
    }
    expect(leaks, 'assembled singleton prompts leaked unregistered canonical tools').toEqual([]);
  });
});
