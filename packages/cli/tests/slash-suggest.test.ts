import type { Context } from '@wrongstack/core/agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSuggestions,
  getAutoSuggestions,
  getSuggestions,
  setAutoSuggestions,
} from '../src/services/suggestion-store.js';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import { buildNextCommand } from '../src/slash-commands/next.js';
import { buildSuggestCommand } from '../src/slash-commands/suggest.js';

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

beforeEach(() => clearSuggestions());

function makeContext(result: string): {
  context: SlashCommandContext;
  onSuggestions: ReturnType<typeof vi.fn>;
  getTask: () => string;
} {
  let task = '';
  const onSuggestions = vi.fn((suggestions?: string[]) => suggestions ?? []);
  const context = {
    cwd: process.cwd(),
    projectRoot: process.cwd(),
    renderer: { write: vi.fn(), writeWarning: vi.fn() },
    onSpawnAndWait: vi.fn(async (description: string) => {
      task = description;
      return result;
    }),
    onSuggestions,
  } as never as SlashCommandContext;
  return { context, onSuggestions, getTask: () => task };
}

describe('/suggest prompt contract', () => {
  it.each(['--fast', '-f', '--fresh --fast'])('uses no LLM for the %s flag', async (args) => {
    const { context } = makeContext('1. This model must not run');
    await buildSuggestCommand(context).run!(args);
    expect(context.onSpawnAndWait).not.toHaveBeenCalled();
  });

  it("does not reuse another command instance's generated prompts", async () => {
    const first = makeContext('1. Inspect the first session parser');
    const second = makeContext('1. Inspect the second session layout');
    await buildSuggestCommand(first.context).run!('--fresh');
    await buildSuggestCommand(second.context).run!('');
    expect(second.context.onSpawnAndWait).toHaveBeenCalledOnce();
    expect(second.onSuggestions).toHaveBeenLastCalledWith(['Inspect the second session layout']);
  });

  it('caches an empty fresh result instead of resurrecting older prompts', async () => {
    const { context, onSuggestions } = makeContext('1. Inspect the old parser');
    const spawn = vi.mocked(context.onSpawnAndWait!);
    spawn.mockResolvedValueOnce('1. Inspect the old parser').mockResolvedValueOnce('NONE');
    const command = buildSuggestCommand(context);
    await command.run!('--fresh');
    await command.run!('--fresh');
    await command.run!('');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(onSuggestions).toHaveBeenLastCalledWith([]);
    expect(getSuggestions()).toEqual([]);
  });

  it("invalidates the same command's cache when its conversation changes", async () => {
    const { context } = makeContext('1. Inspect the current parser');
    const command = buildSuggestCommand(context);
    const runtime = { session: { id: 'first' } } as Context;
    await command.run!('--fresh', runtime);
    await command.run!('', runtime);
    expect(context.onSpawnAndWait).toHaveBeenCalledOnce();
    runtime.session = { ...runtime.session!, id: 'second' };
    await command.run!('', runtime);
    expect(context.onSpawnAndWait).toHaveBeenCalledTimes(2);
  });

  it('does not let an older generation overwrite a newer suggestion list', async () => {
    const { context, onSuggestions } = makeContext('1. Inspect the new parser');
    let finishOld!: (text: string) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const oldResult = new Promise<string>((resolve) => {
      finishOld = resolve;
    });
    vi.mocked(context.onSpawnAndWait!).mockImplementationOnce(async () => {
      entered();
      return oldResult;
    });
    const command = buildSuggestCommand(context);
    const first = command.run!('--fresh');
    await started;
    await command.run!('--fresh');
    finishOld('1. Inspect the stale parser');
    await first;
    expect(onSuggestions).toHaveBeenCalledTimes(1);
    expect(getSuggestions()).toEqual(['Inspect the new parser']);
  });

  it('refreshes suggestions after a new conversation turn', async () => {
    const { context } = makeContext('1. Inspect the current parser');
    const command = buildSuggestCommand(context);
    const runtime = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'First task' }] }],
    } as Context;
    await command.run!('--fresh', runtime);
    await command.run!('', runtime);
    expect(context.onSpawnAndWait).toHaveBeenCalledOnce();
    runtime.messages = [{ role: 'user', content: [{ type: 'text', text: 'Second task' }] }];
    await command.run!('', runtime);
    expect(context.onSpawnAndWait).toHaveBeenCalledTimes(2);
  });

  it('clears stale auto-submit prompts when explicitly regenerating suggestions', async () => {
    const { context } = makeContext('1. Inspect the new parser');
    setAutoSuggestions(['Execute the old action']);
    await buildSuggestCommand(context).run!('--fresh');
    expect(getAutoSuggestions()).toEqual([]);
  });

  it('passes the selected Turkish prompt to the next LLM turn verbatim', async () => {
    const text = 'Parserdaki "iki  boşluk" davranışını incele ve sonucunu raporla.';
    const { context } = makeContext(`1. ${text}`);
    await buildSuggestCommand(context).run!('--fresh');
    const selected = await buildNextCommand(context).run!('1');
    expect(selected?.runText).toBe(text);
    expect(getSuggestions()).toEqual([]);
  });

  it.each([
    'Open DevTools yourself and send me the error.',
    'I cannot inspect this project because context is missing.',
  ])('does not promote unstructured prose into a selectable prompt (%s)', async (result) => {
    const { context, onSuggestions } = makeContext(result);
    await buildSuggestCommand(context).run!('--fresh');
    expect(onSuggestions).toHaveBeenLastCalledWith([]);
  });

  it('does not mistake a no-further-steps phrase inside a valid prompt for NONE', async () => {
    const text = 'Remove the compulsory "no further steps" closing sentence from the prompt.';
    const { context, onSuggestions } = makeContext(`1. ${text}`);
    await buildSuggestCommand(context).run!('--fresh');
    expect(onSuggestions).toHaveBeenLastCalledWith([text]);
  });

  it('asks for exact agent-directed TUI/WebUI prompt messages', async () => {
    const { context, onSuggestions, getTask } = makeContext(
      '1. Run the focused tests and fix any failures\n2. Review the diff and implement corrections',
    );

    await buildSuggestCommand(context).run!('--fresh');

    expect(getTask()).toContain('submit back to the coding agent through the');
    expect(getTask()).toContain('TUI or WebUI');
    expect(getTask()).toContain('Never output a human-only chore');
    expect(getTask()).toContain('The recipient is the LLM, not the user');
    expect(getTask()).toContain('Omit approval requests, questions for the user');
    expect(onSuggestions).toHaveBeenCalledWith([
      'Run the focused tests and fix any failures',
      'Review the diff and implement corrections',
    ]);
  });

  it.each(['NONE', 'No pending actions — everything is up to date.'])(
    'does not store no-op status text as a selectable prompt: %s',
    async (result) => {
      const { context, onSuggestions } = makeContext(result);

      const response = await buildSuggestCommand(context).run!('--fresh');

      expect(onSuggestions).toHaveBeenCalledWith([]);
      expect(stripAnsi(response?.message ?? '')).toContain('No suggestions available.');
    },
  );
});
