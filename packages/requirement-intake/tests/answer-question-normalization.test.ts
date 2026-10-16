/**
 * `answerInputSchema` normalizes the optional `question` field: a provided
 * question is kept (trimmed), a blank one collapses to `undefined`.
 */
import { describe, expect, it } from 'vitest';
import { validateAnswerInput } from '../src/validation.js';

describe('answer question normalization', () => {
  it('keeps a provided question', () => {
    const parsed = validateAnswerInput({
      field: 'constraints',
      answer: 'rust',
      question: 'Any constraints?',
    });
    expect(parsed.question).toBe('Any constraints?');
  });

  it('drops a whitespace-only question to undefined', () => {
    const parsed = validateAnswerInput({
      field: 'constraints',
      answer: 'rust',
      question: '   ',
    });
    expect(parsed.question).toBeUndefined();
  });
});
