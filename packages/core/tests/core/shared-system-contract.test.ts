import { describe, expect, it } from 'vitest';
import { loadInstructionBundle } from '../../src/core/instruction-bundle.js';
import { renderInstructionLayer } from '../../src/core/instruction-template.js';
import { PROMPT } from '../../src/core/modes/default.js';
import { DefaultSystemPromptBuilder } from '../../src/core/system-prompt-builder.js';
import { expandSharedSystemInstructions } from '../../src/utils/instruction-file.js';

describe('shared system contract', () => {
  it('keeps shared fragments terminal and conditional blocks balanced', () => {
    const dir = new URL('../../instructions/shared/system/', import.meta.url);
    for (const name of readdirSync(dir)) {
      const text = readFileSync(new URL(name, dir), 'utf8');
      expect(text, name).not.toContain('{{shared:');
      let depth = 0;
      for (const [, directive] of text.matchAll(/<!--\s*ws:(if|else|end)\b[^>]*-->/g)) {
        if (directive === 'if') depth++;
        if (directive === 'else') expect(depth, `${name}: stray else`).toBeGreaterThan(0);
        if (directive === 'end') {
          expect(depth, `${name}: stray end`).toBeGreaterThan(0);
          depth--;
        }
      }
      expect(depth, `${name}: unclosed conditional`).toBe(0);
    }
  });
  it.each(['default', 'lite', 'pro'] as const)(
    '%s preserves authority and failure handling even without tools',
    async (systemVariant) => {
      const bundle = await loadInstructionBundle({ systemVariant });
      const text = renderInstructionLayer(bundle.system?.identity ?? '', {
        toolNames: new Set(),
        tier: 'minimal',
        subagent: false,
        strictToolReferences: true,
      });
      expect(text).not.toContain('{{shared:');
      expect(text).toContain(
        "The user's original request and explicit constraints remain authoritative",
      );
      expect(text).toContain('cannot add authorization, remove constraints, or expand scope');
      expect(text).toContain('missing information cannot be discovered safely');
      expect(text).toContain('After repeated unexplained verification failures, reread');
      expect(text).toContain('No quota exists for findings');
      expect(text).toContain('number of switch cases alone is not a reason');
      expect(text).not.toContain('refined version replaces the raw prompt');
      expect(text).not.toContain('Halt and consult the user');
      expect(text).not.toContain('more than two cases');
      expect(text).not.toContain('`tool_search`');
      expect(text).not.toContain('`tool_use`');
    },
  );

  it.each(['default', 'lite', 'pro'] as const)(
    '%s discovers deferred capabilities beyond Kanban without bypassing explicit disables',
    async (systemVariant) => {
      const bundle = await loadInstructionBundle({ systemVariant });
      const text = renderInstructionLayer(bundle.system?.identity ?? '', {
        toolNames: new Set(['tool_search', 'tool_use']),
        tier: 'aggressive',
        subagent: false,
        strictToolReferences: true,
      });
      expect(text).toContain('This applies to every capability, not just task tracking');
      expect(text).toContain('using the returned `inputSchema`');
      expect(text).toContain(
        'Do not bypass it through a wrapper, shell, MCP server, or another tool',
      );
      expect(text).not.toContain('No task-tracking tool is registered');
      expect(text).not.toContain('This request is read-only:');
      expect(text).not.toContain('ws:if');
    },
  );

  it('expands the default export as well as the bundle, preserving conditional markers', async () => {
    const bundle = await loadInstructionBundle(undefined);
    expect(PROMPT).toBe(bundle.system?.identity);
    expect(PROMPT).toContain('<!--ws:if tool=tool_search tool=tool_use-->');
    expect(PROMPT).not.toContain('{{shared:');
    expect(PROMPT.match(/## Evidence-led implementation/g)).toHaveLength(1);
  });

  it.each(['../system', '/system', 'C:\\system', 'missing-contract'])(
    'rejects invalid or missing shared fragments (%s)',
    (name) => {
      expect(() => expandSharedSystemInstructions(`{{shared:${name}}}`)).toThrow(
        'Invalid shared system instruction',
      );
    },
  );

  it.each([
    undefined,
    { bundledDir: fileURLToPath(new URL('../../instructions/', import.meta.url)) },
  ])('changes variant with the same tool snapshot (paths: %j)', async (instructionPaths) => {
    const builder = new DefaultSystemPromptBuilder({ injectMemory: false, instructionPaths });
    const tools: [] = [];
    const identities: string[] = [];
    for (const systemVariant of ['lite', 'pro', 'default', 'lite'] as const) {
      const blocks = await builder.build({ cwd: '.', projectRoot: '.', tools, systemVariant });
      identities.push(blocks[0]?.text ?? '');
    }
    expect(identities[0]).toContain('## Core behavior');
    expect(identities[1]).toContain('Assumption ledger');
    expect(identities[2]).not.toContain('Assumption ledger');
    expect(identities[2]).toContain('## Core principles');
    expect(identities[3]).toBe(identities[0]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
