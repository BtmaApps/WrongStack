import { describe, expect, it } from 'vitest';
import {
  appendToDraft,
  desktopCommands,
  fileMention,
  parseDesktopCommand,
  referenceMessage,
  renderPromptTemplate,
  splitReferenceMessage,
} from '../src/composer-resources-model';

describe('desktop composer project resources', () => {
  it('appends templates without replacing an unsent draft and fills only explicit variables', () => {
    expect(appendToDraft('Keep my work.\n', 'New template')).toBe('Keep my work.\n\nNew template');
    expect(
      renderPromptTemplate('Review {{target}} with {{missing}} and {{constructor}}.', {
        target: 'src/main.ts',
      }),
    ).toBe('Review src/main.ts with {{missing}} and {{constructor}}.');
  });
  it('keeps project-file references explicit, complete-read scoped and human-readable after roundtrip', () => {
    const payload = referenceMessage(
      'Review this file.',
      [{ path: 'src/file with spaces.ts' }, { path: 'src/file with spaces.ts' }],
      '\\\\?\\D:\\Projects\\Example',
    );
    expect(payload).toContain('Project root: "D:/Projects/Example"');
    expect(payload).toContain('Continue paginated reads until EOF');
    expect(splitReferenceMessage(payload)).toEqual({
      text: 'Review this file.',
      paths: ['src/file with spaces.ts'],
    });
    expect(referenceMessage('Plain input', [], 'D:/Example')).toBe('Plain input');
    expect(splitReferenceMessage('[Project file references]\n- bad JSON')).toEqual({
      text: '[Project file references]\n- bad JSON',
      paths: [],
    });
  });
  it('only opens file mentions in prose at the caret and preserves surrounding paragraphs', () => {
    expect(fileMention('Read @src/fi', 12)).toEqual({ start: 5, end: 12, query: 'src/fi' });
    for (const value of [
      'mail@example.com',
      'Use `@file',
      '```ts\n@file',
      '~~~\n@file',
      'Escaped \\@file',
    ])
      expect(fileMention(value, value.length)).toBeNull();
    expect(fileMention('```\ncode\n```\n@src', 18)?.query).toBe('src');
  });
  it('routes native slash commands deliberately and leaves literal paths alone', () => {
    expect(parseDesktopCommand('/queue review the API')).toEqual({
      action: 'queue',
      argument: 'review the API',
    });
    expect(parseDesktopCommand('/abort')).toEqual({ action: 'stop', argument: '' });
    expect(parseDesktopCommand('/compact!')).toEqual({
      action: 'compact-aggressive',
      argument: '',
    });
    expect(parseDesktopCommand('/not-implemented')).toEqual({ action: 'unknown', argument: '' });
    expect(parseDesktopCommand('//help')).toBeNull();
    expect(parseDesktopCommand('/src/main.ts')).toBeNull();
    expect(new Set(desktopCommands.map((command) => command.name)).size).toBe(
      desktopCommands.length,
    );
  });
});
