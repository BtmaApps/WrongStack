import { describe, expect, it } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import { buildTodosCommand } from '../src/slash-commands/todos.js';

/**
 * Regression: the /todos description documents `rm <id|index>` and the
 * dispatcher implements it (grouped with `remove`), but the unknownSubcommand
 * Valid list omitted it — so a typo'd subcommand advertised a Valid list that
 * contradicted both the documented and the implemented surface. Same drift
 * class as the /memory `gather` and `compact-log`/`diagnostics` omissions and
 * the /kanban `column` ghost entry (valid-list drift audit convention, 2026-09-07):
 * every IMPLEMENTED and description-documented subcommand must appear in the
 * Valid list. Undocumented aliases stay unlisted per convention.
 */

/** Names the /todos description string itself documents. */
const DOCUMENTED_SUBCOMMANDS = ['show', 'clear', 'add', 'done', 'remove', 'rm'] as const;

function emptyCtx(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    config: {} as never,
    container: {} as never,
    onDiag: undefined,
    onStats: undefined,
    memoryStore: undefined,
    context: undefined,
    ...overrides,
  } as never as SlashCommandContext;
}

function makeCtx(initialTodos: Array<{ id: string; content: string; status: string }> = []) {
  const todos = [...initialTodos];
  return {
    todos,
    state: {
      replaceTodos(next: typeof todos) {
        todos.length = 0;
        todos.push(...next);
      },
    },
  };
}

describe('buildTodosCommand valid-list drift', () => {
  it('unknown-subcommand help advertises every description-documented subcommand', async () => {
    const cmd = buildTodosCommand(emptyCtx({ context: makeCtx() as never }));
    const res = await cmd.run('frobnicate');
    const message = res?.message ?? '';
    expect(message).toContain('Unknown subcommand "frobnicate"');
    for (const name of DOCUMENTED_SUBCOMMANDS) {
      expect(message, `Valid list must advertise documented subcommand "${name}"`).toContain(name);
    }
  });

  // Round 39: the Valid list omitted four subcommands the switch IMPLEMENTS as
  // real cases — `list` (L54, with `show`), `complete` (L102, with `done`),
  // `complete-all` (L83, with `done-all`) and `delete` (L130, with `remove`/`rm`).
  // A typo'd subcommand therefore advertised a list contradicting the real surface.
  const IMPLEMENTED_ALIASES = ['list', 'complete', 'complete-all', 'delete'] as const;

  it('advertises every implemented subcommand, including the four omitted aliases', async () => {
    const cmd = buildTodosCommand(emptyCtx({ context: makeCtx() as never }));
    const message = (await cmd.run('frobnicate'))?.message ?? '';
    for (const name of IMPLEMENTED_ALIASES) {
      expect(message, `Valid list must advertise implemented subcommand "${name}"`).toContain(name);
    }
  });

  it.each(IMPLEMENTED_ALIASES)('%s is implemented, not a phantom entry', async (name) => {
    // Proves each advertised alias really is a live switch case: the Valid list
    // must describe the dispatcher's actual surface, not invented names.
    // The argument is required: `complete`/`delete` reject a bare alias with
    // their branch's own Usage line, which would look like a dead branch here.
    const ctx = makeCtx([
      { id: 't1', content: 'alpha', status: 'pending' },
      { id: 't2', content: 'beta', status: 'pending' },
    ]);
    const cmd = buildTodosCommand(emptyCtx({ context: ctx as never }));
    const message = (await cmd.run(`${name} 1`))?.message ?? '';
    // Every alias maps onto one of the four real branches; none may fall through
    // to the unknown-subcommand default.
    expect(message).not.toContain('Unknown subcommand');
    expect(message).not.toMatch(/^Usage:/);
  });

  it('rm is not just advertised — it removes a todo by 1-based index', async () => {
    const ctx = makeCtx([{ id: 't1', content: 'first', status: 'pending' }]);
    const cmd = buildTodosCommand(emptyCtx({ context: ctx as never }));
    const res = await cmd.run('rm 1');
    expect(res?.message ?? '').toContain('Removed: first');
    expect(ctx.todos).toHaveLength(0);
  });
});
