/**
 * A role's `config.json` narrows it (tools, budget) and users create it by
 * hand, so it must load when Notepad or PowerShell 5 saved it with a BOM.
 * Dropping it would run the role with the catalog's wider tool list.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProjectAgentConfig } from '../../src/coordination/agents/project-agent-config-io.js';
import { roleDir } from '../../src/coordination/agents/project-agent-paths.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-agent-config-io-'));
  roots.push(root);
  const dir = roleDir('my-auditor', root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), content, 'utf8');
  return root;
}

describe('loadProjectAgentConfig', () => {
  it('keeps a hand-saved config that starts with a UTF-8 BOM', () => {
    const root = writeConfig(
      `\uFEFF${JSON.stringify({ tools: ['read', 'grep'], budget: { maxCostUsd: 0.5 } })}`,
    );
    expect(loadProjectAgentConfig('my-auditor', root)).toMatchObject({
      tools: ['read', 'grep'],
      budget: { maxCostUsd: 0.5 },
    });
  });

  it('still ignores a config that is not valid JSON', () => {
    const root = writeConfig('\uFEFF{broken');
    expect(loadProjectAgentConfig('my-auditor', root)).toBeUndefined();
  });
});
