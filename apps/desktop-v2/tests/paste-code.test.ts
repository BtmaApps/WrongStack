import { describe, expect, it } from 'vitest';
import { fencePaste, insideFence, pastedCode, pastedText } from '../src/paste-code';

describe('pasted code detection', () => {
  it('recognises multi-line code and names only unambiguous languages', () => {
    expect(pastedCode('const a = 1;\nexport function f() {\n  return a;\n}')).toEqual({
      language: '',
    });
    expect(pastedCode('def total(items):\n    return sum(items)\n')).toEqual({
      language: 'python',
    });
    expect(pastedCode('{\n  "name": "x",\n  "private": true\n}')).toEqual({ language: 'json' });
    expect(pastedCode('fn main() {\n    let mut x = 1;\n}')).toEqual({ language: 'rust' });
    expect(pastedCode('package main\n\nfunc main() {\n}')).toEqual({ language: 'go' });
    expect(pastedCode('#!/usr/bin/env bash\nset -e\n  echo hi')).toEqual({ language: 'bash' });
  });
  it('leaves prose, single lines and already fenced text alone', () => {
    expect(pastedCode('Please review the parser.\nIt fails on empty input.')).toBeNull();
    expect(pastedCode('const a = 1;')).toBeNull();
    expect(pastedCode('```ts\nconst a = 1;\nconst b = 2;\n```')).toBeNull();
    expect(pastedCode('- first item;\nSome notes about it.\nMore prose here.')).toBeNull();
  });
  it('normalises clipboard line breaks the way a textarea stores them', () => {
    expect(pastedText('def f():\r\n    return 1\r\n')).toBe('def f():\n    return 1\n');
    expect(pastedText('a\rb')).toBe('a\nb');
  });
  it('knows when the caret is inside an open fence', () => {
    expect(insideFence('Look:\n```ts\nconst a', 18)).toBe(true);
    expect(insideFence('```\nx\n```\nafter', 14)).toBe(false);
  });
});

describe('fencing a paste', () => {
  it('wraps only the pasted range, on its own lines', () => {
    const draft = 'Fix this:const a = 1;\nconst b = 2;\nthanks';
    const pasted = 'const a = 1;\nconst b = 2;\n';
    const result = fencePaste(draft, 9, pasted, 'ts');
    expect(result.text).toBe('Fix this:\n```ts\nconst a = 1;\nconst b = 2;\n```\nthanks');
    expect(result.text.slice(0, result.cursor)).toBe(
      'Fix this:\n```ts\nconst a = 1;\nconst b = 2;\n```\n',
    );
  });
  it('uses a fence longer than any backtick run in the code', () => {
    const pasted = 'const s = `a`;\nconst t = ```;';
    expect(fencePaste(pasted, 0, pasted, '').text).toBe(`\`\`\`\`\n${pasted}\n\`\`\`\`\n`);
  });
});
