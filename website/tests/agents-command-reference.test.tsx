import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandDetails } from '../src/data/command-details';
import { commands } from '../src/data/content-commands';

/**
 * The website's `/agents` reference must name only the actions the CLI
 * actually implements.
 *
 * Ground truth is derived from source, never hardcoded here:
 *   - packages/cli/src/slash-commands/agents.ts — the registered `/agents`
 *     command (registered at packages/cli/src/slash-commands/index.ts).
 *   - packages/tui/src/hooks/use-core-tui-commands.ts — the TUI wrapper that
 *     owns bare `/agents` and `/agents monitor`.
 *
 * The registry previously advertised `/agents chat compact` and
 * `/agents timeline`. Neither exists: the CLI accepts `chat off|full|status`
 * and `stream on|off|status` only, and there is no `timeline` subcommand at
 * all. This test derives the accepted set from the source so the same drift
 * cannot reappear silently.
 */

const websiteRoot = process.cwd();
const repoRoot = resolve(websiteRoot, '..');

const CLI_SOURCE = readFileSync(
  resolve(repoRoot, 'packages/cli/src/slash-commands/agents.ts'),
  'utf8',
);
const TUI_SOURCE = readFileSync(
  resolve(repoRoot, 'packages/tui/src/hooks/use-core-tui-commands.ts'),
  'utf8',
);

/**
 * Labels of the `switch (cmd)` cases only. The command nests a second
 * switch inside `case 'stream'`, so a flat `case '...'` scan would also pick
 * up the nested `on` / `off` verbs. This tracks brace depth (ignoring braces
 * inside string and template literals) so only direct children of the switch
 * are returned.
 */
function topLevelCaseLabels(source: string, switchHeader: string): string[] {
  const headerIndex = source.indexOf(switchHeader);
  if (headerIndex < 0) return [];
  const labels: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let i = headerIndex + switchHeader.length - 1; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && source.startsWith("case '", i)) {
      const match = /^case '([^']+)'/.exec(source.slice(i));
      if (match) {
        labels.push(match[1]);
        i += match[0].length - 1;
      }
    }
  }
  return labels;
}

/** The verbs the CLI accepts for a nested switch, taken from its own usage string. */
function acceptedVerbs(source: string, switchHeader: string, command: string): Set<string> {
  const usage = new RegExp(`Usage: \`/agents ${command} ([^\`]+)\``).exec(source);
  if (!usage) return new Set();
  return new Set(usage[1].split('|').map((verb) => verb.trim()).filter(Boolean));
}

/** Verbs the TUI wrapper answers itself, before delegating to the CLI command. */
function tuiOwnedForms(source: string): Set<string> {
  const forms = new Set<string>();
  for (const match of source.matchAll(/arg === '([^']+)'/g)) {
    forms.add(match[1]);
  }
  return forms;
}

const cliActions = new Set(topLevelCaseLabels(CLI_SOURCE, 'switch (cmd) {'));
const tuiForms = tuiOwnedForms(TUI_SOURCE);
const acceptedActions = new Set([...cliActions, ...tuiForms]);
const chatVerbs = acceptedVerbs(CLI_SOURCE, 'switch (cmd) {', 'chat');
const streamVerbs = acceptedVerbs(CLI_SOURCE, 'switch (cmd) {', 'stream');

/** Every `/agents <action>` the website states, across the catalog and the detail page. */
function advertisedActions(): string[] {
  const entry = commands.find((command) => command.name === '/agents');
  const detail = commandDetails['/agents'];
  expect(entry, 'the /agents catalog entry must exist').toBeDefined();
  expect(detail, 'the /agents rich detail must exist').toBeDefined();

  const text = [
    entry?.summary ?? '',
    ...(entry?.usage ?? []),
    detail.purpose,
    detail.behavior,
    detail.before,
    detail.during,
    detail.after,
  ].join('\n');

  const actions: string[] = [];
  for (const match of text.matchAll(/\/agents\s+([a-z]+)/g)) {
    actions.push(match[1]);
  }
  return actions;
}

/** Every `/agents <command> <verbs>` the website states. */
function advertisedVerbs(command: string): string[] {
  const entry = commands.find((candidate) => candidate.name === '/agents');
  const detail = commandDetails['/agents'];
  const text = [
    entry?.summary ?? '',
    ...(entry?.usage ?? []),
    detail.purpose,
    detail.behavior,
    detail.before,
    detail.during,
    detail.after,
  ].join('\n');

  const verbs: string[] = [];
  for (const match of text.matchAll(new RegExp(`/agents\\s+${command}\\s+([^\\s\`]+)`, 'g'))) {
    verbs.push(...match[1].split('|').map((verb) => verb.trim()).filter(Boolean));
  }
  return verbs;
}

describe('website /agents reference', () => {
  it('derives a non-empty action set from the CLI source', () => {
    // Non-vacuity: if the derivation broke, every assertion below would pass
    // for the wrong reason.
    expect(cliActions.size).toBeGreaterThan(0);
    expect([...cliActions].sort()).toEqual([
      'chat',
      'help',
      'list',
      'show',
      'status',
      'stream',
    ]);
    // The nested `stream` switch must not leak its verbs into the top level.
    expect(cliActions.has('on')).toBe(false);
    expect(cliActions.has('off')).toBe(false);
    expect(tuiForms.has('monitor')).toBe(true);
  });

  it('names only the actions the CLI and the TUI wrapper implement', () => {
    const advertised = advertisedActions();
    expect(advertised.length).toBeGreaterThan(0);
    for (const action of advertised) {
      expect(
        acceptedActions.has(action),
        `/agents ${action} is not implemented — the CLI accepts ${[...cliActions].sort().join(', ')} and the TUI wrapper adds ${[...tuiForms].sort().join(', ')}`,
      ).toBe(true);
    }
  });

  it('advertises only chat and stream verbs the CLI accepts', () => {
    expect(chatVerbs.size).toBeGreaterThan(0);
    expect(streamVerbs.size).toBeGreaterThan(0);
    for (const verb of advertisedVerbs('chat')) {
      expect(chatVerbs.has(verb), `/agents chat ${verb} is not accepted`).toBe(true);
    }
    for (const verb of advertisedVerbs('stream')) {
      expect(streamVerbs.has(verb), `/agents stream ${verb} is not accepted`).toBe(true);
    }
  });

  it('does not advertise the removed chat verb or a timeline subcommand', () => {
    const entry = commands.find((command) => command.name === '/agents');
    const detail = commandDetails['/agents'];
    const text = [
      entry?.summary ?? '',
      ...(entry?.usage ?? []),
      detail.purpose,
      detail.behavior,
      detail.before,
      detail.during,
      detail.after,
    ].join('\n');

    expect(text).not.toContain('compact');
    expect(text).not.toContain('timeline');
  });
});
