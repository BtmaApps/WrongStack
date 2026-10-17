import { describe, expect, it } from 'vitest';
import {
  fillPrompt,
  promptSlug,
  promptVariables,
  resourceMatches,
} from '../src/lib/resource-model';
import { acceptsPanelReply } from '../src/lib/use-panel-requests';

describe('shared resource workflows', () => {
  it('fills named prompt variables literally while retaining unknown placeholders', () => {
    expect(
      fillPrompt('Review {{ target }} and {{missing}}; {{target}}', {
        target: '$testing $& src/app.tsx',
      }),
    ).toBe('Review $testing $& src/app.tsx and {{missing}}; $testing $& src/app.tsx');
  });
  it('detects prompt identifier collisions using the backend title rules', () => {
    expect(promptSlug(' Review a target! ')).toBe('review-a-target');
    expect(promptSlug('Review / a target')).toBe(promptSlug('Review a target'));
    expect(promptSlug('????')).toBe('prompt');
  });
  it('accepts only well-formed variable metadata and searches labels, tags and owners', () => {
    expect(
      promptVariables([
        { name: 'target', required: true, default: 'src', enum: ['src', 42] },
        { name: 42 },
      ]),
    ).toEqual([
      { name: 'target', required: true, defaultValue: 'src', description: '', options: ['src'] },
    ]);
    expect(
      resourceMatches({ title: 'Review', tags: ['quality'], owner: 'Core' }, ' QUALITY '),
    ).toBe(true);
    expect(resourceMatches({ name: 'read_file', description: {} }, 'missing')).toBe(false);
  });
  it('rejects stale correlated replies and unrelated named resource responses', () => {
    const accept = (p: Record<string, unknown>) => p.name === 'testing';
    expect(
      acceptsPanelReply(
        { type: 'skills.content', payload: { requestId: 'old', name: 'testing' } },
        'skills.content',
        'new',
        accept,
      ),
    ).toBe(false);
    expect(
      acceptsPanelReply(
        { type: 'skills.content', payload: { name: 'wrong' } },
        'skills.content',
        'new',
        accept,
      ),
    ).toBe(false);
    expect(
      acceptsPanelReply(
        { type: 'skills.content', payload: { name: 'testing' } },
        'skills.content',
        'new',
        accept,
      ),
    ).toBe(true);
    expect(acceptsPanelReply({ type: 'error', payload: {} }, 'skills.content', 'new', accept)).toBe(
      false,
    );
  });
});
