/**
 * parseSuggestionsFromOutput owns the auto="true" store for the turn it parses:
 * an auto prompt must never outlive the <nextsteps> block it came from, because
 * the YOLO+auto loop (repl.ts) prefers the auto store over fresh suggestions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseSuggestionsFromOutput } from '../src/repl-suggestions.js';
import { clearSuggestions, getAutoSuggestions } from '../src/services/suggestion-store.js';

const withAuto =
  'Done.\n\n<nextsteps>\n1. Run the parser tests auto="true"\n2. Update docs\n</nextsteps>';
const withoutAuto =
  'Done.\n\n<nextsteps>\n1. Review the new diff\n2. Commit the change\n</nextsteps>';

beforeEach(() => {
  clearSuggestions();
});

describe('parseSuggestionsFromOutput auto suggestions', () => {
  it('arms the auto store from an auto="true" item', () => {
    expect(parseSuggestionsFromOutput(withAuto, [])).toEqual([
      'Run the parser tests',
      'Update docs',
    ]);
    expect(getAutoSuggestions()).toEqual(['Run the parser tests']);
  });

  it('drops an earlier auto prompt when the next block has no auto item', () => {
    parseSuggestionsFromOutput(withAuto, []);
    expect(parseSuggestionsFromOutput(withoutAuto, [])).toEqual([
      'Review the new diff',
      'Commit the change',
    ]);
    expect(getAutoSuggestions()).toEqual([]);
  });

  it('drops an earlier auto prompt when the next turn has no nextsteps block', () => {
    parseSuggestionsFromOutput(withAuto, []);
    expect(parseSuggestionsFromOutput('All finished.', [])).toBeNull();
    expect(getAutoSuggestions()).toEqual([]);
  });

  it('suppresses suggestions and clears the auto store while todos are open', () => {
    parseSuggestionsFromOutput(withAuto, []);
    const todos = [{ id: '1', content: 'finish', status: 'in_progress' as const }];
    expect(parseSuggestionsFromOutput(withAuto, todos)).toBeNull();
    expect(getAutoSuggestions()).toEqual([]);
  });
});
