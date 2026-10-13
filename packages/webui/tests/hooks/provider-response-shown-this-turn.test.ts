/**
 * An ACP agent leading the session streams text, its tool cards close each
 * message, and its single response lands after the last card: the response
 * is the turn's text, already on screen, and must not be printed again. An
 * ordinary model whose later step repeats an earlier phrase still shows it.
 */
import { describe, expect, it } from 'vitest';
import { shownThisTurn } from '../../src/hooks/ws-handlers/session-execution-handlers';

const turn = [
  { role: 'user', content: 'fix the bug' },
  { role: 'assistant', content: 'Let me read the file.' },
  { role: 'tool', content: 'line 1' },
  { role: 'assistant', content: 'Fixed it.' },
  { role: 'tool', content: 'ok' },
];

describe('shownThisTurn', () => {
  it("recognises a response that is the turn's text, already shown", () => {
    expect(shownThisTurn(turn, 'Let me read the file.\nFixed it.')).toBe(true);
    expect(shownThisTurn(turn, 'Let me read the file.\n\n  Fixed it.  ')).toBe(true);
  });

  it('shows anything else, and looks no further back than the last user message', () => {
    expect(shownThisTurn(turn, 'Fixed it.')).toBe(false);
    expect(shownThisTurn(turn, 'Something new.')).toBe(false);
    expect(shownThisTurn([...turn, { role: 'user', content: 'again' }], 'Fixed it.')).toBe(false);
    expect(shownThisTurn([], 'hi')).toBe(false);
  });
});
